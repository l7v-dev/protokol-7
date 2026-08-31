import { randomUUID } from 'node:crypto';
import type {
  ChannelRepository,
  ChannelRecord,
  ChannelMessageRecord
} from '../database/repositories/channel-repository.js';
import { ApiError } from '../shared/http.js';

export class ChannelService {
  private readonly memoryChannels = new Map<string, ChannelRecord>();
  private readonly memoryMessages = new Map<string, ChannelMessageRecord[]>();

  public constructor(private readonly channelRepository: ChannelRepository) {
    // Seed default general channel
    const defaultChannel: ChannelRecord = {
      id: 'channel_general',
      userId: 'admin_default',
      tenantId: 'tenant_default',
      name: 'Genel Kazıma & Görev Akışı',
      type: 'general',
      isPrivate: false,
      dataJson: {},
      metaJson: { description: 'Tüm otonom kazıma ve veri toplama raporları kanalı.' },
      accessGrantsJson: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.memoryChannels.set(defaultChannel.id, defaultChannel);
  }

  public async createChannel(
    userId: string,
    tenantId: string,
    input: {
      name: string;
      type?: string;
      is_private?: boolean;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    }
  ): Promise<ChannelRecord> {
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Kanal adı zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        name: string;
        type?: string;
        isPrivate?: boolean;
        data?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        accessGrants?: Array<Record<string, unknown>>;
      } = {
        userId,
        tenantId,
        name
      };
      if (input.type !== undefined) repoInput.type = input.type;
      if (input.is_private !== undefined) repoInput.isPrivate = input.is_private;
      if (input.data !== undefined) repoInput.data = input.data;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.access_grants !== undefined) repoInput.accessGrants = input.access_grants;

      const record = await this.channelRepository.create(repoInput);
      this.memoryChannels.set(record.id, record);
      return record;
    } catch {
      const id = `channel_${randomUUID()}`;
      const record: ChannelRecord = {
        id,
        userId,
        tenantId,
        name,
        type: input.type || 'general',
        isPrivate: input.is_private ?? false,
        dataJson: input.data ?? {},
        metaJson: input.meta ?? {},
        accessGrantsJson: input.access_grants ?? [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryChannels.set(id, record);
      return record;
    }
  }

  public async listChannels(tenantId: string): Promise<ChannelRecord[]> {
    try {
      const items = await this.channelRepository.list(tenantId);
      for (const item of items) {
        this.memoryChannels.set(item.id, item);
      }
      return items.length > 0
        ? items
        : Array.from(this.memoryChannels.values()).filter(
            (c) => c.tenantId === tenantId || c.tenantId === 'tenant_default'
          );
    } catch {
      return Array.from(this.memoryChannels.values()).filter(
        (c) => c.tenantId === tenantId || c.tenantId === 'tenant_default'
      );
    }
  }

  public async getChannelById(tenantId: string, id: string): Promise<ChannelRecord | null> {
    try {
      const record = await this.channelRepository.findById(id, tenantId);
      if (record) return record;
    } catch {
      // Fall back
    }
    const mem = this.memoryChannels.get(id);
    return mem && (mem.tenantId === tenantId || mem.tenantId === 'tenant_default') ? mem : null;
  }

  public async deleteChannel(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.channelRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryChannels.delete(id);
    this.memoryMessages.delete(id);
    return true;
  }

  public async postMessage(
    channelId: string,
    userId: string,
    content: string,
    data: Record<string, unknown> = {}
  ): Promise<ChannelMessageRecord> {
    try {
      return await this.channelRepository.addMessage(channelId, userId, content, data);
    } catch {
      const msg: ChannelMessageRecord = {
        id: `cmsg_${randomUUID()}`,
        channelId,
        userId,
        content,
        dataJson: data,
        createdAt: new Date()
      };
      const existing = this.memoryMessages.get(channelId) || [];
      this.memoryMessages.set(channelId, [...existing, msg]);
      return msg;
    }
  }

  public async getMessages(channelId: string, limit = 50): Promise<ChannelMessageRecord[]> {
    try {
      return await this.channelRepository.listMessages(channelId, limit);
    } catch {
      return this.memoryMessages.get(channelId) || [];
    }
  }
}
