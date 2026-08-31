import type { Database } from '../database/client.js';
import {
  IdempotencyConflictError,
  JobRepository,
  hashJobRequest,
  type JobCommandResult,
  type JobRecord,
  type JobStateCommandResult
} from '../database/repositories/job-repository.js';
import type { ResourceService } from './resource-service.js';

export type CreateJobCommand = {
  tenantId: string;
  projectId: string;
  targetId: string;
  schemaId: string;
  triggerType: 'MANUAL' | 'SCHEDULED' | 'API' | 'RETRY';
  input: Record<string, unknown>;
  createdBy: string;
  idempotencyKey: string;
  correlationId: string;
};

export class JobResourceNotFoundError extends Error {
  public constructor(resource: 'project' | 'target' | 'schema' | 'job') {
    super(`${resource} resource was not found.`);
    this.name = 'JobResourceNotFoundError';
  }
}

export class JobResourceMismatchError extends Error {
  public constructor() {
    super('Job resource ownership or project relationship is invalid.');
    this.name = 'JobResourceMismatchError';
  }
}

export class JobResourceNotReadyError extends Error {
  public constructor(
    public readonly resource: 'target' | 'schema',
    public readonly requiredStatus: 'ACTIVE' | 'PUBLISHED',
    public readonly actualStatus: string
  ) {
    super(`${resource} resource must be ${requiredStatus}, received ${actualStatus}.`);
    this.name = 'JobResourceNotReadyError';
  }
}

export { IdempotencyConflictError };

export class JobService {
  private readonly repository: JobRepository;

  public constructor(
    database: Database,
    private readonly resources: ResourceService
  ) {
    this.repository = new JobRepository(database);
  }

  public async create(input: CreateJobCommand): Promise<JobCommandResult> {
    const project = await this.resources.getProject(input.tenantId, input.projectId);
    if (!project) {
      throw new JobResourceNotFoundError('project');
    }

    const target = await this.resources.getTarget(input.tenantId, input.targetId);
    if (!target) {
      throw new JobResourceNotFoundError('target');
    }

    const schema = await this.resources.getSchema(input.tenantId, input.schemaId);
    if (!schema) {
      throw new JobResourceNotFoundError('schema');
    }

    if (target.projectId !== project.id || schema.projectId !== project.id) {
      throw new JobResourceMismatchError();
    }

    if (target.status !== 'ACTIVE') {
      throw new JobResourceNotReadyError('target', 'ACTIVE', target.status);
    }

    if (schema.status !== 'PUBLISHED') {
      throw new JobResourceNotReadyError('schema', 'PUBLISHED', schema.status);
    }

    return this.repository.create({
      id: `job_${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      projectId: project.id,
      targetId: target.id,
      schemaId: schema.id,
      triggerType: input.triggerType,
      input: input.input,
      targetSnapshot: target,
      schemaSnapshot: schema,
      createdBy: input.createdBy,
      idempotencyKey: input.idempotencyKey,
      requestHash: hashJobRequest({
        projectId: project.id,
        targetId: target.id,
        schemaId: schema.id,
        triggerType: input.triggerType,
        jobInput: input.input
      }),
      correlationId: input.correlationId
    });
  }

  public find(tenantId: string, jobId: string): Promise<JobRecord | null> {
    return this.repository.findById(tenantId, jobId);
  }

  public cancel(
    tenantId: string,
    jobId: string,
    correlationId: string,
    idempotencyKey: string
  ): Promise<JobStateCommandResult | null> {
    return this.repository.requestCancel(
      tenantId,
      jobId,
      correlationId,
      idempotencyKey,
      hashJobRequest({
        projectId: 'command',
        targetId: jobId,
        schemaId: 'cancel',
        triggerType: 'API',
        jobInput: { command: 'cancel', jobId }
      })
    );
  }

  public retry(
    tenantId: string,
    jobId: string,
    correlationId: string,
    idempotencyKey: string
  ): Promise<JobStateCommandResult | null> {
    return this.repository.requestRetry(
      tenantId,
      jobId,
      correlationId,
      idempotencyKey,
      hashJobRequest({
        projectId: 'command',
        targetId: jobId,
        schemaId: 'retry',
        triggerType: 'RETRY',
        jobInput: { command: 'retry', jobId }
      })
    );
  }
}
