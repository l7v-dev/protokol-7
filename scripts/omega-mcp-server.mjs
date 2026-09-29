#!/usr/bin/env node

/**
 * scripts/omega-mcp-server.mjs
 *
 * Omega-3 Yerel Model Context Protocol (MCP) Sunucusu
 * Ajanların (Antigravity, Claude Code, Cursor vb.) stdio üzerinden
 * görev belleğine, semantik hafızaya ve deterministik doğrulama kapılarına
 * sıfır token israfıyla doğrudan erişmesini sağlar.
 *
 * Kullanım: node scripts/omega-mcp-server.mjs
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
process.chdir(REPO_ROOT);

const SERVER_NAME = "omega-3-memory-mcp";
const SERVER_VERSION = "1.0.0";

const TOOLS = [
  {
    name: "get_active_task",
    description:
      "TASKS.md dosyasındaki aktif görevi, kabul kriterini, durumunu ve Trust-Tier seviyesini döner.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_semantic_memory",
    description:
      "Omega-3 semantik ve kavramsal belleğinde arama yapar (rules/, context/, docs/adr/ ve archive/).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Aranacak kavram, terim veya kural (ör. 'blast radius', 'slopsquatting', 'naming').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "verify_dependency",
    description:
      "Önerilen bir npm paketinin canlı npm kayıt defterinde gerçekten var olup olmadığını (slopsquatting kontrolü) sorgular.",
    inputSchema: {
      type: "object",
      properties: {
        package_name: {
          type: "string",
          description: "Sorgulanacak npm paket adı (ör. 'cheerio', 'express').",
        },
      },
      required: ["package_name"],
    },
  },
  {
    name: "run_verification_pipeline",
    description:
      "Deterministik doğrulama hattını (naming discipline, sca kontrolü, dosya bütünlüğü) çalıştırır.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function handleToolCall(name, args) {
  switch (name) {
    case "get_active_task": {
      if (!existsSync("TASKS.md")) return "TASKS.md bulunamadı.";
      const content = readFileSync("TASKS.md", "utf8");
      return content;
    }
    case "search_semantic_memory": {
      const q = args?.query || "";
      if (!q) return "Lütfen bir arama sorgusu belirtin.";
      try {
        const out = execSync(`node scripts/omega-memory.mjs "${q.replace(/"/g, '\\"')}"`, {
          encoding: "utf8",
        });
        return out;
      } catch (err) {
        return `Arama hatası: ${err.message}`;
      }
    }
    case "verify_dependency": {
      const pkg = args?.package_name || "";
      if (!pkg) return "Lütfen bir paket adı belirtin.";
      try {
        const out = execSync(`node scripts/sca-check.mjs ${pkg}`, {
          encoding: "utf8",
        });
        return out;
      } catch (err) {
        return `Doğrulama başarısız: ${err.stdout || err.message}`;
      }
    }
    case "run_verification_pipeline": {
      try {
        const out = execSync(`node scripts/verify-pipeline.mjs`, {
          encoding: "utf8",
        });
        return out;
      } catch (err) {
        return `Doğrulama boru hattı başarısız oldu:\n${err.stdout || err.message}`;
      }
    }
    default:
      throw new Error(`Bilinmeyen araç: ${name}`);
  }
}

// JSON-RPC stdio döngüsü
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    const { id, method, params } = request;

    if (method === "initialize") {
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
    } else if (method === "notifications/initialized") {
      // noop
    } else if (method === "tools/list") {
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });
    } else if (method === "tools/call") {
      const { name, arguments: toolArgs } = params;
      try {
        const resultText = handleToolCall(name, toolArgs);
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: resultText }],
          },
        });
      } catch (err) {
        sendResponse({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: err.message },
        });
      }
    } else {
      sendResponse({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Metot bulunamadı." },
      });
    }
  } catch (_err) {
    // JSON parse hatası
  }
});
