export type BrowserContextOptions = {
  tenantId: string;
  projectId: string;
  jobId: string;
  taskId: string;
  attemptId: string;
  allowCookies: boolean;
  sessionReferenceId?: string;
};

export interface BrowserPageHandle {
  close(): Promise<void>;
}

export interface BrowserContextHandle {
  newPage(): Promise<BrowserPageHandle>;
  close(): Promise<void>;
  addCookies?(cookies: BrowserCookieInput[]): Promise<void>;
  setExtraHTTPHeaders?(headers: Record<string, string>): Promise<void>;
}

export type BrowserCookieInput = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export interface BrowserHandle {
  readonly version: string;
  newContext(options: BrowserContextOptions): Promise<BrowserContextHandle>;
  close(): Promise<void>;
}

export interface BrowserRuntime {
  launch(): Promise<BrowserHandle>;
}

export type BrowserPoolOptions = {
  maxBrowsers: number;
  maxContextsPerBrowser: number;
  maxPagesPerContext: number;
};

export class BrowserPoolError extends Error {
  public constructor(
    public readonly code:
      | 'BROWSER_CAPACITY_EXHAUSTED'
      | 'BROWSER_LAUNCH_FAILED'
      | 'BROWSER_CONTEXT_FAILED'
      | 'BROWSER_PAGE_LIMIT',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'BrowserPoolError';
  }
}

export type BrowserLease = {
  leaseId: string;
  browserVersion: string;
  context: BrowserContextHandle;
  newPage(): Promise<BrowserPageLease>;
  release(): Promise<void>;
};

export type BrowserPageLease = {
  page: BrowserPageHandle;
  release(): Promise<void>;
};

export class BrowserPool {
  private readonly browsers: BrowserHandle[] = [];
  private readonly contextLeases = new Map<string, ContextState>();
  private sequence = 0;
  private closing = false;

  public constructor(
    private readonly runtime: BrowserRuntime,
    private readonly options: BrowserPoolOptions
  ) {
    validatePoolOptions(options);
  }

  public async acquire(contextOptions: BrowserContextOptions): Promise<BrowserLease> {
    if (this.closing) {
      throw new BrowserPoolError(
        'BROWSER_CAPACITY_EXHAUSTED',
        'Browser pool kapanış durumunda.',
        true
      );
    }

    const browser = await this.getBrowser();
    const activeForBrowser = [...this.contextLeases.values()]
      .filter((state) => state.browser === browser && !state.released).length;
    if (activeForBrowser >= this.options.maxContextsPerBrowser) {
      throw new BrowserPoolError(
        'BROWSER_CAPACITY_EXHAUSTED',
        'Browser context kapasitesi dolu.',
        true
      );
    }

    let context: BrowserContextHandle;
    try {
      context = await browser.newContext({ ...contextOptions });
    } catch {
      await this.resetBrowser(browser);
      throw new BrowserPoolError(
        'BROWSER_CONTEXT_FAILED',
        'Browser context oluşturulamadı.',
        true
      );
    }

    const leaseId = `browser_lease_${++this.sequence}`;
    const state: ContextState = {
      browser,
      context,
      pages: 0,
      released: false
    };
    this.contextLeases.set(leaseId, state);

    return {
      leaseId,
      browserVersion: browser.version,
      context,
      newPage: async () => this.openPage(leaseId, state),
      release: async () => this.releaseContext(leaseId, state)
    };
  }

  public async health(): Promise<{
    ready: boolean;
    browserCount: number;
    activeContexts: number;
    activePages: number;
    versions: string[];
  }> {
    return {
      ready: !this.closing && this.browsers.length > 0,
      browserCount: this.browsers.length,
      activeContexts: [...this.contextLeases.values()].filter((state) => !state.released).length,
      activePages: [...this.contextLeases.values()]
        .filter((state) => !state.released)
        .reduce((total, state) => total + state.pages, 0),
      versions: this.browsers.map((browser) => browser.version)
    };
  }

  public async close(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    const contexts = [...this.contextLeases.entries()];
    for (const [leaseId, state] of contexts) {
      await this.releaseContext(leaseId, state);
    }
    const browsers = this.browsers.splice(0);
    await Promise.all(browsers.map((browser) => browser.close()));
  }

  private async getBrowser(): Promise<BrowserHandle> {
    const existing = this.browsers.find((browser) => {
      const activeContexts = [...this.contextLeases.values()]
        .filter((state) => state.browser === browser && !state.released).length;
      return activeContexts < this.options.maxContextsPerBrowser;
    });
    if (existing) {
      return existing;
    }
    if (this.browsers.length >= this.options.maxBrowsers) {
      throw new BrowserPoolError(
        'BROWSER_CAPACITY_EXHAUSTED',
        'Browser process kapasitesi dolu.',
        true
      );
    }

    try {
      const browser = await this.runtime.launch();
      this.browsers.push(browser);
      return browser;
    } catch {
      throw new BrowserPoolError(
        'BROWSER_LAUNCH_FAILED',
        'Browser runtime başlatılamadı.',
        true
      );
    }
  }

  private async openPage(leaseId: string, state: ContextState): Promise<BrowserPageLease> {
    if (state.released || !this.contextLeases.has(leaseId)) {
      throw new BrowserPoolError(
        'BROWSER_CONTEXT_FAILED',
        'Browser context lease artık aktif değil.',
        false
      );
    }
    if (state.pages >= this.options.maxPagesPerContext) {
      throw new BrowserPoolError(
        'BROWSER_PAGE_LIMIT',
        'Browser context page kapasitesi dolu.',
        false
      );
    }

    const page = await state.context.newPage();
    state.pages += 1;
    let released = false;
    return {
      page,
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        state.pages = Math.max(state.pages - 1, 0);
        await page.close();
      }
    };
  }

  private async releaseContext(leaseId: string, state: ContextState): Promise<void> {
    if (state.released) {
      return;
    }
    state.released = true;
    this.contextLeases.delete(leaseId);
    state.pages = 0;
    await state.context.close();
  }

  private async resetBrowser(browser: BrowserHandle): Promise<void> {
    const index = this.browsers.indexOf(browser);
    if (index >= 0) {
      this.browsers.splice(index, 1);
    }
    await browser.close();
  }
}

type ContextState = {
  browser: BrowserHandle;
  context: BrowserContextHandle;
  pages: number;
  released: boolean;
};

function validatePoolOptions(options: BrowserPoolOptions): void {
  const values = [options.maxBrowsers, options.maxContextsPerBrowser, options.maxPagesPerContext];
  if (values.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error('Browser pool capacities must be positive integers.');
  }
}
