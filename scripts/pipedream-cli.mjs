#!/usr/bin/env node

/**
 * scripts/pipedream-cli.mjs
 *
 * Pipedream Connect Management & Verification CLI.
 * Provides terminal actions for verifying configuration, generating Connect tokens,
 * inspecting accounts, and configuring MCP endpoints.
 *
 * Usage:
 *   node scripts/pipedream-cli.mjs status
 *   node scripts/pipedream-cli.mjs token <externalUserId> [app]
 *   node scripts/pipedream-cli.mjs accounts <externalUserId> [app]
 *   node scripts/pipedream-cli.mjs mcp <externalUserId> <appSlug>
 */

import { globalPipedreamConnect } from "../dist/src/integrations/pipedream-connect.js";

const args = process.argv.slice(2);
const command = args[0] || "status";

async function run() {
  console.log("=== PROTOKOL-7 PIPEDREAM CONNECT CLI ===");

  switch (command) {
    case "status": {
      const summary = globalPipedreamConnect.getConfigSummary();
      console.log(`[STATUS] Project ID: ${summary.projectId}`);
      console.log(`[STATUS] Environment: ${summary.projectEnvironment}`);
      console.log(`[STATUS] Is Configured: ${summary.isConfigured ? "YES" : "NO"}`);
      console.log(`[STATUS] Client ID Present: ${summary.hasClientId ? "YES" : "NO"}`);
      console.log(`[STATUS] Client Secret Present: ${summary.hasClientSecret ? "YES" : "NO"}`);
      if (!summary.isConfigured) {
        console.log(
          "\n[INFO] Set PIPEDREAM_CLIENT_ID and PIPEDREAM_CLIENT_SECRET in .env to enable API operations."
        );
        console.log(
          "[INFO] See .env.example or https://pipedream.com/projects/proj_zNsBAEe/settings"
        );
      }
      break;
    }

    case "token": {
      const externalUserId = args[1] || "test_user_1";
      const app = args[2] || undefined;
      console.log(
        `[INFO] Generating Connect token for user: ${externalUserId} (app: ${app || "all"})...`
      );
      try {
        const result = await globalPipedreamConnect.createConnectToken({
          externalUserId,
          app,
        });
        console.log(`[OK] Connect Token: ${result.token}`);
        console.log(`[OK] Connect URL: ${result.connectUrl}`);
        console.log(`[OK] Expires In: ${result.expiresInSeconds}s`);
      } catch (err) {
        console.error(`[ERROR] Failed to create token: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case "accounts": {
      const externalUserId = args[1];
      if (!externalUserId) {
        console.error("[ERROR] Missing required argument: <externalUserId>");
        console.log("Usage: node scripts/pipedream-cli.mjs accounts <externalUserId> [app]");
        process.exit(1);
      }
      const app = args[2] || undefined;
      console.log(`[INFO] Querying connected accounts for user: ${externalUserId}...`);
      try {
        const accounts = await globalPipedreamConnect.listAccounts(externalUserId, app);
        console.log(`[OK] Found ${accounts.length} connected account(s):`);
        console.log(JSON.stringify(accounts, null, 2));
      } catch (err) {
        console.error(`[ERROR] Failed to list accounts: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case "mcp": {
      const externalUserId = args[1] || "user_primary";
      const appSlug = args[2] || "slack";
      console.log(
        `[INFO] Generating MCP configuration for user '${externalUserId}' and app '${appSlug}'...`
      );
      const config = globalPipedreamConnect.getMcpConfig({
        appSlug,
        externalUserId,
      });
      console.log(`[OK] MCP Server URL: ${config.serverUrl}`);
      console.log(`[OK] Direct Query URL: ${config.queryUrl}`);
      console.log("[OK] Required Headers:");
      for (const [k, v] of Object.entries(config.headers)) {
        console.log(`     ${k}: ${v}`);
      }
      break;
    }

    default:
      console.log(`[ERROR] Unknown command '${command}'.`);
      console.log("Available commands: status, token, accounts, mcp");
      process.exit(1);
  }
}

run().catch((err) => {
  console.error(`[ERROR] Fatal: ${err.message}`);
  process.exit(1);
});
