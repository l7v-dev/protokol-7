import { describe, expect, it, vi } from 'vitest';

import {
  BrowserPool,
  type BrowserContextHandle,
  type BrowserHandle,
  type BrowserRuntime
} from '../../src/browser/pool.js';

function contextFactory() {
  const close = vi.fn().mockResolvedValue(undefined);
  const pageClose = vi.fn().mockResolvedValue(undefined);
  const newPage = vi.fn().mockResolvedValue({ close: pageClose });
  const context: BrowserContextHandle = { newPage, close };
  return { context, close, pageClose, newPage };
}

function runtimeFactory() {
  const contexts: ReturnType<typeof contextFactory>[] = [];
  const browsers: BrowserHandle[] = [];
  const launch = vi.fn().mockImplementation(async () => {
    const browser: BrowserHandle = {
      version: `chromium-test-${browsers.length + 1}`,
      newContext: vi.fn().mockImplementation(async () => {
        const entry = contextFactory();
        contexts.push(entry);
        return entry.context;
      }),
      close: vi.fn().mockResolvedValue(undefined)
    };
    browsers.push(browser);
    return browser;
  });
  const runtime: BrowserRuntime = { launch };
  return { runtime, launch, browsers, contexts };
}

function contextOptions(tenantId: string) {
  return {
    tenantId,
    projectId: 'project_1',
    jobId: 'job_1',
    taskId: 'task_1',
    attemptId: `attempt_${tenantId}`,
    allowCookies: false
  };
}

describe('BrowserPool', () => {
  it('keeps contexts isolated and opens a second browser when the first reaches capacity', async () => {
    const fixture = runtimeFactory();
    const pool = new BrowserPool(fixture.runtime, {
      maxBrowsers: 2,
      maxContextsPerBrowser: 1,
      maxPagesPerContext: 1
    });

    const first = await pool.acquire(contextOptions('tenant_a'));
    const second = await pool.acquire(contextOptions('tenant_b'));

    expect(fixture.launch).toHaveBeenCalledTimes(2);
    expect(first.context).not.toBe(second.context);
    expect(await pool.health()).toMatchObject({
      ready: true,
      browserCount: 2,
      activeContexts: 2,
      activePages: 0
    });
    await first.release();
    await second.release();
    expect(await pool.health()).toMatchObject({ activeContexts: 0, activePages: 0 });
  });

  it('enforces page capacity and makes page/context release idempotent', async () => {
    const fixture = runtimeFactory();
    const pool = new BrowserPool(fixture.runtime, {
      maxBrowsers: 1,
      maxContextsPerBrowser: 1,
      maxPagesPerContext: 1
    });
    const lease = await pool.acquire(contextOptions('tenant_a'));
    const page = await lease.newPage();

    await expect(lease.newPage()).rejects.toMatchObject({
      code: 'BROWSER_PAGE_LIMIT',
      retryable: false
    });
    expect(await pool.health()).toMatchObject({ activePages: 1 });
    await page.release();
    await page.release();
    await lease.release();
    await lease.release();
    expect(fixture.contexts[0]?.pageClose).toHaveBeenCalledOnce();
    expect(fixture.contexts[0]?.close).toHaveBeenCalledOnce();
  });

  it('maps browser launch failure to a retryable pool error', async () => {
    const runtime: BrowserRuntime = {
      launch: vi.fn().mockRejectedValue(new Error('chromium missing'))
    };
    const pool = new BrowserPool(runtime, {
      maxBrowsers: 1,
      maxContextsPerBrowser: 1,
      maxPagesPerContext: 1
    });

    await expect(pool.acquire(contextOptions('tenant_a'))).rejects.toMatchObject({
      code: 'BROWSER_LAUNCH_FAILED',
      retryable: true
    });
  });

  it('closes a browser when context creation fails', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime: BrowserRuntime = {
      launch: vi.fn().mockResolvedValue({
        version: 'chromium-test',
        newContext: vi.fn().mockRejectedValue(new Error('context failure')),
        close
      })
    };
    const pool = new BrowserPool(runtime, {
      maxBrowsers: 1,
      maxContextsPerBrowser: 1,
      maxPagesPerContext: 1
    });

    await expect(pool.acquire(contextOptions('tenant_a'))).rejects.toMatchObject({
      code: 'BROWSER_CONTEXT_FAILED',
      retryable: true
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes active contexts and browsers during shutdown', async () => {
    const fixture = runtimeFactory();
    const pool = new BrowserPool(fixture.runtime, {
      maxBrowsers: 1,
      maxContextsPerBrowser: 1,
      maxPagesPerContext: 1
    });
    await pool.acquire(contextOptions('tenant_a'));
    await pool.close();
    await pool.close();

    expect(fixture.contexts[0]?.close).toHaveBeenCalledOnce();
    expect(fixture.browsers[0]?.close).toHaveBeenCalledOnce();
    expect(await pool.health()).toMatchObject({ ready: false, browserCount: 0, activeContexts: 0 });
  });
});
