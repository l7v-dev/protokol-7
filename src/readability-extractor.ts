/**
 * HTML-to-Structured-Markdown extractor using @mozilla/readability, JSDOM, and Turndown.
 * Extracts article bodies, headings, lists, code blocks, and tables while stripping web clutter.
 * Falls back to Cheerio-based structural cleanup when Readability determines page is non-article.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import * as cheerio from "cheerio";
import { StructuredExtractor } from "./structured-extractor";

export interface ReadabilityExtractOptions {
  charThreshold?: number;
  preserveImages?: boolean;
  maxContentLength?: number;
  includeTables?: boolean;
}

export interface ReadabilityExtractResult {
  title: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  markdown: string;
  text: string;
  isArticle: boolean;
  length: number;
  fallbackUsed: boolean;
}

function createTurndownService(options?: ReadabilityExtractOptions): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  // GFM Table rule using StructuredExtractor
  service.addRule("gfmTable", {
    filter: "table",
    replacement: (_content, node) => {
      if (options?.includeTables === false) {
        return "";
      }
      const html = (node as HTMLElement).outerHTML || "";
      const tables = StructuredExtractor.extractTables(html);
      if (tables.length > 0 && tables[0].markdown) {
        return "\n\n" + tables[0].markdown + "\n\n";
      }
      return "";
    },
  });

  // Fenced code block rule with language detection
  service.addRule("fencedCodeBlock", {
    filter: (node) => {
      return (
        node.nodeName === "PRE" &&
        node.firstChild !== null &&
        node.firstChild.nodeName === "CODE"
      );
    },
    replacement: (_content, node) => {
      const codeNode = node.firstChild as HTMLElement;
      const className = codeNode.getAttribute("class") || "";
      const langMatch = className.match(/(?:language|lang)-([a-zA-Z0-9_-]+)/);
      const lang = langMatch ? langMatch[1] : "";
      const code = codeNode.textContent || "";
      return `\n\n\`\`\`${lang}\n${code.replace(/\n$/, "")}\n\`\`\`\n\n`;
    },
  });

  // Image handling
  if (!options?.preserveImages) {
    service.addRule("stripImages", {
      filter: "img",
      replacement: (_content, node) => {
        const alt = (node as HTMLElement).getAttribute("alt") || "";
        return alt ? `[Image: ${alt}]` : "";
      },
    });
  }

  return service;
}

export class ReadabilityExtractor {
  /**
   * Extracts clean structured Markdown and metadata from raw HTML.
   */
  static extract(
    rawHtml: string,
    targetUrl: string,
    options: ReadabilityExtractOptions = {}
  ): ReadabilityExtractResult {
    if (!rawHtml || typeof rawHtml !== "string" || rawHtml.trim().length === 0) {
      return {
        title: "",
        markdown: "",
        text: "",
        isArticle: false,
        length: 0,
        fallbackUsed: false,
      };
    }

    const turndown = createTurndownService(options);
    const maxLen = options.maxContentLength ?? 2000000;
    const sanitizedHtml = rawHtml.length > maxLen ? rawHtml.slice(0, maxLen) : rawHtml;

    try {
      const dom = new JSDOM(sanitizedHtml, {
        url: targetUrl.startsWith("http") ? targetUrl : "https://agent-smith.local",
      });

      const reader = new Readability(dom.window.document, {
        charThreshold: options.charThreshold ?? 100,
      });

      const article = reader.parse();
      const textContent = article?.textContent?.trim() || "";

      if (
        article &&
        article.content &&
        textContent.length >= (options.charThreshold ?? 100)
      ) {
        const markdown = turndown.turndown(article.content).trim();
        return {
          title: article.title || "",
          byline: article.byline || undefined,
          siteName: article.siteName || undefined,
          excerpt: article.excerpt || undefined,
          markdown,
          text: textContent,
          isArticle: true,
          length: markdown.length,
          fallbackUsed: false,
        };
      }
    } catch {
      // If JSDOM or Readability fails, fallback to Cheerio-based cleanup
    }

    return this.fallbackExtract(sanitizedHtml, turndown);
  }

  private static fallbackExtract(
    html: string,
    turndown: TurndownService
  ): ReadabilityExtractResult {
    const $ = cheerio.load(html);

    const title =
      $("title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      "";

    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      undefined;

    const siteName =
      $('meta[property="og:site_name"]').attr("content")?.trim() ||
      undefined;

    // Remove clutter elements
    $("script, style, noscript, svg, iframe, nav, footer, header, aside, .ad, .ads, [aria-hidden='true']").remove();

    const $target = $("main, article, [role='main']").first();
    const contentHtml = $target.length > 0 ? $target.html() || "" : $("body").html() || "";

    let markdown = "";
    if (contentHtml.trim()) {
      try {
        markdown = turndown.turndown(contentHtml).trim();
      } catch {
        markdown = ($target.length > 0 ? $target.text() : $("body").text())
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    const text = ($target.length > 0 ? $target.text() : $("body").text())
      .replace(/\s+/g, " ")
      .trim();

    return {
      title,
      siteName,
      excerpt: description,
      markdown: markdown || text,
      text,
      isArticle: false,
      length: (markdown || text).length,
      fallbackUsed: true,
    };
  }
}
