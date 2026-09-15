#!/usr/bin/env node
/**
 * scripts/generate-connectome.mjs
 *
 * Deterministik Connectome ve Repo Haritası Üreticisi
 * TypeScript Compiler API (AST) ve sembol grafiği desteği ile zenginleştirilmiştir.
 *
 * Ref: ADR 0004, ADR 0005, rules/logging-discipline.md
 * Log Standardı: Sıfır emoji, standart ASCII etiketler.
 *
 * Kullanım: node scripts/generate-connectome.mjs [hedef_dizin] > context/connectome.md
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, normalize, relative } from "node:path";

let ts = null;
try {
  ts = (await import("typescript")).default;
} catch {
  ts = null;
}

const targetDir = process.argv[2] || ".";
const SERVER_PATH = existsSync(join(targetDir, "src/core/server.ts"))
  ? join(targetDir, "src/core/server.ts")
  : join(targetDir, "src/server.ts");
const REGISTRY_PATH = existsSync(join(targetDir, "src/actors/actor-registry.ts"))
  ? join(targetDir, "src/actors/actor-registry.ts")
  : join(targetDir, "src/actor-registry.ts");

function scanFiles(dir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !existsSync(dir)) return [];
  const entries = [];
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      if (
        f.startsWith(".") ||
        f === "node_modules" ||
        f === "archive" ||
        f === "dist" ||
        f === "docs" ||
        f === "skills" ||
        f === ".agents"
      ) {
        continue;
      }
      const fullPath = join(dir, f);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        entries.push(...scanFiles(fullPath, maxDepth, currentDepth + 1));
      } else {
        const ext = extname(f);
        if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".mjs") {
          entries.push(normalize(fullPath));
        }
      }
    }
  } catch {
    // Okuma hatası durumunda atla
  }
  return entries;
}

function parseFileAST(filePath, sourceText) {
  if (!ts) return null;

  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : filePath.endsWith(".ts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  const symbols = {
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    exports: [],
    imports: [],
    routes: [],
    actors: [],
  };

  function hasExportModifier(node) {
    if (!node.modifiers) return false;
    return node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  }

  function formatParams(parameters) {
    if (!parameters) return "";
    return parameters
      .map((p) => {
        const name = p.name ? p.name.getText(sourceFile) : "_";
        const type = p.type ? `: ${p.type.getText(sourceFile)}` : "";
        return `${name}${type}`;
      })
      .join(", ");
  }

  function visit(node) {
    // İçe Aktarmalar (Imports)
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.text;
      const namedImports = [];
      let defaultImport = null;

      if (node.importClause) {
        if (node.importClause.name) {
          defaultImport = node.importClause.name.text;
        }
        if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const el of node.importClause.namedBindings.elements) {
            namedImports.push(el.name.text);
          }
        }
      }
      symbols.imports.push({
        from: moduleSpecifier,
        defaultImport,
        namedImports,
      });
    }

    const isTopLevel = node.parent === sourceFile;

    // Ayrı İhraç Bildirimleri (export { a, b })
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        const exportedName = el.name.text;
        const localName = el.propertyName ? el.propertyName.text : exportedName;
        symbols.exports.push({
          name: exportedName,
          localName,
          kind: "named-export",
        });
      }
    }

    // Fonksiyonlar
    if (isTopLevel && ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const isExported = hasExportModifier(node);
      const params = formatParams(node.parameters);
      const returnType = node.type ? node.type.getText(sourceFile) : "void";
      symbols.functions.push({ name, params, returnType, isExported });
      if (isExported) {
        symbols.exports.push({ name, kind: "function" });
      }
    }

    // Sınıflar
    if (isTopLevel && ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const isExported = hasExportModifier(node);
      const methods = [];
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const mName = member.name.getText(sourceFile);
          const mParams = formatParams(member.parameters);
          const mReturn = member.type ? member.type.getText(sourceFile) : "void";
          methods.push(`${mName}(${mParams}): ${mReturn}`);
        }
      }
      symbols.classes.push({ name, methods, isExported });
      if (isExported) {
        symbols.exports.push({ name, kind: "class" });
      }
    }

    // Arayüzler
    if (isTopLevel && ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const isExported = hasExportModifier(node);
      const memberCount = node.members.length;
      symbols.interfaces.push({ name, memberCount, isExported });
      if (isExported) {
        symbols.exports.push({ name, kind: "interface" });
      }
    }

    // Tip Tanımları
    if (isTopLevel && ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const isExported = hasExportModifier(node);
      symbols.types.push({ name, isExported });
      if (isExported) {
        symbols.exports.push({ name, kind: "type" });
      }
    }

    // İhraç Edilen Değişkenler
    if (isTopLevel && ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.name) {
          symbols.exports.push({
            name: decl.name.getText(sourceFile),
            kind: "const",
          });
        }
      }
    }

    // Aktör Tescili (registry.register(new FooActor()) veya registry.register("key", FooActor))
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === "register" &&
        node.arguments.length >= 1
      ) {
        const firstArg = node.arguments[0];
        if (ts.isNewExpression(firstArg) && firstArg.expression) {
          const className = firstArg.expression.getText(sourceFile);
          const key = className
            .replace(/Actor$/, "")
            .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
            .toLowerCase();
          symbols.actors.push({ key, className });
        } else if (node.arguments.length >= 2 && ts.isStringLiteral(firstArg)) {
          const key = firstArg.text;
          const className = node.arguments[1].getText(sourceFile);
          symbols.actors.push({ key, className });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}

function extractRoutesFromSource(source) {
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
      else if (p.includes("/network/intercept")) handler = "NetworkInterceptorActor";
      else if (p.includes("/search")) handler = "SerpSearchActor";
      else if (p.includes("/pdf")) handler = "PdfDocumentActor";
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

function extractActorsFromSource(source) {
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

function buildDependencyGraph(fileMap) {
  const inDegree = new Map();
  for (const f of fileMap.keys()) {
    inDegree.set(f, 0);
  }

  for (const [_filePath, data] of fileMap.entries()) {
    if (!data.ast) continue;
    for (const imp of data.ast.imports) {
      if (imp.from.startsWith(".")) {
        for (const targetPath of fileMap.keys()) {
          const targetBase = basename(targetPath, extname(targetPath));
          const importBase = basename(imp.from, extname(imp.from));
          if (targetBase === importBase) {
            inDegree.set(targetPath, (inDegree.get(targetPath) || 0) + 1);
          }
        }
      }
    }
  }

  return inDegree;
}

export function generateConnectome(target = targetDir) {
  const lines = [];
  const now = new Date().toISOString().slice(0, 10);

  lines.push("# Connectome — Otomatik Üretilen Sistem Haritası");
  lines.push("");
  lines.push(
    `> Bu dosya \`scripts/generate-connectome.mjs\` ile üretildi (${now}). Elle düzenlenmez.`
  );
  lines.push(
    `> Çözümleyici Motor: ${ts ? `TypeScript Compiler API AST (v${ts.version})` : "Regex Fallback"}`
  );
  lines.push("");

  const codeFiles = scanFiles(target);
  const fileMap = new Map();
  const allRoutes = [];
  const allActors = [];

  for (const f of codeFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const astData = parseFileAST(f, content);
      fileMap.set(f, { content, ast: astData });

      if (astData) {
        for (const a of astData.actors) {
          if (!allActors.some((existing) => existing.key === a.key)) {
            allActors.push(a);
          }
        }
      }
    } catch {
      // Okuma hatası
    }
  }

  // Rotaları server dosyasından analiz et
  if (existsSync(SERVER_PATH)) {
    try {
      const serverSrc = readFileSync(SERVER_PATH, "utf8");
      const routes = extractRoutesFromSource(serverSrc);
      allRoutes.push(...routes);
    } catch {}
  }

  // Aktörleri registry dosyasından analiz et (ek destek)
  if (existsSync(REGISTRY_PATH)) {
    try {
      const regSrc = readFileSync(REGISTRY_PATH, "utf8");
      const regexActors = extractActorsFromSource(regSrc);
      for (const a of regexActors) {
        if (!allActors.some((existing) => existing.key === a.key)) {
          allActors.push(a);
        }
      }
    } catch {}
  }

  // 1. Çekirdek Modüller ve Düğümler (Centrality & Core Hubs)
  const inDegree = buildDependencyGraph(fileMap);
  const sortedFiles = [...fileMap.entries()].sort((a, b) => {
    const degA = inDegree.get(a[0]) || 0;
    const degB = inDegree.get(b[0]) || 0;
    return degB - degA;
  });

  if (sortedFiles.length > 0) {
    lines.push("## Çekirdek Modüller ve Mimari Düğümler (Centrality)");
    lines.push("");
    lines.push(
      "Bu tablo, diğer modüller tarafından en çok referans verilen (PageRank benzeri in-degree) merkezi bileşenleri gösterir."
    );
    lines.push("");
    lines.push(
      "| Modül / Dosya | İçe Aktarılma (In-Degree) | İhraç Sembol Sayısı | Rol / Açıklama |"
    );
    lines.push("|---|---|---|---|");

    for (const [filePath, data] of sortedFiles) {
      const deg = inDegree.get(filePath) || 0;
      const exportCount = data.ast ? data.ast.exports.length : 0;
      const rel = relative(target, filePath);
      let role = "Yardımcı Modül";
      if (filePath.includes("server")) role = "Giriş Noktası (Server)";
      else if (filePath.includes("registry")) role = "Bileşen Tescili (Registry)";
      else if (filePath.includes("actor")) role = "Etki Alanı Aktörü (Actor)";
      else if (filePath.includes("browser-pool")) role = "Kaynak Yöneticisi (BrowserPool)";
      else if (filePath.includes("session")) role = "Oturum Denetleyicisi";
      else if (filePath.includes("verify-pipeline")) role = "Doğrulama Hattı";
      else if (filePath.includes("generate-connectome")) role = "Sistem Haritacısı";
      else if (filePath.includes("omega-memory")) role = "Semantik Bellek";
      else if (filePath.includes("omega-mcp-server")) role = "MCP Arayüzü";

      lines.push(`| \`${rel}\` | ${deg} | ${exportCount} | ${role} |`);
    }
    lines.push("");
  }

  // 2. Kayıtlı API Rotaları
  lines.push("## Kayıtlı API Rotaları");
  lines.push("");
  lines.push("| Route | Method | Bağlı Actor / Controller |");
  lines.push("|---|---|---|");
  for (const r of allRoutes) {
    lines.push(`| \`${r.path}\` | ${r.method} | ${r.handler || "—"} |`);
  }
  if (allRoutes.length === 0) {
    lines.push("| *(Belirlenemedi — henüz kaynak kodda API rotası tanımlanmamış)* | — | — |");
  }
  lines.push("");

  // 3. Kayıtlı Aktörler & Bileşenler
  lines.push("## Kayıtlı Aktörler & Bileşenler");
  lines.push("");
  lines.push("| Anahtar | Sınıf |");
  lines.push("|---|---|");
  for (const a of allActors) {
    lines.push(`| \`${a.key}\` | \`${a.className}\` |`);
  }
  if (allActors.length === 0) {
    lines.push("| *(Belirlenemedi — henüz registry tescili bulunmamaktadır)* | — | — |");
  }
  lines.push("");

  // 4. İhraç Edilen Semboller ve Tipler (AST Kontratları)
  if (ts && fileMap.size > 0) {
    lines.push("## İhraç Edilen Semboller ve Arayüz Kontratları (AST)");
    lines.push("");

    let totalExported = 0;
    for (const [filePath, data] of fileMap.entries()) {
      if (!data.ast || data.ast.exports.length === 0) continue;
      const rel = relative(target, filePath);

      const isNamedExport = (name) =>
        data.ast.exports.some((e) => e.localName === name || e.name === name);

      const exportedClasses = data.ast.classes.filter(
        (cls) => cls.isExported || isNamedExport(cls.name)
      );
      const exportedFunctions = data.ast.functions.filter(
        (fn) => fn.isExported || isNamedExport(fn.name)
      );
      const exportedInterfaces = data.ast.interfaces.filter(
        (iface) => iface.isExported || isNamedExport(iface.name)
      );
      const exportedTypes = data.ast.types.filter((t) => t.isExported || isNamedExport(t.name));

      if (
        exportedClasses.length === 0 &&
        exportedFunctions.length === 0 &&
        exportedInterfaces.length === 0 &&
        exportedTypes.length === 0
      ) {
        continue;
      }

      lines.push(`### \`${rel}\``);
      lines.push("");

      if (exportedClasses.length > 0) {
        lines.push("**Sınıflar (Classes):**");
        for (const cls of exportedClasses) {
          lines.push(`- \`class ${cls.name}\``);
          for (const m of cls.methods) {
            lines.push(`  - \`${m}\``);
          }
        }
      }

      if (exportedFunctions.length > 0) {
        lines.push("**Fonksiyonlar (Functions):**");
        for (const fn of exportedFunctions) {
          lines.push(`- \`${fn.name}(${fn.params}): ${fn.returnType}\``);
        }
      }

      if (exportedInterfaces.length > 0) {
        lines.push("**Arayüzler (Interfaces):**");
        for (const iface of exportedInterfaces) {
          lines.push(`- \`interface ${iface.name}\` (${iface.memberCount} üye)`);
        }
      }

      if (exportedTypes.length > 0) {
        lines.push("**Tipler (Types):**");
        for (const t of exportedTypes) {
          lines.push(`- \`type ${t.name}\``);
        }
      }

      lines.push("");
      totalExported +=
        exportedClasses.length +
        exportedFunctions.length +
        exportedInterfaces.length +
        exportedTypes.length;
    }

    if (totalExported === 0) {
      lines.push(
        "*(Mevcut betiklerde doğrudan export edilmiş modül fonksiyonu bulunamadı; yürütülebilir CLI betikleri mevcut)*\n"
      );
    }
  }

  // 5. Modül ve Dosya Envanteri
  if (codeFiles.length > 0) {
    lines.push("## Modül ve Dosya Envanteri");
    lines.push("");
    lines.push("| Dosya Yolu |");
    lines.push("|---|");
    for (const file of codeFiles.slice(0, 50)) {
      const rel = relative(target, file);
      lines.push(`| \`${rel}\` |`);
    }
    if (codeFiles.length > 50) {
      lines.push(`| *... ve ${codeFiles.length - 50} dosya daha* |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export { buildDependencyGraph, parseFileAST, scanFiles };

if (process.argv[1]?.endsWith("generate-connectome.mjs")) {
  console.log(generateConnectome(targetDir));
}
