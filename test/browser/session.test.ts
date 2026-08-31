import { describe, expect, it, vi } from 'vitest';

import {
  TenantBrowserContextService,
  TenantSessionManager,
  type SessionMaterial
} from '../../src/browser/session.js';
import type { BrowserContextHandle, BrowserLease } from '../../src/browser/pool.js';

function context() {
  return {
    newPage: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    addCookies: vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined)
  } satisfies BrowserContextHandle;
}

function material(overrides: Partial<SessionMaterial> = {}): SessionMaterial {
  return {
    tenantId: 'tenant_1',
    cookies: [{ name: 'sid', value: 'secret', domain: 'example.com' }],
    headers: { 'x-tenant-token': 'temporary-secret' },
    ...overrides
  };
}

describe('TenantSessionManager', () => {
  it('applies tenant-scoped cookies and allowlisted headers to one context', async () => {
    const browserContext = context();
    const resolveReference = vi.fn().mockResolvedValue(material());
    const manager = new TenantSessionManager(resolveReference);

    await manager.apply(browserContext, {
      tenantId: 'tenant_1',
      sessionReferenceId: 'session_1',
      allowCookies: true,
      allowedHeaderNames: ['x-tenant-token']
    });

    expect(resolveReference).toHaveBeenCalledWith({ tenantId: 'tenant_1', referenceId: 'session_1' });
    expect(browserContext.addCookies).toHaveBeenCalledWith([
      { name: 'sid', value: 'secret', domain: 'example.com' }
    ]);
    expect(browserContext.setExtraHTTPHeaders).toHaveBeenCalledWith({
      'x-tenant-token': 'temporary-secret'
    });
  });

  it('rejects missing, cross-tenant and cookie-disabled session references', async () => {
    const browserContext = context();
    const manager = new TenantSessionManager(vi.fn().mockResolvedValue(undefined));
    await expect(manager.apply(browserContext, {
      tenantId: 'tenant_1',
      sessionReferenceId: 'missing',
      allowCookies: false
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND', retryable: false });

    const crossTenant = new TenantSessionManager(vi.fn().mockResolvedValue(material({ tenantId: 'tenant_2' })));
    await expect(crossTenant.apply(browserContext, {
      tenantId: 'tenant_1',
      sessionReferenceId: 'cross',
      allowCookies: true
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_SCOPE_MISMATCH', retryable: false });

    const cookieDisabled = new TenantSessionManager(vi.fn().mockResolvedValue(material()));
    await expect(cookieDisabled.apply(browserContext, {
      tenantId: 'tenant_1',
      sessionReferenceId: 'cookie',
      allowCookies: false
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_ALLOWED', retryable: false });
    expect(browserContext.addCookies).not.toHaveBeenCalled();
  });

  it('rejects forbidden or non-allowlisted session headers before applying context state', async () => {
    const browserContext = context();
    const manager = new TenantSessionManager(vi.fn().mockResolvedValue(material({
      cookies: [],
      headers: { cookie: 'raw-cookie' }
    })));

    await expect(manager.apply(browserContext, {
      tenantId: 'tenant_1',
      sessionReferenceId: 'header',
      allowCookies: true,
      allowedHeaderNames: ['cookie']
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_ALLOWED', retryable: false });
    expect(browserContext.setExtraHTTPHeaders).not.toHaveBeenCalled();
  });

  it('releases a pool lease if session application fails', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const lease = { release } as unknown as BrowserLease;
    const service = new TenantBrowserContextService({
      acquire: vi.fn().mockResolvedValue(lease)
    } as never, new TenantSessionManager(vi.fn().mockResolvedValue(material({ tenantId: 'tenant_2' }))));

    await expect(service.acquire({
      tenantId: 'tenant_1',
      projectId: 'project_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      allowCookies: true,
      sessionReferenceId: 'cross'
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_SCOPE_MISMATCH' });
    expect(release).toHaveBeenCalledOnce();
  });
});
