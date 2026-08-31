import type { Database } from '../database/client.js';
import {
  ProjectRepository,
  type CreateProjectInput,
  type ProjectRecord
} from '../database/repositories/project-repository.js';
import {
  TargetRepository,
  type CreateTargetInput,
  type TargetRecord
} from '../database/repositories/target-repository.js';
import {
  SchemaRepository,
  type CreateSchemaInput,
  type SchemaRecord
} from '../database/repositories/schema-repository.js';

export class ResourceService {
  public readonly projects: ProjectRepository;
  public readonly targets: TargetRepository;
  public readonly schemas: SchemaRepository;

  public constructor(database: Database) {
    this.projects = new ProjectRepository(database);
    this.targets = new TargetRepository(database);
    this.schemas = new SchemaRepository(database);
  }

  public createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.projects.create(input);
  }

  public getProject(tenantId: string, projectId: string): Promise<ProjectRecord | null> {
    return this.projects.findById(tenantId, projectId);
  }

  public listProjects(tenantId: string, limit: number): Promise<ProjectRecord[]> {
    return this.projects.listByTenant(tenantId, limit);
  }

  public createTarget(input: CreateTargetInput): Promise<TargetRecord> {
    return this.targets.create(input);
  }

  public getTarget(tenantId: string, targetId: string): Promise<TargetRecord | null> {
    return this.targets.findById(tenantId, targetId);
  }

  public listTargets(tenantId: string, projectId: string, limit: number): Promise<TargetRecord[]> {
    return this.targets.listByProject(tenantId, projectId, limit);
  }

  public createSchema(input: CreateSchemaInput): Promise<SchemaRecord> {
    return this.schemas.create(input);
  }

  public getSchema(tenantId: string, schemaId: string): Promise<SchemaRecord | null> {
    return this.schemas.findById(tenantId, schemaId);
  }

  public listSchemas(tenantId: string, projectId: string, limit: number): Promise<SchemaRecord[]> {
    return this.schemas.listByProject(tenantId, projectId, limit);
  }

  public publishSchema(tenantId: string, schemaId: string): Promise<SchemaRecord | null> {
    return this.schemas.publish(tenantId, schemaId);
  }
}
