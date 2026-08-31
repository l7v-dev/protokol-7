import type { FastifyReply, FastifyRequest } from 'fastify';

export type ErrorCategory =
  | 'VALIDATION'
  | 'AUTH'
  | 'POLICY'
  | 'DEPENDENCY'
  | 'EXECUTION'
  | 'DATA'
  | 'INTERNAL';

export type ErrorSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export type ApiErrorDetails = {
  field?: string;
  reason: string;
};

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;
  public readonly severity: ErrorSeverity;
  public readonly details: ApiErrorDetails[];

  public constructor(options: {
    statusCode: number;
    code: string;
    category: ErrorCategory;
    message: string;
    retryable: boolean;
    severity?: ErrorSeverity;
    details?: ApiErrorDetails[];
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.category = options.category;
    this.retryable = options.retryable;
    this.severity = options.severity ?? 'INFO';
    this.details = options.details ?? [];
  }
}

export function requestIdFrom(request: FastifyRequest): string {
  return request.id;
}

export function sendApiError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: ApiError
): void {
  reply.code(error.statusCode).send({
    error: {
      code: error.code,
      category: error.category,
      message: error.message,
      requestId: requestIdFrom(request),
      retryable: error.retryable,
      severity: error.severity,
      details: error.details
    }
  });
}
