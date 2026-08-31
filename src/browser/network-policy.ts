import { assertSafeOutboundUrl, type SafeOutboundUrl } from '../security/egress-policy.js';
import { ApiError } from '../shared/http.js';

export type BrowserResourceType =
  | 'document'
  | 'script'
  | 'stylesheet'
  | 'image'
  | 'font'
  | 'xhr'
  | 'fetch'
  | 'media'
  | 'other';

export type BrowserNetworkPolicyOptions = {
  allowedHosts: string[];
  allowedPorts: number[];
  allowedResourceTypes: BrowserResourceType[];
  allowedContentTypes: string[];
  maxResponseBytes: number;
  maxRedirects: number;
  allowRedirects: boolean;
};

export type BrowserRequest = {
  url: string;
  resourceType: BrowserResourceType;
  isNavigation?: boolean;
};

export type BrowserResponse = {
  url: string;
  status: number;
  contentType?: string | null;
  bodyBytes: number;
};

export type BrowserNetworkDecision = {
  url: SafeOutboundUrl;
  resourceType: BrowserResourceType;
};

export class BrowserNetworkPolicyError extends Error {
  public constructor(
    public readonly code:
      | 'BROWSER_RESOURCE_URL_INVALID'
      | 'BROWSER_RESOURCE_HOST_NOT_ALLOWED'
      | 'BROWSER_RESOURCE_PORT_NOT_ALLOWED'
      | 'BROWSER_RESOURCE_PRIVATE_BLOCKED'
      | 'BROWSER_RESOURCE_TYPE_NOT_ALLOWED'
      | 'BROWSER_RESPONSE_CONTENT_TYPE_NOT_ALLOWED'
      | 'BROWSER_RESPONSE_TOO_LARGE'
      | 'BROWSER_REDIRECT_NOT_ALLOWED'
      | 'BROWSER_REDIRECT_LIMIT_EXCEEDED',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'BrowserNetworkPolicyError';
  }
}

export class BrowserNetworkPolicy {
  private redirectCount = 0;

  public constructor(private readonly options: BrowserNetworkPolicyOptions) {
    validateOptions(options);
  }

  public checkRequest(request: BrowserRequest): BrowserNetworkDecision {
    if (!this.options.allowedResourceTypes.includes(request.resourceType)) {
      throw new BrowserNetworkPolicyError(
        'BROWSER_RESOURCE_TYPE_NOT_ALLOWED',
        `Browser resource type ${request.resourceType} policy tarafından izin verilmiyor.`,
        false
      );
    }

    let url: SafeOutboundUrl;
    try {
      url = assertSafeOutboundUrl(request.url, this.options.allowedHosts);
    } catch (error) {
      throw this.mapUrlError(error);
    }

    if (!this.options.allowedPorts.includes(url.port)) {
      throw new BrowserNetworkPolicyError(
        'BROWSER_RESOURCE_PORT_NOT_ALLOWED',
        'Browser resource port allowlist içinde değil.',
        false
      );
    }

    return { url, resourceType: request.resourceType };
  }

  public checkResponse(response: BrowserResponse): void {
    if (response.bodyBytes > this.options.maxResponseBytes) {
      throw new BrowserNetworkPolicyError(
        'BROWSER_RESPONSE_TOO_LARGE',
        'Browser response izin verilen byte limitini aşıyor.',
        false
      );
    }

    if (this.options.allowedContentTypes.length === 0) {
      return;
    }

    const contentType = response.contentType?.split(';', 1)[0]?.trim().toLowerCase();
    if (!contentType || !this.options.allowedContentTypes.includes(contentType)) {
      throw new BrowserNetworkPolicyError(
        'BROWSER_RESPONSE_CONTENT_TYPE_NOT_ALLOWED',
        `Browser response content type ${contentType ?? 'missing'} policy tarafından izin verilmiyor.`,
        false
      );
    }
  }

  public checkRedirect(request: BrowserRequest): BrowserNetworkDecision {
    if (!this.options.allowRedirects) {
      throw new BrowserNetworkPolicyError(
        'BROWSER_REDIRECT_NOT_ALLOWED',
        'Browser redirect policy tarafından izin verilmiyor.',
        false
      );
    }
    if (this.redirectCount >= this.options.maxRedirects) {
      throw new BrowserNetworkPolicyError(
        'BROWSER_REDIRECT_LIMIT_EXCEEDED',
        'Browser maksimum redirect sayısına ulaştı.',
        false
      );
    }
    const decision = this.checkRequest(request);
    this.redirectCount += 1;
    return decision;
  }

  public resetRedirects(): void {
    this.redirectCount = 0;
  }

  public get redirects(): number {
    return this.redirectCount;
  }

  private mapUrlError(error: unknown): BrowserNetworkPolicyError {
    if (error instanceof ApiError) {
      if (error.code === 'PRIVATE_TARGET_BLOCKED') {
        return new BrowserNetworkPolicyError(
          'BROWSER_RESOURCE_PRIVATE_BLOCKED',
          error.message,
          false
        );
      }
      if (error.code === 'TARGET_HOST_NOT_ALLOWED') {
        return new BrowserNetworkPolicyError(
          'BROWSER_RESOURCE_HOST_NOT_ALLOWED',
          error.message,
          false
        );
      }
      return new BrowserNetworkPolicyError(
        'BROWSER_RESOURCE_URL_INVALID',
        error.message,
        false
      );
    }
    return new BrowserNetworkPolicyError(
      'BROWSER_RESOURCE_URL_INVALID',
      'Browser resource URL geçerli değil.',
      false
    );
  }
}

function validateOptions(options: BrowserNetworkPolicyOptions): void {
  if (!Number.isInteger(options.maxResponseBytes) || options.maxResponseBytes < 1) {
    throw new Error('maxResponseBytes must be a positive integer.');
  }
  if (!Number.isInteger(options.maxRedirects) || options.maxRedirects < 0) {
    throw new Error('maxRedirects must be a non-negative integer.');
  }
}
