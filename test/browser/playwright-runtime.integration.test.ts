import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BrowserArtifactCapturer, BrowserArtifactWriter } from '../../src/browser/artifacts.js';
import { BrowserPool } from '../../src/browser/pool.js';
import { PlaywrightBrowserRuntime, type PlaywrightPageHandle } from '../../src/browser/playwright-runtime.js';
import { InMemoryStorageProvider } from '../../src/storage/provider.js';

const chromiumPath = '/usr/bin/chromium';
const browserAvailable = existsSync(chromiumPath);
let server: Server;
let fixtureUrl: string;

beforeAll(async () => {
  if (!browserAvailable) return;
  server = createServer((request, response) => {
    if (request.url === '/page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<!doctype html>
        <html><body>
          <h1 id="title">Browser fixture</h1>
          <input id="query" value="" />
          <button id="submit">Submit</button>
        </body></html>`);
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  fixtureUrl = `http://127.0.0.1:${address.port}/page`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

describe.skipIf(!browserAvailable)('Playwright Chromium integration', () => {
  it('launches Chromium, executes page operations and writes browser artifacts', async () => {
    const pool = new BrowserPool(new PlaywrightBrowserRuntime({
      executablePath: chromiumPath,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    }), {
      maxBrowsers: 1,
      maxContextsPerBrowser: 1,
      maxPagesPerContext: 1
    });

    const lease = await pool.acquire({
      tenantId: 'tenant_browser_fixture',
      projectId: 'project_browser_fixture',
      jobId: 'job_browser_fixture',
      taskId: 'task_browser_fixture',
      attemptId: 'attempt_browser_fixture',
      allowCookies: false
    });
    const pageLease = await lease.newPage();
    const page = pageLease.page as PlaywrightPageHandle;
    const signal = new AbortController().signal;

    await page.goto(fixtureUrl, { timeoutMs: 5_000, signal });
    await page.waitForSelector('#title', { timeoutMs: 5_000, signal });
    await page.fill('#query', 'safe-value', { timeoutMs: 5_000, signal });
    await page.click('#submit', { timeoutMs: 5_000, signal });
    await page.scroll(100, { timeoutMs: 5_000, signal });

    const html = await page.content();
    const screenshot = await page.screenshot({ fullPage: true });
    const pdf = await page.pdf();
    expect(html).toContain('Browser fixture');
    expect(screenshot.byteLength).toBeGreaterThan(0);
    expect(pdf.byteLength).toBeGreaterThan(0);

    const storage = new InMemoryStorageProvider();
    const capturer = new BrowserArtifactCapturer(new BrowserArtifactWriter(storage));
    const domArtifact = await capturer.capture({
      tenantId: 'tenant_browser_fixture',
      jobId: 'job_browser_fixture',
      taskId: 'task_browser_fixture',
      attemptId: 'attempt_browser_fixture',
      page,
      kind: 'dom'
    });
    expect(domArtifact.storageKey).toContain('tenants/tenant_browser_fixture/');
    expect(domArtifact.sizeBytes).toBeGreaterThan(0);

    await pageLease.release();
    await lease.release();
    await pool.close();
    expect((await pool.health()).ready).toBe(false);
  });
});
