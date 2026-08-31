import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import type { FileService } from '../services/file-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

export function registerFileRoutes(app: FastifyInstance, fileService: FileService): void {
  // POST /files/ or /files
  const uploadHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    // Handle multipart file upload if request is multipart
    if (request.isMultipart()) {
      try {
        const data = await request.file();
        if (!data) {
          return sendApiError(
            request,
            reply,
            new ApiError({
              statusCode: 400,
              code: 'FILE_REQUIRED',
              category: 'VALIDATION',
              message: 'Yüklenecek dosya bulunamadı.',
              retryable: false
            })
          );
        }

        const buffer = await data.toBuffer();
        const filename = data.filename || 'uploaded_file';
        const mimeType = data.mimetype;

        let metadata: Record<string, unknown> = {};
        const fields = data.fields as Record<string, { value?: string }>;
        if (fields.metadata?.value) {
          try {
            metadata = JSON.parse(fields.metadata.value);
          } catch {
            // Ignore parse errors
          }
        }

        const fileRecord = await fileService.saveUploadedFile(
          userId,
          tenantId,
          { filename, buffer, mimeType },
          metadata
        );

        return reply.code(200).send(fileRecord);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return sendApiError(
          request,
          reply,
          new ApiError({
            statusCode: 500,
            code: 'FILE_UPLOAD_ERROR',
            category: 'INTERNAL',
            message: `Dosya yüklenemedi: ${msg}`,
            retryable: true
          })
        );
      }
    }

    // JSON upload fallback
    const body = request.body as { filename?: string; content_base64?: string; text?: string; metadata?: Record<string, unknown> } | undefined;
    if (!body?.filename) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'FILE_REQUIRED',
          category: 'VALIDATION',
          message: 'Dosya adı ve içeriği gereklidir.',
          retryable: false
        })
      );
    }

    const buffer = body.content_base64
      ? Buffer.from(body.content_base64, 'base64')
      : Buffer.from(body.text || '', 'utf-8');

    const fileRecord = await fileService.saveUploadedFile(
      userId,
      tenantId,
      { filename: body.filename, buffer },
      body.metadata
    );

    return reply.code(200).send(fileRecord);
  };

  // GET /files/ or /files
  const listFilesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId;
    const tenantId = context?.tenantId || 'tenant_default';

    const query = request.query as { skip?: string; limit?: string; content?: string; search?: string };
    const skip = query.skip ? Number.parseInt(query.skip, 10) : undefined;
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const content = query.content === 'true';
    const search = query.search;

    const listOptions: { skip?: number; limit?: number; search?: string; content?: boolean } = { content };
    if (skip !== undefined) listOptions.skip = skip;
    if (limit !== undefined) listOptions.limit = limit;
    if (search !== undefined) listOptions.search = search;

    const files = await fileService.listFiles(tenantId, userId, listOptions);
    return reply.code(200).send(files);
  };

  // GET /files/search
  const searchFilesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId;
    const tenantId = context?.tenantId || 'tenant_default';

    const query = request.query as { filename?: string; skip?: string; limit?: string; content?: string };
    const search = query.filename && query.filename !== '*' ? query.filename : undefined;
    const skip = query.skip ? Number.parseInt(query.skip, 10) : undefined;
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const content = query.content === 'true';

    const listOptions: { skip?: number; limit?: number; search?: string; content?: boolean } = { content };
    if (skip !== undefined) listOptions.skip = skip;
    if (limit !== undefined) listOptions.limit = limit;
    if (search !== undefined) listOptions.search = search;

    const files = await fileService.listFiles(tenantId, userId, listOptions);
    return reply.code(200).send(files);
  };

  // GET /files/count
  const countFilesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId;
    const tenantId = context?.tenantId || 'tenant_default';

    const count = await fileService.countFiles(tenantId, userId);
    return reply.code(200).send({ count });
  };

  // GET /files/:id
  const getFileByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const file = await fileService.getFileById(tenantId, params.id);
    if (!file) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'FILE_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Dosya bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(file);
  };

  // GET /files/:id/content
  const getFileContentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const raw = await fileService.getFileRawContent(tenantId, params.id);
    if (!raw) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'FILE_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Dosya içeriği bulunamadı.',
          retryable: false
        })
      );
    }

    reply.header('Content-Type', raw.mimeType);
    reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(raw.filename)}"`);
    return reply.code(200).send(raw.buffer);
  };

  // GET /files/:id/data/content
  const getFileDataContentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const data = await fileService.getFileDataContent(tenantId, params.id);
    return reply.code(200).send(data || {});
  };

  // GET /files/:id/process/status (SSE Stream)
  const getFileProcessStatusHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });

    const statusChunk = {
      status: 'completed',
      progress: 100,
      message: 'Dosya başarıyla işlendi.'
    };

    reply.raw.write(`data: ${JSON.stringify(statusChunk)}\n\n`);
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  };

  // DELETE /files/:id
  const deleteFileHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await fileService.deleteFile(tenantId, userId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Dosya silindi.' : 'Dosya bulunamadı.' });
  };

  // DELETE /files/all
  const deleteAllFilesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const count = await fileService.deleteAllFiles(tenantId, userId);
    return reply.code(200).send({ status: true, count, message: `${count} adet dosya silindi.` });
  };

  // Register routes
  app.post('/files', uploadHandler);
  app.post('/files/', uploadHandler);
  app.get('/files', listFilesHandler);
  app.get('/files/', listFilesHandler);
  app.get('/files/search', searchFilesHandler);
  app.get('/files/count', countFilesHandler);
  app.get('/files/:id', getFileByIdHandler);
  app.get('/files/:id/content', getFileContentHandler);
  app.get('/files/:id/data/content', getFileDataContentHandler);
  app.get('/files/:id/process/status', getFileProcessStatusHandler);
  app.delete('/files/:id', deleteFileHandler);
  app.delete('/files/all', deleteAllFilesHandler);
}
