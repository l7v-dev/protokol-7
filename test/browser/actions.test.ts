import { describe, expect, it, vi } from 'vitest';

import {
  BrowserActionError,
  DeclarativeActionExecutor,
  type BrowserActionPage,
  type BrowserActionPlan
} from '../../src/browser/actions.js';

function plan(overrides: Partial<BrowserActionPlan> = {}): BrowserActionPlan {
  return {
    actions: [
      { type: 'goto', url: 'https://example.com/products' },
      { type: 'waitForSelector', selector: '.product-card' },
      { type: 'scroll', amount: 300 },
      { type: 'click', selector: '#next' },
      { type: 'fill', selector: '#search', value: 'phone' }
    ],
    allowedHosts: ['example.com'],
    maxActions: 5,
    maxActionTimeoutMs: 100,
    totalTimeoutMs: 1_000,
    maxScrollAmount: 1_000,
    maxFillValueBytes: 100,
    ...overrides
  };
}

function page(): BrowserActionPage & {
  goto: ReturnType<typeof vi.fn>;
  waitForSelector: ReturnType<typeof vi.fn>;
  scroll: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
} {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined)
  };
}

describe('DeclarativeActionExecutor', () => {
  it('validates and executes only allowlisted actions in order', async () => {
    const executor = new DeclarativeActionExecutor();
    const browserPage = page();
    const actions = executor.validate(plan());
    const results = await executor.execute(browserPage, plan());

    expect(actions).toHaveLength(5);
    expect(results.map((result) => result.type)).toEqual([
      'goto',
      'waitForSelector',
      'scroll',
      'click',
      'fill'
    ]);
    expect(browserPage.goto).toHaveBeenCalledWith(
      'https://example.com/products',
      expect.objectContaining({ timeoutMs: 100, signal: expect.any(AbortSignal) })
    );
    expect(browserPage.fill).toHaveBeenCalledWith(
      '#search',
      'phone',
      expect.objectContaining({ timeoutMs: 100 })
    );
  });

  it('rejects eval-like actions, disallowed URL and unsafe selector input', () => {
    const executor = new DeclarativeActionExecutor();

    expect(() => executor.validate(plan({ actions: [{ type: 'eval', script: 'alert(1)' }] }))).toThrowError(
      expect.objectContaining({ code: 'BROWSER_ACTION_NOT_ALLOWED', retryable: false })
    );
    expect(() => executor.validate(plan({ actions: [{ type: 'goto', url: 'https://other.example/path' }] }))).toThrowError(
      expect.objectContaining({ code: 'BROWSER_ACTION_NOT_ALLOWED', retryable: false })
    );
    expect(() => executor.validate(plan({ actions: [{ type: 'click', selector: '\u0000' }] }))).toThrowError(
      expect.objectContaining({ code: 'BROWSER_ACTION_PLAN_INVALID', retryable: false })
    );
  });

  it('enforces action, scroll, fill and timeout limits', () => {
    const executor = new DeclarativeActionExecutor();

    expect(() => executor.validate(plan({ maxActions: 1 }))).toThrowError(
      expect.objectContaining({ code: 'BROWSER_ACTION_PLAN_INVALID' })
    );
    expect(() => executor.validate(plan({
      actions: [{ type: 'scroll', amount: 2_000 }]
    }))).toThrowError(expect.objectContaining({ code: 'BROWSER_ACTION_PLAN_INVALID' }));
    expect(() => executor.validate(plan({
      actions: [{ type: 'fill', selector: '#q', value: 'x'.repeat(101) }]
    }))).toThrowError(expect.objectContaining({ code: 'BROWSER_ACTION_PLAN_INVALID' }));
    expect(() => executor.validate(plan({
      actions: [{ type: 'click', selector: '#q', timeoutMs: 101 }]
    }))).toThrowError(expect.objectContaining({ code: 'BROWSER_ACTION_PLAN_INVALID' }));
  });

  it('reports missing adapter capabilities and action timeout', async () => {
    const executor = new DeclarativeActionExecutor();
    const incompletePage: BrowserActionPage = {};
    await expect(executor.execute(incompletePage, plan({
      actions: [{ type: 'click', selector: '#q' }]
    }))).rejects.toMatchObject({
      code: 'BROWSER_ACTION_UNSUPPORTED',
      retryable: false
    });

    const hangingPage: BrowserActionPage = {
      waitForSelector: vi.fn().mockReturnValue(new Promise<void>(() => undefined))
    };
    await expect(executor.execute(hangingPage, plan({
      actions: [{ type: 'waitForSelector', selector: '#q', timeoutMs: 5 }],
      maxActionTimeoutMs: 10
    }))).rejects.toMatchObject({
      code: 'BROWSER_ACTION_TIMEOUT',
      retryable: true
    });
  });

  it('honors a pre-aborted signal without running actions', async () => {
    const executor = new DeclarativeActionExecutor();
    const browserPage = page();
    const controller = new AbortController();
    controller.abort();

    await expect(executor.execute(browserPage, plan({
      actions: [{ type: 'click', selector: '#q' }]
    }), controller.signal)).rejects.toMatchObject({
      code: 'BROWSER_ACTION_CANCELLED',
      retryable: true
    });
    expect(browserPage.click).not.toHaveBeenCalled();
    expect(new BrowserActionError('BROWSER_ACTION_FAILED', 'failed', true).name).toBe('BrowserActionError');
  });
});
