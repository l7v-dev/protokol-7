#!/usr/bin/env node
/**
 * scripts/generate-connectome.mjs
 *
 * Deterministik Connectome Üreticisi
 * Kod tabanındaki route, controller ve modül ilişkilerini haritalandırır.
 *
 * Kullanım: node scripts/generate-connectome.mjs [hedef_dizin] > context/connectome.md
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const targetDir = process.argv[2] || ".";
const SERVER_PATH = join(targetDir, "src/server.ts");
const REGISTRY_PATH = join(targetDir, "src/actor-registry.ts");

function extractRoutes(source) {
  const routes = [];
  const regex = /method\s*===\s*["']([A-Z]+)["'][^{]*?\{/gs;
  for (const m of source.matchAll(regex)) {
    const method = m[1];
    const block = m[0];
    const pathMatches = [
      ...block.matchAll(/pathname(?:\s*===|\.startsWith\()\s*["']([^"']+)["']/g),
    ];
    for (const pm of pathMatches) {
      let p = pm[1];
      if (p.endsWith("/")) p += ":id";
      let handler = "—";
      if (p === "/health") handler = "BrowserPool (health)";
      else if (p.includes("/actors"))
        handler = method === "GET" ? "ActorRegistry (list)" : "ActorRegistry (execute)";
      else if (p.includes("/scrape")) handler = "CheerioScraperActor / PlaywrightBrowserActor";
      else if (p.includes("/crawl")) handler = "CrawlerActor";
      else if (p.includes("/sitemap")) handler = "SitemapXmlActor";
      else if (p.includes("/reader")) handler = "MarkdownReaderActor";
      else if (p.includes("/browser/action"))
        handler = "InteractiveBrowserController.executeAction";
      else if (p.includes("/browser/session"))
        handler = "InteractiveBrowserController.closeSession";
      if (!routes.some((r) => r.path === p && r.method === method)) {
        routes.push({ path: p, method, handler });
      }
    }
  }
  return routes;
}

function extractActors(source) {
  const actors = [];
  const regex1 = /registry\.register\(\s*new\s+(\w+)\(\)\s*\)/g;
  const regex2 = /registry\.register\(\s*["']([^"']+)["']\s*,\s*(\w+)/g;

  for (const m of source.matchAll(regex1)) {
    const className = m[1];
    const key = className
      .replace(/Actor$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase();
    actors.push({ key, className });
  }
  for (const m of source.matchAll(regex2)) {
    actors.push({ key: m[1], className: m[2] });
  }
  return actors;
}

function scanFiles(dir, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth || !existsSync(dir)) return [];
  const entries = [];
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      if (f.startsWith(".") || f === "node_modules" || f === "dist") continue;
      const fullPath = join(dir, f);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        entries.push(...scanFiles(fullPath, maxDepth, currentDepth + 1));
      } else if (f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".mjs")) {
        entries.push(fullPath);
      }
    }
  } catch {
    // Okuma hatası durumunda sessizce atla
  }
  return entries;
}

function main() {
  const lines = [];
  lines.push("# Connectome — Otomatik Üretilen Sistem Haritası");
  lines.push("");
  lines.push(
    `> Bu dosya \`scripts/generate-connectome.mjs\` ile üretildi (${new Date().toISOString().slice(0, 10)}). Elle düzenlenmez.`
  );
  lines.push("");

  let serverFound = false;
  if (existsSync(SERVER_PATH)) {
    try {
      const serverSrc = readFileSync(SERVER_PATH, "utf8");
      const routes = extractRoutes(serverSrc);
      lines.push("## Kayıtlı API Rotaları");
      lines.push("");
      lines.push("| Route | Method | Bağlı Actor / Controller |");
      lines.push("|---|---|---|");
      for (const r of routes) {
        lines.push(`| \`${r.path}\` | ${r.method} | ${r.handler || "—"} |`);
      }
      if (routes.length === 0) {
        lines.push("| *(Belirlenemedi — route desenini kontrol edin)* | — | — |");
      }
      lines.push("");
      serverFound = true;
    } catch (err) {
      console.error(`Server dosyası okunurken hata: ${err.message}`);
    }
  }

  if (existsSync(REGISTRY_PATH)) {
    try {
      const regSrc = readFileSync(REGISTRY_PATH, "utf8");
      const actors = extractActors(regSrc);
      lines.push("## Kayıtlı Aktörler & Bileşenler");
      lines.push("");
      lines.push("| Anahtar | Sınıf |");
      lines.push("|---|---|");
      for (const a of actors) {
        lines.push(`| \`${a.key}\` | \`${a.className}\` |`);
      }
      lines.push("");
    } catch (err) {
      console.error(`Registry dosyası okunurken hata: ${err.message}`);
    }
  }

  // Genel kod dosyası envanteri
  const codeFiles = scanFiles(targetDir);
  if (codeFiles.length > 0) {
    lines.push("## Modül ve Dosya Envanteri");
    lines.push("");
    lines.push("| Dosya Yolu |");
    lines.push("|---|");
    for (const file of codeFiles.slice(0, 50)) {
      lines.push(`| \`${file}\` |`);
    }
    if (codeFiles.length > 50) {
      lines.push(`| *... ve ${codeFiles.length - 50} dosya daha* |`);
    }
    lines.push("");
  }

  if (!serverFound && codeFiles.length === 0) {
    lines.push("## Sistem Durumu");
    lines.push("");
    lines.push(
      "Bu çalışma alanında henüz `src/server.ts` veya derlenebilir kaynak kod bulunmamaktadır. Connectome altyapısı hazır durumdadır."
    );
    lines.push("");
  }

  console.log(lines.join("\n"));
}

main();
