import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { ChatService, ChatCompletionForm } from '../services/chat-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const chatCompletionSchema = z.object({
  model: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string()
    })
  ),
  chat_id: z.string().optional(),
  stream: z.boolean().optional(),
  params: z.record(z.unknown()).optional()
});

export function registerChatCompletionRoutes(app: FastifyInstance, chatService: ChatService): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = chatCompletionSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
          retryable: false
        })
      );
    }

    const form: ChatCompletionForm = {
      model: parseResult.data.model || 'protokol7/extractor-ai',
      messages: parseResult.data.messages,
      stream: parseResult.data.stream !== false
    };
    if (parseResult.data.chat_id !== undefined) form.chat_id = parseResult.data.chat_id;
    if (parseResult.data.params !== undefined) form.params = parseResult.data.params;

    const completionId = `chatcmpl-${randomUUID()}`;
    const createdTimestamp = Math.floor(Date.now() / 1000);

    if (form.stream) {
      // Setup SSE Stream headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': request.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true'
      });

      try {
        await chatService.processChatCompletion(userId, tenantId, form, {
          onStatus: (statusText) => {
            const statusChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: createdTimestamp,
              model: form.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: '',
                    status: statusText
                  },
                  finish_reason: null
                }
              ]
            };
            reply.raw.write(`data: ${JSON.stringify(statusChunk)}\n\n`);
          },
          onDelta: (tokenDelta) => {
            const chunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: createdTimestamp,
              model: form.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: tokenDelta
                  },
                  finish_reason: null
                }
              ]
            };
            reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        });

        // Send finish chunk and [DONE]
        const finishChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: createdTimestamp,
          model: form.model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop'
            }
          ]
        };
        reply.raw.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } catch (err) {
        request.log.error({ err }, 'Chat completion streaming error');
        reply.raw.end();
      }
      return;
    }

    // Non-streaming response
    try {
      const result = await chatService.processChatCompletion(userId, tenantId, form);
      return reply.code(200).send({
        id: completionId,
        object: 'chat.completion',
        created: createdTimestamp,
        model: form.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result.content
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: result.tokensUsed.prompt,
          completion_tokens: result.tokensUsed.completion,
          total_tokens: result.tokensUsed.prompt + result.tokensUsed.completion
        }
      });
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // Register endpoints
  app.post('/chat/completions', handler);
  app.post('/chat/completed', handler);
}
