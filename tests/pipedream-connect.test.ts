/**
 * tests/pipedream-connect.test.ts
 *
 * Test suite for Pipedream Connect Service and REST API routes.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/core/server";
import { PipedreamConnectService } from "../src/integrations/pipedream-connect";

test("PipedreamConnectService - Configuration and Defaults", () => {
  const defaultService = new PipedreamConnectService();
  const summary = defaultService.getConfigSummary();

  assert.strictEqual(summary.projectId, "proj_zNsBAEe");
  assert.strictEqual(summary.projectEnvironment, "production");
  assert.strictEqual(typeof summary.isConfigured, "boolean");

  const customService = new PipedreamConnectService({
    projectId: "proj_custom_123",
    projectEnvironment: "development",
    clientId: "client_abc",
    clientSecret: "secret_xyz",
  });

  assert.strictEqual(customService.isConfigured(), true);
  const customSummary = customService.getConfigSummary();
  assert.strictEqual(customSummary.projectId, "proj_custom_123");
  assert.strictEqual(customSummary.projectEnvironment, "development");
  assert.strictEqual(customSummary.hasClientId, true);
  assert.strictEqual(customSummary.hasClientSecret, true);
});

test("PipedreamConnectService - MCP Configuration Generator", () => {
  const service = new PipedreamConnectService({
    projectId: "proj_zNsBAEe",
    projectEnvironment: "production",
  });

  const mcpConfig = service.getMcpConfig({
    appSlug: "notion",
    externalUserId: "usr_enterprise_01",
    developerAccessToken: "mock_token_123",
  });

  assert.strictEqual(mcpConfig.serverUrl, "https://remote.mcp.pipedream.net/v3");
  assert.strictEqual(mcpConfig.appSlug, "notion");
  assert.strictEqual(mcpConfig.externalUserId, "usr_enterprise_01");
  assert.strictEqual(mcpConfig.projectId, "proj_zNsBAEe");
  assert.strictEqual(mcpConfig.environment, "production");
  assert.strictEqual(mcpConfig.headers["x-pd-project-id"], "proj_zNsBAEe");
  assert.strictEqual(mcpConfig.headers["x-pd-environment"], "production");
  assert.strictEqual(mcpConfig.headers["x-pd-external-user-id"], "usr_enterprise_01");
  assert.strictEqual(mcpConfig.headers["x-pd-app-slug"], "notion");
  assert.strictEqual(mcpConfig.headers.Authorization, "Bearer mock_token_123");
  assert.match(mcpConfig.queryUrl, /remote\.mcp\.pipedream\.net\/v3/);
  assert.match(mcpConfig.queryUrl, /proj_zNsBAEe/);
  assert.match(mcpConfig.queryUrl, /usr_enterprise_01/);

  assert.throws(
    () => service.getMcpConfig({ appSlug: "", externalUserId: "usr_1" }),
    /Missing required 'appSlug'/
  );
  assert.throws(
    () => service.getMcpConfig({ appSlug: "slack", externalUserId: "" }),
    /Missing required 'externalUserId'/
  );
});

test("PipedreamConnectService - Token Creation Guard without Credentials", async () => {
  const unconfiguredService = new PipedreamConnectService({
    clientId: "",
    clientSecret: "",
  });

  await assert.rejects(async () => {
    await unconfiguredService.createConnectToken({
      externalUserId: "usr_test",
    });
  }, /Pipedream Connect credentials are not configured/);

  await assert.rejects(async () => {
    await unconfiguredService.createConnectToken({
      externalUserId: "",
    });
  }, /Missing required 'externalUserId'/);
});

test("Pipedream Connect - HTTP REST API Endpoints", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. GET /api/v1/pipedream/config
    const configRes = await fetch(`${baseUrl}/api/v1/pipedream/config`);
    assert.strictEqual(configRes.status, 200);
    const configData = (await configRes.json()) as {
      status: string;
      projectId: string;
      projectEnvironment: string;
    };
    assert.strictEqual(configData.status, "ok");
    assert.strictEqual(configData.projectId, "proj_zNsBAEe");
    assert.strictEqual(configData.projectEnvironment, "production");

    // 2. GET /api/v1/pipedream/mcp/config
    const mcpRes = await fetch(
      `${baseUrl}/api/v1/pipedream/mcp/config?appSlug=slack&externalUserId=usr_agent_42`
    );
    assert.strictEqual(mcpRes.status, 200);
    const mcpData = (await mcpRes.json()) as {
      serverUrl: string;
      appSlug: string;
      externalUserId: string;
      headers: Record<string, string>;
    };
    assert.strictEqual(mcpData.serverUrl, "https://remote.mcp.pipedream.net/v3");
    assert.strictEqual(mcpData.appSlug, "slack");
    assert.strictEqual(mcpData.externalUserId, "usr_agent_42");
    assert.strictEqual(mcpData.headers["x-pd-project-id"], "proj_zNsBAEe");

    // 3. GET /api/v1/pipedream/mcp/config validation failure
    const mcpFailRes = await fetch(`${baseUrl}/api/v1/pipedream/mcp/config`);
    assert.strictEqual(mcpFailRes.status, 400);

    // 4. POST /api/v1/pipedream/connect-token missing externalUserId
    const tokenFailRes = await fetch(`${baseUrl}/api/v1/pipedream/connect-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(tokenFailRes.status, 400);

    // 5. GET /api/v1/pipedream/accounts missing externalUserId
    const accFailRes = await fetch(`${baseUrl}/api/v1/pipedream/accounts`);
    assert.strictEqual(accFailRes.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
