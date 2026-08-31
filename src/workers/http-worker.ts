import type { Job, Worker } from 'bullmq';

import { createMessageEnvelope, parseMessageEnvelope, type MessageEnvelope } from '../queue/contracts.js';
import { QUEUE_NAMES, type QueueRuntime } from '../queue/runtime.js';
import { HttpAccessPlanner, type AccessPlan } from '../http/access-plan.js';
import { HttpClient, type HttpRequestPlan } from '../http/http-client.js';
import { parseHttpResponse } from '../http/response-parser.js';
import type { HttpArtifactWriter } from '../http/response-parser.js';
import { HttpReliabilityController, type HttpFailureClassification } from '../http/reliability.js';
import { StrategyEscalationPolicy } from '../http/strategy-escalation.js';
import type { ReliabilityEventOutcome, ReliabilityTelemetryCollector } from '../http/telemetry.js';

export type HttpWorkerTaskPayload = {
  taskType: 'HTTP_FETCH';
  payload: HttpRequestPlan;
};

export type HttpWorkerOptions = {
  serviceName?: string;
  serviceVersion?: string;
  client?: HttpClient;
  accessPlanner?: HttpAccessPlanner;
  artifactWriter?: HttpArtifactWriter;
  reliability?: HttpReliabilityController;
  strategyEscalation?: StrategyEscalationPolicy;
  telemetry?: ReliabilityTelemetryCollector;
};

export class HttpWorker {
  private worker: Worker | null = null;
  private readonly client: HttpClient;
  private readonly accessPlanner: HttpAccessPlanner;
  private readonly artifactWriter: HttpArtifactWriter | undefined;
  private readonly reliability: HttpReliabilityController;
  private readonly strategyEscalation: StrategyEscalationPolicy;
  private readonly telemetry: ReliabilityTelemetryCollector | undefined;
  private readonly serviceName: string;
  private readonly serviceVersion: string;

  public constructor(
    private readonly queue: QueueRuntime,
    options: HttpWorkerOptions = {}
  ) {
    this.client = options.client ?? new HttpClient();
    this.accessPlanner = options.accessPlanner ?? new HttpAccessPlanner();
    this.artifactWriter = options.artifactWriter;
    this.telemetry = options.telemetry;
    this.reliability = options.reliability ?? new HttpReliabilityController(
      this.telemetry ? { telemetry: this.telemetry } : {}
    );
    this.strategyEscalation = options.strategyEscalation ?? new StrategyEscalationPolicy();
    this.serviceName = options.serviceName ?? 'http-worker';
    this.serviceVersion = options.serviceVersion ?? '0.1.0';
  }

  public start(concurrency = 2): void {
    this.worker = this.queue.createWorker<HttpWorkerTaskPayload, string>(
      QUEUE_NAMES.taskExecute,
      async (job) => this.process(job),
      concurrency
    );
  }

  public async process(job: Job<MessageEnvelope<HttpWorkerTaskPayload>>): Promise<string> {
    const message = parseMessageEnvelope(job.data) as MessageEnvelope<HttpWorkerTaskPayload>;
    if (message.messageType !== 'task.execute' || message.payload.taskType !== 'HTTP_FETCH' || !message.taskId || !message.attemptId) {
      return message.messageId;
    }

    const plan = this.withEnvelopeContext(message.payload.payload, message);
    let accessPlan: AccessPlan | undefined;
    try {
      accessPlan = await this.accessPlanner.resolve({
        requireProxy: plan.requireProxy ?? false,
        allowDirectAccess: plan.allowDirectAccess ?? true,
        ...(plan.proxyRequest ? { proxy: plan.proxyRequest } : {})
      });
      const execution = await this.reliability.execute(
        plan,
        () => this.client.execute(plan, accessPlan)
      );
      const response = execution.response;
      const result = response.status >= 200 && response.status < 300
        ? {
            messageType: 'task.succeeded' as const,
            payload: {
              resultRef: await this.successResultRef(plan, response)
            }
          }
        : {
            messageType: 'task.failed' as const,
            payload: this.failurePayload(
              this.reliability.classifyResponse(response),
              plan
            )
          };
      await this.accessPlanner.release(accessPlan, {
        success: response.status >= 200 && response.status < 300,
        ...(response.status >= 400 ? { errorCode: this.reliability.classifyResponse(response).code } : {})
      });
      await this.enqueueResult(message, result.messageType, result.payload);
    } catch (error) {
      if (accessPlan) {
        await this.accessPlanner.release(accessPlan, {
          success: false,
          errorCode: this.reliability.classifyError(error).code
        });
      }
      const normalized = this.reliability.classifyError(error);
      await this.enqueueResult(message, 'task.failed', this.failurePayload(normalized, plan));
    }

    return message.taskId;
  }

  public async close(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }

  private failurePayload(
    classification: Pick<HttpFailureClassification, 'code' | 'accessClass' | 'retryable' | 'retryAfterMs'>,
    plan: HttpRequestPlan
  ): {
    errorCode: string;
    retryable: boolean;
    retryDelayMs?: number;
    retryDelaySource?: string;
    retryBudgetRemaining?: number;
    strategyEscalation?: {
      action: string;
      reason: string;
      consumesBudget: boolean;
      budgetRemaining?: number;
    };
  } {
    if (!classification.retryable) {
      return {
        errorCode: classification.code,
        retryable: false,
        ...this.escalationPayload(classification, plan)
      };
    }

    const retryBudget = plan.retryBudget;
    if (!retryBudget) {
      return {
        errorCode: 'RETRY_BUDGET_REQUIRED',
        retryable: false
      };
    }

    const budget = this.reliability.consumeRetryBudget({
      tenantId: plan.tenantId,
      jobId: plan.jobId,
      ...(plan.taskId ? { taskId: plan.taskId } : {}),
      ...(retryBudget.key ? { key: retryBudget.key } : {}),
      maxUnits: retryBudget.maxRetries
    });
    if (!budget.allowed) {
      this.recordTelemetry(classification, plan, 'RETRY_BUDGET_EXHAUSTED');
      return { errorCode: 'RETRY_BUDGET_EXCEEDED', retryable: false };
    }
    this.recordTelemetry(classification, plan, 'RETRY_ALLOWED');
    return {
      ...this.retryPayload(classification, plan),
      ...this.escalationPayload(classification, plan),
      errorCode: classification.code,
      retryable: true,
      retryBudgetRemaining: budget.remaining
    };
  }

  private escalationPayload(
    classification: Pick<HttpFailureClassification, 'code' | 'accessClass' | 'retryable'>,
    plan: HttpRequestPlan
  ): { strategyEscalation: {
    action: string;
    reason: string;
    consumesBudget: boolean;
    budgetRemaining?: number;
  } } | Record<string, never> {
    if (!plan.escalationBudget) return {};
    const decision = this.strategyEscalation.decide({
      tenantId: plan.tenantId,
      jobId: plan.jobId,
      taskId: plan.taskId,
      currentStrategy: 'HTTP',
      failure: {
        code: classification.code,
        accessClass: classification.accessClass,
        retryable: classification.retryable
      },
      allowBrowser: plan.allowBrowserFallback ?? false,
      allowProxyRotation: plan.allowProxyRotation ?? false,
      fallbackBudgetRemaining: plan.fallbackBudgetRemaining ?? 0,
      escalationBudget: {
        ...(plan.escalationBudget.key ? { key: plan.escalationBudget.key } : {}),
        maxUnits: plan.escalationBudget.maxEscalations
      }
    });
    this.recordTelemetry(classification, plan, decision.action === 'BUDGET_EXHAUSTED'
      ? 'ESCALATION_BUDGET_EXHAUSTED'
      : 'STRATEGY_ESCALATION', { escalationAction: decision.action });
    return {
      strategyEscalation: {
        action: decision.action,
        reason: decision.reason,
        consumesBudget: decision.consumesBudget,
        ...(decision.budgetRemaining === undefined ? {} : { budgetRemaining: decision.budgetRemaining })
      }
    };
  }

  private recordTelemetry(
    classification: Pick<HttpFailureClassification, 'code' | 'accessClass'>,
    plan: HttpRequestPlan,
    outcome: ReliabilityEventOutcome,
    extra: { escalationAction?: 'NO_ESCALATION' | 'ESCALATE_BROWSER' | 'ROTATE_PROXY' | 'TERMINAL_BLOCK' | 'BUDGET_EXHAUSTED' } = {}
  ): void {
    this.telemetry?.record({
      tenantId: plan.tenantId,
      jobId: plan.jobId,
      taskId: plan.taskId,
      attemptId: plan.attemptId,
      targetId: plan.targetId,
      strategy: 'HTTP',
      accessClass: classification.accessClass,
      outcome,
      code: classification.code,
      ...(extra.escalationAction ? { escalationAction: extra.escalationAction } : {})
    });
  }

  private retryPayload(
    classification: { retryAfterMs?: number },
    plan: HttpRequestPlan
  ): { retryDelayMs: number; retryDelaySource: string } {
    const delay = this.reliability.calculateRetryDelay({
      retryAttempt: plan.retryAttempt ?? 1,
      ...(classification.retryAfterMs === undefined ? {} : { retryAfterMs: classification.retryAfterMs })
    });
    return {
      retryDelayMs: delay.delayMs,
      retryDelaySource: delay.source
    };
  }

  private async successResultRef(
    plan: HttpRequestPlan,
    response: Awaited<ReturnType<HttpClient['execute']>>
  ): Promise<Record<string, unknown>> {
    const parsed = parseHttpResponse(response);
    const artifact = this.artifactWriter
      ? await this.artifactWriter.write({
          tenantId: plan.tenantId,
          jobId: plan.jobId,
          taskId: plan.taskId,
          attemptId: plan.attemptId,
          response
        })
      : undefined;

    return {
      kind: 'http-response',
      status: response.status,
      url: response.url,
      contentType: response.contentType,
      bodyBytes: response.bodyBytes,
      decompressedBytes: response.decompressedBytes,
      redirectCount: response.redirectCount,
      headers: response.headers,
      parse: {
        kind: parsed.kind,
        fieldCount: parsed.fieldCount,
        recordCount: parsed.recordCount
      },
      ...(artifact ? { artifact } : {})
    };
  }

  private withEnvelopeContext(plan: HttpRequestPlan, message: MessageEnvelope<HttpWorkerTaskPayload>): HttpRequestPlan {
    return {
      ...plan,
      tenantId: message.tenantId,
      ...(message.projectId ? { projectId: message.projectId } : {}),
      ...(message.jobId ? { jobId: message.jobId } : {}),
      ...(message.runId ? { runId: message.runId } : {}),
      taskId: message.taskId as string,
      attemptId: message.attemptId as string,
      correlationId: message.correlationId,
      traceId: message.traceId
    };
  }

  private async enqueueResult(
    message: MessageEnvelope<HttpWorkerTaskPayload>,
    messageType: 'task.succeeded' | 'task.failed',
    payload: Record<string, unknown>
  ): Promise<void> {
    const resultMessage = createMessageEnvelope({
      messageId: `result_${message.messageId}`,
      messageType,
      schemaVersion: 1,
      tenantId: message.tenantId,
      ...(message.projectId ? { projectId: message.projectId } : {}),
      ...(message.jobId ? { jobId: message.jobId } : {}),
      ...(message.runId ? { runId: message.runId } : {}),
      taskId: message.taskId as string,
      attemptId: message.attemptId as string,
      correlationId: message.correlationId,
      traceId: message.traceId,
      causationId: message.messageId,
      producer: {
        service: this.serviceName,
        version: this.serviceVersion
      },
      payload
    });

    await this.queue.add(QUEUE_NAMES.taskResults, resultMessage);
  }
}

