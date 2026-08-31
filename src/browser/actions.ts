import { assertSafeOutboundUrl } from '../security/egress-policy.js';
import { ApiError } from '../shared/http.js';

export type BrowserAction =
  | { type: 'goto'; url: string; timeoutMs?: number }
  | { type: 'waitForSelector'; selector: string; timeoutMs?: number }
  | { type: 'scroll'; amount: number; timeoutMs?: number }
  | { type: 'click'; selector: string; timeoutMs?: number }
  | { type: 'fill'; selector: string; value: string; timeoutMs?: number };

export type BrowserActionPlan = {
  actions: unknown[];
  allowedHosts: string[];
  maxActions: number;
  maxActionTimeoutMs: number;
  totalTimeoutMs: number;
  maxScrollAmount: number;
  maxFillValueBytes: number;
};

export type BrowserActionPage = {
  goto?(url: string, options: { timeoutMs: number; signal: AbortSignal }): Promise<void>;
  waitForSelector?(selector: string, options: { timeoutMs: number; signal: AbortSignal }): Promise<void>;
  scroll?(amount: number, options: { timeoutMs: number; signal: AbortSignal }): Promise<void>;
  click?(selector: string, options: { timeoutMs: number; signal: AbortSignal }): Promise<void>;
  fill?(selector: string, value: string, options: { timeoutMs: number; signal: AbortSignal }): Promise<void>;
};

export type BrowserActionResult = {
  index: number;
  type: BrowserAction['type'];
  durationMs: number;
};

export class BrowserActionError extends Error {
  public constructor(
    public readonly code:
      | 'BROWSER_ACTION_PLAN_INVALID'
      | 'BROWSER_ACTION_NOT_ALLOWED'
      | 'BROWSER_ACTION_UNSUPPORTED'
      | 'BROWSER_ACTION_TIMEOUT'
      | 'BROWSER_ACTION_CANCELLED'
      | 'BROWSER_ACTION_FAILED',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'BrowserActionError';
  }
}

export class DeclarativeActionExecutor {
  public validate(plan: BrowserActionPlan): BrowserAction[] {
    if (!Number.isInteger(plan.maxActions) || plan.maxActions < 1 || plan.actions.length > plan.maxActions) {
      throw new BrowserActionError(
        'BROWSER_ACTION_PLAN_INVALID',
        'Browser action sayısı izin verilen sınırı aşıyor.',
        false
      );
    }
    if (!Number.isInteger(plan.maxActionTimeoutMs) || plan.maxActionTimeoutMs < 1) {
      throw new BrowserActionError(
        'BROWSER_ACTION_PLAN_INVALID',
        'Browser action timeout limiti geçerli değil.',
        false
      );
    }
    if (!Number.isInteger(plan.totalTimeoutMs) || plan.totalTimeoutMs < 1) {
      throw new BrowserActionError(
        'BROWSER_ACTION_PLAN_INVALID',
        'Browser total timeout limiti geçerli değil.',
        false
      );
    }

    return plan.actions.map((input, index) => this.validateAction(input, index, plan));
  }

  public async execute(
    page: BrowserActionPage,
    plan: BrowserActionPlan,
    signal?: AbortSignal
  ): Promise<BrowserActionResult[]> {
    const actions = this.validate(plan);
    const totalController = new AbortController();
    const totalTimer = setTimeout(() => totalController.abort(), plan.totalTimeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, totalController.signal]) : totalController.signal;
    const results: BrowserActionResult[] = [];

    try {
      for (const [index, action] of actions.entries()) {
        const startedAt = Date.now();
        if (combinedSignal.aborted) {
          throw new BrowserActionError(
            'BROWSER_ACTION_CANCELLED',
            'Browser action plan iptal edildi veya total timeout aşıldı.',
            true
          );
        }
        await this.executeOne(page, action, plan, combinedSignal);
        results.push({ index, type: action.type, durationMs: Date.now() - startedAt });
      }
      return results;
    } finally {
      clearTimeout(totalTimer);
    }
  }

  private validateAction(input: unknown, index: number, plan: BrowserActionPlan): BrowserAction {
    if (!isRecord(input) || typeof input.type !== 'string') {
      throw this.invalidAction(index);
    }
    const requestedTimeout = input.timeoutMs;
    const timeoutMs = requestedTimeout === undefined ? plan.maxActionTimeoutMs : requestedTimeout;
    if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > plan.maxActionTimeoutMs) {
      throw new BrowserActionError(
        'BROWSER_ACTION_PLAN_INVALID',
        `Action ${index} timeout policy dışı.`,
        false
      );
    }

    switch (input.type) {
      case 'goto': {
        if (typeof input.url !== 'string') throw this.invalidAction(index);
        try {
          assertSafeOutboundUrl(input.url, plan.allowedHosts);
        } catch (error) {
          if (error instanceof ApiError) {
            throw new BrowserActionError('BROWSER_ACTION_NOT_ALLOWED', error.message, false);
          }
          throw error;
        }
        return { type: 'goto', url: input.url, timeoutMs };
      }
      case 'waitForSelector':
      case 'click': {
        if (!isSafeSelector(input.selector)) throw this.invalidAction(index);
        return input.type === 'waitForSelector'
          ? { type: 'waitForSelector', selector: input.selector, timeoutMs }
          : { type: 'click', selector: input.selector, timeoutMs };
      }
      case 'scroll': {
        if (typeof input.amount !== 'number' || !Number.isInteger(input.amount) || input.amount < 0 || input.amount > plan.maxScrollAmount) {
          throw new BrowserActionError(
            'BROWSER_ACTION_PLAN_INVALID',
            `Action ${index} scroll miktarı policy dışı.`,
            false
          );
        }
        return { type: 'scroll', amount: input.amount, timeoutMs };
      }
      case 'fill': {
        if (!isSafeSelector(input.selector) || typeof input.value !== 'string') {
          throw this.invalidAction(index);
        }
        if (new TextEncoder().encode(input.value).byteLength > plan.maxFillValueBytes) {
          throw new BrowserActionError(
            'BROWSER_ACTION_PLAN_INVALID',
            `Action ${index} fill değeri boyut limitini aşıyor.`,
            false
          );
        }
        return { type: 'fill', selector: input.selector, value: input.value, timeoutMs };
      }
      default:
        throw new BrowserActionError(
          'BROWSER_ACTION_NOT_ALLOWED',
          `Action ${index} türü allowlist içinde değil.`,
          false
        );
    }
  }

  private async executeOne(
    page: BrowserActionPage,
    action: BrowserAction,
    plan: BrowserActionPlan,
    signal: AbortSignal
  ): Promise<void> {
    const timeoutMs = action.timeoutMs ?? plan.maxActionTimeoutMs;
    const options = { timeoutMs, signal };
    try {
      switch (action.type) {
        case 'goto':
          await this.runWithTimeout(page.goto, [action.url, options], timeoutMs, signal, 'goto');
          return;
        case 'waitForSelector':
          await this.runWithTimeout(page.waitForSelector, [action.selector, options], timeoutMs, signal, 'waitForSelector');
          return;
        case 'scroll':
          await this.runWithTimeout(page.scroll, [action.amount, options], timeoutMs, signal, 'scroll');
          return;
        case 'click':
          await this.runWithTimeout(page.click, [action.selector, options], timeoutMs, signal, 'click');
          return;
        case 'fill':
          await this.runWithTimeout(page.fill, [action.selector, action.value, options], timeoutMs, signal, 'fill');
          return;
      }
    } catch (error) {
      if (error instanceof BrowserActionError) throw error;
      throw new BrowserActionError(
        'BROWSER_ACTION_FAILED',
        `Browser ${action.type} action başarısız oldu.`,
        true
      );
    }
  }

  private async runWithTimeout<TArgs extends readonly unknown[]>(
    handler: ((...args: TArgs) => Promise<void>) | undefined,
    args: TArgs,
    timeoutMs: number,
    signal: AbortSignal,
    actionType: string
  ): Promise<void> {
    if (!handler) {
      throw new BrowserActionError(
        'BROWSER_ACTION_UNSUPPORTED',
        `Browser adapter ${actionType} action'ını desteklemiyor.`,
        false
      );
    }
    if (signal.aborted) {
      throw new BrowserActionError(
        'BROWSER_ACTION_CANCELLED',
        'Browser action iptal edildi.',
        true
      );
    }

    const actionController = new AbortController();
    const actionSignal = AbortSignal.any([signal, actionController.signal]);
    const timer = setTimeout(() => actionController.abort(), timeoutMs);
    try {
      await Promise.race([
        handler(...args),
        new Promise<void>((_, reject) => {
          actionSignal.addEventListener('abort', () => {
            reject(new BrowserActionError(
              signal.aborted ? 'BROWSER_ACTION_CANCELLED' : 'BROWSER_ACTION_TIMEOUT',
              signal.aborted ? 'Browser action iptal edildi.' : 'Browser action timeout süresi aşıldı.',
              true
            ));
          }, { once: true });
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private invalidAction(index: number): BrowserActionError {
    return new BrowserActionError(
      'BROWSER_ACTION_PLAN_INVALID',
      `Action ${index} sözleşmeye uygun değil.`,
      false
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeSelector(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= 500
    && !value.includes('\u0000');
}
