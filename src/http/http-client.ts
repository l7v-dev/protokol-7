import { assertSafeOutboundUrl } from '../security/egress-policy.js';
import { ApiError } from '../shared/http.js';
import type { AccessPlan, ProxyAccessRequest } from './access-plan.js';
import type { SafeOutboundUrl } from '../security/egress-policy.js';

export type HttpMethod = 'GET' | 'POST';

export type AuthReference = {
  referenceId: string;
  kind: 'HEADER' | 'COOKIE' | 'BASIC_AUTH';
  headerName?: string;
};

export type HttpRequestPlan = {
  tenantId: string;
  projectId: string;
  targetId: string;
  jobId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  method: HttpMethod;
  url: string;
  allowedHosts: string[];
  allowedPorts: number[];
  allowedMethods: HttpMethod[];
  allowedHeaderNames: string[];
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  authReferences?: AuthReference[];
  allowCookies: boolean;
  requireProxy?: boolean;
  allowDirectAccess?: boolean;
  allowBrowserFallback?: boolean;
  allowProxyRotation?: boolean;
  fallbackBudgetRemaining?: number;
  proxyRequest?: ProxyAccessRequest;
  rateLimit?: {
    key: string;
    maxRequestsPerMinute: number;
    maxConcurrency: number;
  };
  retryBudget?: {
    key?: string;
    maxRetries: number;
  };
  retryAttempt?: number;
  escalationBudget?: {
    key?: string;
    maxEscalations: number;
  };
  cache?: {
    enabled: boolean;
    key?: string;
    ttlMs: number;
  };
  allowRedirects: boolean;
  maxRedirects: number;
  timeout: {
    connectMs: number;
    responseMs: number;
    totalMs: number;
  };
  limits: {
    requestBodyBytes: number;
    responseBytes: number;
    decompressedBytes: number;
  };
  correlationId: string;
  traceId: string;
};

export type HttpResponse = {
  url: string;
  status: number;
  statusClass: `${2 | 3 | 4 | 5}xx` | '1xx' | 'unknown';
  contentType: string | null;
  body: string;
  bodyBytes: number;
  decompressedBytes: number;
  redirectCount: number;
  headers: Record<string, string>;
};

export type AuthReferenceResolver = (reference: AuthReference) => Promise<string | undefined>;
export type FetchImplementation = (input: string, init?: RequestInit, accessPlan?: AccessPlan) => Promise<Response>;

export type HttpClientOptions = {
  fetchImplementation?: FetchImplementation;
  resolveAuthReference?: AuthReferenceResolver;
  outboundUrlValidator?: (rawUrl: string, allowedHosts: string[]) => SafeOutboundUrl;
};

export class HttpClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly category: 'POLICY' | 'EXECUTION' | 'DEPENDENCY' | 'VALIDATION' = 'EXECUTION',
    public readonly status?: number
  ) {
    super(message);
    this.name = 'HttpClientError';
  }
}

const FORBIDDEN_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization', 'set-cookie']);
const SAFE_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-encoding',
  'content-language',
  'content-length',
  'content-type',
  'etag',
  'expires',
  'last-modified',
  'location',
  'retry-after',
  'vary'
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class HttpClient {
  private readonly fetchImplementation: FetchImplementation;
  private readonly resolveAuthReference: AuthReferenceResolver;
  private readonly usesDefaultTransport: boolean;
  private readonly outboundUrlValidator: (rawUrl: string, allowedHosts: string[]) => SafeOutboundUrl;

  public constructor(options: HttpClientOptions = {}) {
    this.usesDefaultTransport = options.fetchImplementation === undefined;
    this.outboundUrlValidator = options.outboundUrlValidator ?? assertSafeOutboundUrl;
    this.fetchImplementation = options.fetchImplementation ?? ((input, init) => fetch(input, init));
    this.resolveAuthReference = options.resolveAuthReference ?? (async () => undefined);
  }

  public async execute(plan: HttpRequestPlan, accessPlan?: AccessPlan): Promise<HttpResponse> {
    this.validatePlan(plan);

    let url = plan.url;
    let method = plan.method;
    let body = plan.body;
    let redirectCount = 0;
    const headers = await this.buildHeaders(plan);

    while (true) {
      const normalized = this.validateUrl(url, plan);
      const response = await this.send(
        plan,
        normalized.url,
        method,
        headers,
        body,
        accessPlan
      );

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return this.toResponse(response, normalized.url, redirectCount);
        }
        if (!plan.allowRedirects) {
          throw new HttpClientError(
            'REDIRECT_NOT_ALLOWED',
            'Redirect policy tarafından izin verilmiyor.',
            false,
            'POLICY',
            response.status
          );
        }
        if (redirectCount >= plan.maxRedirects) {
          throw new HttpClientError(
            'REDIRECT_LIMIT_EXCEEDED',
            'Maksimum redirect sayısına ulaşıldı.',
            false,
            'POLICY',
            response.status
          );
        }

        await response.body?.cancel();
        try {
          url = new URL(location, normalized.url).toString();
        } catch {
          throw new HttpClientError(
            'REDIRECT_URL_INVALID',
            'Redirect Location geçerli bir URL değil.',
            false,
            'POLICY',
            response.status
          );
        }
        redirectCount += 1;

        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
          method = 'GET';
          body = undefined;
        }
        continue;
      }

      return this.toResponse(response, normalized.url, redirectCount, plan);
    }
  }

  private validatePlan(plan: HttpRequestPlan): void {
    if (!plan.allowedMethods.includes(plan.method)) {
      throw new HttpClientError(
        'HTTP_METHOD_NOT_ALLOWED',
        `HTTP method ${plan.method} policy tarafından izin verilmiyor.`,
        false,
        'POLICY'
      );
    }

    if (plan.method === 'GET' && plan.body !== undefined) {
      throw new HttpClientError(
        'HTTP_BODY_NOT_ALLOWED',
        'GET request body içeremez.',
        false,
        'VALIDATION'
      );
    }

    if (plan.maxRedirects < 0 || !Number.isInteger(plan.maxRedirects)) {
      throw new HttpClientError(
        'REDIRECT_LIMIT_INVALID',
        'Redirect limiti geçerli bir tam sayı olmalıdır.',
        false,
        'VALIDATION'
      );
    }

    const bodyBytes = bodyByteLength(plan.body);
    if (bodyBytes > plan.limits.requestBodyBytes) {
      throw new HttpClientError(
        'REQUEST_BODY_TOO_LARGE',
        'Request body izin verilen boyutu aşıyor.',
        false,
        'POLICY'
      );
    }
  }

  private validateUrl(rawUrl: string, plan: HttpRequestPlan): ReturnType<typeof assertSafeOutboundUrl> {
    let normalized: ReturnType<typeof assertSafeOutboundUrl>;
    try {
      normalized = this.outboundUrlValidator(rawUrl, plan.allowedHosts);
    } catch (error) {
      if (error instanceof ApiError) {
        throw new HttpClientError(error.code, error.message, error.retryable, 'POLICY');
      }
      throw error;
    }
    if (!plan.allowedPorts.includes(normalized.port)) {
      throw new HttpClientError(
        'TARGET_PORT_NOT_ALLOWED',
        'Target port allowlist içinde değil.',
        false,
        'POLICY'
      );
    }
    return normalized;
  }

  private async buildHeaders(plan: HttpRequestPlan): Promise<Record<string, string>> {
    const allowed = new Set(plan.allowedHeaderNames.map((header) => header.toLowerCase()));
    const result: Record<string, string> = {};

    for (const [name, value] of Object.entries(plan.headers ?? {})) {
      const normalizedName = name.toLowerCase();
      if (!allowed.has(normalizedName) || FORBIDDEN_HEADERS.has(normalizedName)) {
        throw new HttpClientError(
          'HEADER_NOT_ALLOWED',
          `Header ${name} policy tarafından izin verilmiyor.`,
          false,
          'POLICY'
        );
      }
      if (SENSITIVE_HEADERS.has(normalizedName)) {
        throw new HttpClientError(
          'RAW_SECRET_NOT_ALLOWED',
          `Sensitive header ${name} raw olarak verilemez; reference kullanılmalıdır.`,
          false,
          'POLICY'
        );
      }
      if (hasControlCharacters(value)) {
        throw new HttpClientError(
          'HEADER_VALUE_INVALID',
          `Header ${name} kontrol karakteri içeriyor.`,
          false,
          'VALIDATION'
        );
      }
      result[name] = value;
    }

    for (const reference of plan.authReferences ?? []) {
      if (reference.kind === 'COOKIE' && !plan.allowCookies) {
        throw new HttpClientError(
          'COOKIE_NOT_ALLOWED',
          'Cookie kullanımı target policy tarafından kapalı.',
          false,
          'POLICY'
        );
      }

      const secret = await this.resolveAuthReference(reference);
      if (!secret) {
        throw new HttpClientError(
          'AUTH_REFERENCE_NOT_FOUND',
          `Auth reference ${reference.referenceId} çözümlenemedi.`,
          false,
          'POLICY'
        );
      }

      if (reference.kind === 'HEADER') {
        const headerName = reference.headerName?.toLowerCase();
        if (!headerName || !allowed.has(headerName) || FORBIDDEN_HEADERS.has(headerName)) {
          throw new HttpClientError(
            'HEADER_NOT_ALLOWED',
            'Auth header policy allowlist içinde değil.',
            false,
            'POLICY'
          );
        }
        result[reference.headerName as string] = secret;
      } else if (reference.kind === 'COOKIE') {
        result.Cookie = secret;
      } else {
        throw new HttpClientError(
          'BASIC_AUTH_NOT_IMPLEMENTED',
          'Basic auth reference bu client sürümünde uygulanmamıştır.',
          false,
          'POLICY'
        );
      }
    }

    return result;
  }

  private async send(
    plan: HttpRequestPlan,
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body: string | Uint8Array | undefined,
    accessPlan?: AccessPlan
  ): Promise<Response> {
    if (accessPlan?.mode === 'PROXY' && this.usesDefaultTransport) {
      throw new HttpClientError(
        'PROXY_TRANSPORT_NOT_CONFIGURED',
        'Proxy lease alındı ancak HTTP transport proxy adapter ile yapılandırılmadı.',
        false,
        'POLICY'
      );
    }

    const totalController = new AbortController();
    const responseController = new AbortController();
    const totalTimer = setTimeout(() => totalController.abort(), plan.timeout.totalMs);
    const responseTimer = setTimeout(() => responseController.abort(), Math.min(plan.timeout.connectMs, plan.timeout.responseMs));
    const signal = AbortSignal.any([totalController.signal, responseController.signal]);

    try {
      const requestInit: RequestInit = {
        method,
        headers,
        ...(body === undefined ? {} : { body: bodyInit(body) }),
        redirect: 'manual',
        signal
      };
      return accessPlan === undefined
        ? await this.fetchImplementation(url, requestInit)
        : await this.fetchImplementation(url, requestInit, accessPlan);
    } catch (error) {
      if (responseController.signal.aborted) {
        throw new HttpClientError(
          'RESPONSE_TIMEOUT',
          'HTTP response timeout süresi aşıldı.',
          true,
          'EXECUTION'
        );
      }
      if (totalController.signal.aborted) {
        throw new HttpClientError(
          'TOTAL_TIMEOUT',
          'HTTP total timeout süresi aşıldı.',
          true,
          'EXECUTION'
        );
      }
      if (error instanceof HttpClientError) {
        throw error;
      }
      throw new HttpClientError(
        'HTTP_REQUEST_FAILED',
        'HTTP request başarısız oldu.',
        true,
        'DEPENDENCY'
      );
    } finally {
      clearTimeout(responseTimer);
      clearTimeout(totalTimer);
    }
  }

  private async toResponse(
    response: Response,
    url: string,
    redirectCount: number,
    plan?: HttpRequestPlan
  ): Promise<HttpResponse> {
    const limits = plan?.limits ?? {
      responseBytes: 10 * 1024 * 1024,
      decompressedBytes: 10 * 1024 * 1024,
      requestBodyBytes: 0
    };
    const body = await readBoundedBody(response, limits.responseBytes, limits.decompressedBytes);
    const headers: Record<string, string> = {};
    for (const [name, value] of response.headers.entries()) {
      if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) {
        headers[name] = value;
      }
    }

    return {
      url,
      status: response.status,
      statusClass: statusClass(response.status),
      contentType: response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? null,
      body: new TextDecoder().decode(body),
      bodyBytes: body.byteLength,
      decompressedBytes: body.byteLength,
      redirectCount,
      headers
    };
  }
}

async function readBoundedBody(response: Response, responseLimit: number, decompressedLimit: number): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      size += next.value.byteLength;
      if (size > responseLimit) {
        await reader.cancel();
        throw new HttpClientError(
          'RESPONSE_TOO_LARGE',
          'HTTP response izin verilen byte limitini aşıyor.',
          false,
          'POLICY'
        );
      }
      if (size > decompressedLimit) {
        await reader.cancel();
        throw new HttpClientError(
          'DECOMPRESSED_RESPONSE_TOO_LARGE',
          'Decompressed response izin verilen byte limitini aşıyor.',
          false,
          'POLICY'
        );
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof HttpClientError) {
      throw error;
    }
    throw new HttpClientError(
      'RESPONSE_BODY_READ_FAILED',
      'HTTP response body okunamadı.',
      true,
      'DEPENDENCY'
    );
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function bodyInit(body: string | Uint8Array): string | ArrayBuffer {
  if (typeof body === 'string') {
    return body;
  }

  const buffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(buffer).set(body);
  return buffer;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) {
      return true;
    }
  }
  return false;
}

function bodyByteLength(body: string | Uint8Array | undefined): number {
  if (body === undefined) {
    return 0;
  }
  return typeof body === 'string' ? new TextEncoder().encode(body).byteLength : body.byteLength;
}

function statusClass(status: number): HttpResponse['statusClass'] {
  if (status >= 100 && status < 200) return '1xx';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'unknown';
}
