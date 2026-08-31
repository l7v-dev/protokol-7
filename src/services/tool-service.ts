import { PROTOKOL7_AGENT_TOOLS } from '../agent/tools.js';
import type { ToolRepository, ToolRecord } from '../database/repositories/tool-repository.js';

export type ToolResponseDto = {
  id: string;
  user_id: string;
  name: string;
  content: string;
  specs: unknown[];
  meta: Record<string, unknown>;
  valves: Record<string, unknown>;
  access_grants?: unknown[];
  created_at: number;
  updated_at: number;
};

const PROTOKOL7_BUILTIN_TOOLS: ToolResponseDto[] = PROTOKOL7_AGENT_TOOLS.map((t) => ({
  id: t.function.name,
  user_id: 'system',
  name: t.function.name,
  content: t.function.description,
  specs: [t],
  meta: { is_builtin: true, description: t.function.description },
  valves: {},
  created_at: 1700000000,
  updated_at: 1700000000
}));

function mapRecordToDto(record: ToolRecord): ToolResponseDto {
  const dto: ToolResponseDto = {
    id: record.id,
    user_id: record.userId,
    name: record.name,
    content: record.content,
    specs: record.specsJson,
    meta: record.metaJson,
    valves: record.valvesJson,
    created_at: Math.floor(record.createdAt.getTime() / 1000),
    updated_at: Math.floor(record.updatedAt.getTime() / 1000)
  };
  if (record.accessGrantsJson && record.accessGrantsJson.length > 0) {
    dto.access_grants = record.accessGrantsJson;
  }
  return dto;
}

export class ToolService {
  public constructor(private readonly toolRepository: ToolRepository) {}

  public async listTools(tenantId: string): Promise<ToolResponseDto[]> {
    let custom: ToolRecord[] = [];
    try {
      custom = await this.toolRepository.listByTenant(tenantId);
    } catch {
      custom = [];
    }

    const mappedCustom = custom.map(mapRecordToDto);
    return [...PROTOKOL7_BUILTIN_TOOLS, ...mappedCustom];
  }

  public async getToolById(tenantId: string, id: string): Promise<ToolResponseDto | null> {
    const builtin = PROTOKOL7_BUILTIN_TOOLS.find((t) => t.id === id);
    if (builtin) return builtin;

    try {
      const record = await this.toolRepository.findById(tenantId, id);
      return record ? mapRecordToDto(record) : null;
    } catch {
      return null;
    }
  }

  public async createTool(
    userId: string,
    tenantId: string,
    input: {
      id?: string;
      name: string;
      content?: string;
      specs?: unknown[];
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      access_grants?: unknown[];
    }
  ): Promise<ToolResponseDto> {
    const createInput: {
      id?: string;
      userId: string;
      tenantId: string;
      name: string;
      content?: string;
      specsJson?: unknown[];
      metaJson?: Record<string, unknown>;
      valvesJson?: Record<string, unknown>;
      accessGrantsJson?: unknown[];
    } = {
      userId,
      tenantId,
      name: input.name
    };

    if (input.id !== undefined) createInput.id = input.id;
    if (input.content !== undefined) createInput.content = input.content;
    if (input.specs !== undefined) createInput.specsJson = input.specs;
    if (input.meta !== undefined) createInput.metaJson = input.meta;
    if (input.valves !== undefined) createInput.valvesJson = input.valves;
    if (input.access_grants !== undefined) createInput.accessGrantsJson = input.access_grants;

    const created = await this.toolRepository.create(createInput);
    return mapRecordToDto(created);
  }

  public async updateTool(
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      content?: string;
      specs?: unknown[];
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      access_grants?: unknown[];
    }
  ): Promise<ToolResponseDto | null> {
    const updateInput: {
      name?: string;
      content?: string;
      specsJson?: unknown[];
      metaJson?: Record<string, unknown>;
      valvesJson?: Record<string, unknown>;
      accessGrantsJson?: unknown[];
    } = {};

    if (patch.name !== undefined) updateInput.name = patch.name;
    if (patch.content !== undefined) updateInput.content = patch.content;
    if (patch.specs !== undefined) updateInput.specsJson = patch.specs;
    if (patch.meta !== undefined) updateInput.metaJson = patch.meta;
    if (patch.valves !== undefined) updateInput.valvesJson = patch.valves;
    if (patch.access_grants !== undefined) updateInput.accessGrantsJson = patch.access_grants;

    const updated = await this.toolRepository.updateById(tenantId, id, updateInput);
    return updated ? mapRecordToDto(updated) : null;
  }

  public async deleteTool(tenantId: string, id: string): Promise<boolean> {
    return this.toolRepository.deleteById(tenantId, id);
  }
}
