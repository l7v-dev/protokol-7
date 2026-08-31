import { randomUUID } from 'node:crypto';
import type { GroupRepository, GroupRecord } from '../database/repositories/group-repository.js';
import { ApiError } from '../shared/http.js';

export class GroupService {
  private readonly memoryGroups = new Map<string, GroupRecord>();

  public constructor(private readonly groupRepository: GroupRepository) {
    // Seed default groups
    const defaultGroups: GroupRecord[] = [
      {
        id: 'group_admin',
        tenantId: 'tenant_default',
        userId: 'admin_default',
        name: 'Yöneticiler',
        description: 'Tüm sistem ve model yönetim yetkilerine sahip yönetici grubu.',
        dataJson: {},
        metaJson: {},
        permissionsJson: { admin: true },
        userIdsJson: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'group_default',
        tenantId: 'tenant_default',
        userId: 'admin_default',
        name: 'Genel Kullanıcılar',
        description: 'Varsayılan kullanıcı ve otonom kazıma direktörü erişim grubu.',
        dataJson: {},
        metaJson: {},
        permissionsJson: { chat: true, scrape: true },
        userIdsJson: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const g of defaultGroups) {
      this.memoryGroups.set(g.id, g);
    }
  }

  public async createGroup(
    userId: string,
    tenantId: string,
    input: {
      name: string;
      description?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      permissions?: Record<string, unknown>;
      user_ids?: string[];
    }
  ): Promise<GroupRecord> {
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Grup adı zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        name: string;
        description?: string;
        data?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        permissions?: Record<string, unknown>;
        userIds?: string[];
      } = {
        userId,
        tenantId,
        name
      };
      if (input.description !== undefined) repoInput.description = input.description;
      if (input.data !== undefined) repoInput.data = input.data;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.permissions !== undefined) repoInput.permissions = input.permissions;
      if (input.user_ids !== undefined) repoInput.userIds = input.user_ids;

      const record = await this.groupRepository.create(repoInput);
      this.memoryGroups.set(record.id, record);
      return record;
    } catch {
      const id = `group_${randomUUID()}`;
      const record: GroupRecord = {
        id,
        tenantId,
        userId,
        name,
        description: input.description || '',
        dataJson: input.data ?? {},
        metaJson: input.meta ?? {},
        permissionsJson: input.permissions ?? {},
        userIdsJson: input.user_ids ?? [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryGroups.set(id, record);
      return record;
    }
  }

  public async listGroups(tenantId: string): Promise<GroupRecord[]> {
    try {
      const items = await this.groupRepository.list(tenantId);
      for (const item of items) {
        this.memoryGroups.set(item.id, item);
      }
      return items.length > 0
        ? items
        : Array.from(this.memoryGroups.values()).filter(
            (g) => g.tenantId === tenantId || g.tenantId === 'tenant_default'
          );
    } catch {
      return Array.from(this.memoryGroups.values()).filter(
        (g) => g.tenantId === tenantId || g.tenantId === 'tenant_default'
      );
    }
  }

  public async getGroupById(tenantId: string, id: string): Promise<GroupRecord | null> {
    try {
      const record = await this.groupRepository.findById(id, tenantId);
      if (record) return record;
    } catch {
      // Fall back
    }
    const mem = this.memoryGroups.get(id);
    return mem && (mem.tenantId === tenantId || mem.tenantId === 'tenant_default') ? mem : null;
  }

  public async deleteGroup(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.groupRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryGroups.delete(id);
    return true;
  }
}
