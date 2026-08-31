import type {
  BrowserContextHandle,
  BrowserContextOptions,
  BrowserLease,
  BrowserPool
} from './pool.js';

export type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export type SessionMaterial = {
  tenantId: string;
  cookies?: BrowserCookie[];
  headers?: Record<string, string>;
};

export type SessionReferenceResolver = (input: {
  tenantId: string;
  referenceId: string;
}) => Promise<SessionMaterial | undefined>;

export class BrowserSessionError extends Error {
  public constructor(
    public readonly code:
      | 'BROWSER_SESSION_NOT_FOUND'
      | 'BROWSER_SESSION_SCOPE_MISMATCH'
      | 'BROWSER_SESSION_NOT_ALLOWED'
      | 'BROWSER_SESSION_APPLY_FAILED',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'BrowserSessionError';
  }
}

export class TenantSessionManager {
  public constructor(private readonly resolveReference: SessionReferenceResolver) {}

  public async apply(
    context: BrowserContextHandle,
    input: {
      tenantId: string;
      sessionReferenceId?: string;
      allowCookies: boolean;
      allowedHeaderNames?: string[];
    }
  ): Promise<void> {
    if (!input.sessionReferenceId) {
      return;
    }

    const material = await this.resolveReference({
      tenantId: input.tenantId,
      referenceId: input.sessionReferenceId
    });
    if (!material) {
      throw new BrowserSessionError(
        'BROWSER_SESSION_NOT_FOUND',
        'Browser session reference bulunamadı.',
        false
      );
    }
    if (material.tenantId !== input.tenantId) {
      throw new BrowserSessionError(
        'BROWSER_SESSION_SCOPE_MISMATCH',
        'Browser session reference tenant scope ile eşleşmiyor.',
        false
      );
    }

    if (material.cookies?.length && !input.allowCookies) {
      throw new BrowserSessionError(
        'BROWSER_SESSION_NOT_ALLOWED',
        'Cookie session target policy tarafından kapalı.',
        false
      );
    }

    const allowedHeaders = new Set((input.allowedHeaderNames ?? []).map((header) => header.toLowerCase()));
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(material.headers ?? {})) {
      const normalizedName = name.toLowerCase();
      if (!allowedHeaders.has(normalizedName) || isForbiddenBrowserHeader(normalizedName)) {
        throw new BrowserSessionError(
          'BROWSER_SESSION_NOT_ALLOWED',
          `Browser session header ${name} policy tarafından izin verilmiyor.`,
          false
        );
      }
      headers[name] = value;
    }

    try {
      if (material.cookies?.length) {
        if (!context.addCookies) {
          throw new Error('Browser context cookie API unavailable.');
        }
        await context.addCookies(material.cookies);
      }
      if (Object.keys(headers).length > 0) {
        if (!context.setExtraHTTPHeaders) {
          throw new Error('Browser context header API unavailable.');
        }
        await context.setExtraHTTPHeaders(headers);
      }
    } catch {
      throw new BrowserSessionError(
        'BROWSER_SESSION_APPLY_FAILED',
        'Browser session context içine uygulanamadı.',
        true
      );
    }
  }
}

export class TenantBrowserContextService {
  public constructor(
    private readonly pool: BrowserPool,
    private readonly sessions: TenantSessionManager
  ) {}

  public async acquire(input: BrowserContextOptions & {
    sessionReferenceId?: string;
    allowCookies: boolean;
    allowedHeaderNames?: string[];
  }): Promise<BrowserLease> {
    const lease = await this.pool.acquire(input);
    try {
      await this.sessions.apply(lease.context, {
        tenantId: input.tenantId,
        ...(input.sessionReferenceId ? { sessionReferenceId: input.sessionReferenceId } : {}),
        allowCookies: input.allowCookies,
        ...(input.allowedHeaderNames ? { allowedHeaderNames: input.allowedHeaderNames } : {})
      });
      return lease;
    } catch (error) {
      await lease.release();
      throw error;
    }
  }
}

function isForbiddenBrowserHeader(name: string): boolean {
  return name === 'host'
    || name === 'content-length'
    || name === 'connection'
    || name === 'transfer-encoding'
    || name === 'proxy-authorization'
    || name === 'cookie'
    || name === 'set-cookie';
}
