import { describe, expect, it, vi } from 'vitest';

import { HttpAccessPlanner, type ProxyManager } from '../../src/http/access-plan.js';
import type { ProxyAccessError } from '../../src/http/access-plan.js';

const proxyRequest = {
  targetHost: 'example.com',
  targetPort: 443,
  maxDurationMs: 5_000
};

describe('HttpAccessPlanner', () => {
  it('returns direct access when proxy is not required and direct access is allowed', async () => {
    const planner = new HttpAccessPlanner();

    await expect(planner.resolve({
      requireProxy: false,
      allowDirectAccess: true
    })).resolves.toEqual({ mode: 'DIRECT' });
  });

  it('rejects when direct access is disabled without a required proxy plan', async () => {
    const planner = new HttpAccessPlanner();

    await expect(planner.resolve({
      requireProxy: false,
      allowDirectAccess: false
    })).rejects.toMatchObject<ProxyAccessError>({
      code: 'PROXY_REQUIRED_UNAVAILABLE',
      retryable: false
    });
  });

  it('acquires and releases a proxy lease without exposing credentials', async () => {
    const manager: ProxyManager = {
      acquire: vi.fn().mockResolvedValue({
        leaseId: 'lease_1',
        providerId: 'mock-provider',
        endpoint: { protocol: 'https:', host: 'proxy.example.com', port: 443 },
        credentialReference: 'secret_ref_1'
      }),
      release: vi.fn().mockResolvedValue(undefined)
    };
    const planner = new HttpAccessPlanner(manager);

    const access = await planner.resolve({
      requireProxy: true,
      allowDirectAccess: false,
      proxy: proxyRequest
    });
    await planner.release(access, { success: true });

    expect(access).toEqual({
      mode: 'PROXY',
      lease: expect.objectContaining({ leaseId: 'lease_1', providerId: 'mock-provider' })
    });
    expect(manager.acquire).toHaveBeenCalledWith(proxyRequest);
    expect(manager.release).toHaveBeenCalledWith('lease_1', { success: true });
  });

  it('classifies provider acquisition failure as retryable', async () => {
    const manager: ProxyManager = {
      acquire: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      release: vi.fn()
    };
    const planner = new HttpAccessPlanner(manager);

    await expect(planner.resolve({
      requireProxy: true,
      allowDirectAccess: false,
      proxy: proxyRequest
    })).rejects.toMatchObject<ProxyAccessError>({
      code: 'PROXY_ACQUIRE_FAILED',
      retryable: true
    });
  });
});
