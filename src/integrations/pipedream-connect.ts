/**
 * Pipedream Connect Integration Service.
 * Manages OAuth credentials, Connect tokens, account associations, and MCP configuration.
 *
 * Reference: https://pipedream.com/docs/connect/quickstart
 */

import { PipedreamClient } from "@pipedream/sdk";

export interface PipedreamConnectConfig {
  projectId: string;
  projectEnvironment: "production" | "development";
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export interface CreateConnectTokenOptions {
  externalUserId: string;
  app?: string;
  successRedirectUrl?: string;
  errorRedirectUrl?: string;
}

export interface ConnectTokenResult {
  token: string;
  connectUrl: string;
  expiresInSeconds: number;
  externalUserId: string;
}

export interface PipedreamMcpConfig {
  serverUrl: string;
  headers: Record<string, string>;
  queryUrl: string;
  appSlug: string;
  externalUserId: string;
  projectId: string;
  environment: string;
}

export class PipedreamConnectService {
  private readonly config: PipedreamConnectConfig;
  private clientInstance: PipedreamClient | null = null;

  constructor(config?: Partial<PipedreamConnectConfig>) {
    this.config = {
      projectId: config?.projectId || process.env.PIPEDREAM_PROJECT_ID || "proj_zNsBAEe",
      projectEnvironment: (config?.projectEnvironment ||
        process.env.PIPEDREAM_ENVIRONMENT ||
        "production") as "production" | "development",
      clientId: config?.clientId || process.env.PIPEDREAM_CLIENT_ID || "",
      clientSecret: config?.clientSecret || process.env.PIPEDREAM_CLIENT_SECRET || "",
      baseUrl: config?.baseUrl,
    };
  }

  /**
   * Verify whether required OAuth credentials and project ID are configured.
   */
  public isConfigured(): boolean {
    return Boolean(this.config.projectId && this.config.clientId && this.config.clientSecret);
  }

  /**
   * Returns safe non-sensitive configuration metadata.
   */
  public getConfigSummary(): {
    projectId: string;
    projectEnvironment: "production" | "development";
    isConfigured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
  } {
    return {
      projectId: this.config.projectId,
      projectEnvironment: this.config.projectEnvironment,
      isConfigured: this.isConfigured(),
      hasClientId: Boolean(this.config.clientId),
      hasClientSecret: Boolean(this.config.clientSecret),
    };
  }

  /**
   * Get or initialize underlying Pipedream SDK client instance.
   */
  public getClient(): PipedreamClient {
    if (!this.clientInstance) {
      if (!this.config.projectId) {
        throw new Error("Pipedream Project ID is required.");
      }
      this.clientInstance = new PipedreamClient({
        projectId: this.config.projectId,
        projectEnvironment: this.config.projectEnvironment,
        clientId: this.config.clientId || undefined,
        clientSecret: this.config.clientSecret || undefined,
        baseUrl: this.config.baseUrl || undefined,
      });
    }
    return this.clientInstance;
  }

  /**
   * Generate a short-lived Connect token for frontend/client embedding.
   */
  public async createConnectToken(options: CreateConnectTokenOptions): Promise<ConnectTokenResult> {
    if (!options.externalUserId) {
      throw new Error("Missing required 'externalUserId' parameter.");
    }

    if (!this.isConfigured()) {
      throw new Error(
        "Pipedream Connect credentials are not configured. Set PIPEDREAM_CLIENT_ID and PIPEDREAM_CLIENT_SECRET."
      );
    }

    const client = this.getClient();
    const tokenResponse = await client.tokens.create({
      externalUserId: options.externalUserId,
    });

    const token = tokenResponse.token;
    let connectUrl = `https://pipedream.com/_static/connect.html?token=${encodeURIComponent(token)}&connectLink=true`;

    if (options.app) {
      connectUrl += `&app=${encodeURIComponent(options.app)}`;
    }
    if (options.successRedirectUrl) {
      connectUrl += `&success_redirect_url=${encodeURIComponent(options.successRedirectUrl)}`;
    }
    if (options.errorRedirectUrl) {
      connectUrl += `&error_redirect_url=${encodeURIComponent(options.errorRedirectUrl)}`;
    }

    return {
      token,
      connectUrl,
      expiresInSeconds: 14400, // 4 hours standard validity
      externalUserId: options.externalUserId,
    };
  }

  /**
   * Validate a generated Connect token.
   */
  public async validateConnectToken(token: string, appId?: string): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error("Pipedream Connect credentials are not configured.");
    }
    const client = this.getClient();
    try {
      const result = await client.tokens.validate(token, {
        appId: appId || undefined,
      });
      return Boolean(result);
    } catch (_err) {
      return false;
    }
  }

  /**
   * List connected accounts for an external user.
   */
  public async listAccounts(externalUserId: string, app?: string): Promise<unknown[]> {
    if (!externalUserId) {
      throw new Error("Missing required 'externalUserId' parameter.");
    }
    if (!this.isConfigured()) {
      throw new Error("Pipedream Connect credentials are not configured.");
    }
    const client = this.getClient();
    const response = await client.accounts.listByExternalUser(externalUserId, {
      app: app || undefined,
    });
    return response || [];
  }

  /**
   * Delete a connected account by account ID.
   */
  public async deleteAccount(accountId: string): Promise<void> {
    if (!accountId) {
      throw new Error("Missing required 'accountId' parameter.");
    }
    if (!this.isConfigured()) {
      throw new Error("Pipedream Connect credentials are not configured.");
    }
    const client = this.getClient();
    await client.accounts.delete(accountId);
  }

  /**
   * Retrieve Developer OAuth Access Token for direct MCP and REST requests.
   */
  public async getDeveloperAccessToken(): Promise<string> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        "PIPEDREAM_CLIENT_ID and PIPEDREAM_CLIENT_SECRET are required to obtain developer access token."
      );
    }

    const response = await fetch("https://api.pipedream.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Failed to obtain Pipedream OAuth access token (${response.status}): ${errText}`
      );
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error("Pipedream OAuth token response did not contain access_token.");
    }

    return data.access_token;
  }

  /**
   * Generate configuration and endpoint details for Pipedream Remote MCP integration.
   *
   * Reference: https://pipedream.com/docs/connect/mcp/developers/
   */
  public getMcpConfig(options: {
    appSlug: string;
    externalUserId: string;
    developerAccessToken?: string;
  }): PipedreamMcpConfig {
    if (!options.appSlug) {
      throw new Error("Missing required 'appSlug' parameter (e.g. 'slack', 'notion', 'github').");
    }
    if (!options.externalUserId) {
      throw new Error("Missing required 'externalUserId' parameter.");
    }

    const serverUrl = "https://remote.mcp.pipedream.net/v3";
    const headers: Record<string, string> = {
      "x-pd-project-id": this.config.projectId,
      "x-pd-environment": this.config.projectEnvironment,
      "x-pd-external-user-id": options.externalUserId,
      "x-pd-app-slug": options.appSlug,
    };

    if (options.developerAccessToken) {
      headers.Authorization = `Bearer ${options.developerAccessToken}`;
    }

    const queryUrl = `${serverUrl}?projectId=${encodeURIComponent(this.config.projectId)}&environment=${encodeURIComponent(this.config.projectEnvironment)}&externalUserId=${encodeURIComponent(options.externalUserId)}&app=${encodeURIComponent(options.appSlug)}`;

    return {
      serverUrl,
      headers,
      queryUrl,
      appSlug: options.appSlug,
      externalUserId: options.externalUserId,
      projectId: this.config.projectId,
      environment: this.config.projectEnvironment,
    };
  }
}

/**
 * Global singleton instance with production defaults (proj_zNsBAEe).
 */
export const globalPipedreamConnect = new PipedreamConnectService();
