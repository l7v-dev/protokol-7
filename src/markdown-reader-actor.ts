import { ReadabilityExtractor } from "./readability-extractor";
import { SSRFGuard } from "./ssrf-guard";
import { StructuredExtractor } from "./structured-extractor";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ExtractedTable,
  IActor,
  MarkdownHeadingItem,
  MarkdownReaderResult,
  MarkdownReaderTaskOptions,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30000;

export class MarkdownReaderActor implements IActor<MarkdownReaderResult> {
  readonly actorType = "markdown-reader" as const;
  readonly description =
    "LLM-ready document distiller with YAML frontmatter, heading hierarchy, and token estimation.";

  async run(
    task: ActorTask,
    _context: ActorRunContext
  ): Promise<ActorResult<MarkdownReaderResult>> {
    const startTime = Date.now();
    const options: MarkdownReaderTaskOptions = {
      includeFrontmatter: true,
      includeTableOfContents: true,
      charThreshold: 100,
      preserveImages: false,
      ...task.options?.markdownOptions,
    };
    const timeoutMs = options.timeoutMs ?? task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const allowLocalNetwork = process.env.NODE_ENV === "test";
    const ssrfCheck = SSRFGuard.validateUrl(task.targetUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(task.targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          ...task.options?.headers,
        },
      });

      clearTimeout(timer);

      if (!res.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: res.status,
          errorMessage: `HTTP error ${res.status} fetching ${task.targetUrl}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const html = await res.text();
      const result = this.distillHtml(html, task.targetUrl, options);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: result,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  distillHtml(
    html: string,
    targetUrl: string,
    options: MarkdownReaderTaskOptions
  ): MarkdownReaderResult {
    // 1. Readability extraction
    const readability = ReadabilityExtractor.extract(html, targetUrl, {
      charThreshold: options.charThreshold,
      maxContentLength: options.maxContentLength,
      preserveImages: options.preserveImages,
    });

    // 2. Metadata extraction
    const metaTags = StructuredExtractor.extractMetaTags(html);

    const title =
      readability.title || metaTags["og:title"] || metaTags["twitter:title"] || "Untitled Document";
    const byline = readability.byline || metaTags.author;
    const siteName = readability.siteName || metaTags["og:site_name"];
    const excerpt =
      readability.excerpt ||
      metaTags.description ||
      metaTags["og:description"] ||
      metaTags["twitter:description"];
    const publishedTime =
      metaTags["article:published_time"] || metaTags["og:article:published_time"];

    const contentMarkdown = readability.markdown.trim();

    // 3. Extract tables
    let tables: ExtractedTable[] | undefined;
    if (contentMarkdown.length > 0) {
      const extractedTables = StructuredExtractor.extractTables(html);
      if (extractedTables.length > 0) {
        tables = extractedTables;
      }
    }

    // 4. Extract headings and Table of Contents
    const tableOfContents = this.extractHeadings(contentMarkdown);

    // 5. Statistics calculation
    const characterCount = contentMarkdown.length;
    const wordCount =
      contentMarkdown.length > 0 ? contentMarkdown.split(/\s+/).filter(Boolean).length : 0;
    const estimatedTokenCount = Math.ceil(characterCount / 4);

    // 6. YAML Frontmatter generation
    let frontmatterYaml: string | undefined;
    if (options.includeFrontmatter !== false) {
      frontmatterYaml = this.generateFrontmatter({
        title,
        url: targetUrl,
        byline,
        siteName,
        publishedTime,
        excerpt,
        wordCount,
        characterCount,
        estimatedTokens: estimatedTokenCount,
      });
    }

    // 7. Full document markdown assembly
    const documentParts: string[] = [];
    if (frontmatterYaml) {
      documentParts.push(frontmatterYaml);
    }
    if (options.includeTableOfContents && tableOfContents.length > 0) {
      documentParts.push(this.renderToc(tableOfContents));
    }
    if (contentMarkdown.length > 0) {
      documentParts.push(contentMarkdown);
    }

    const fullDocumentMarkdown = documentParts.join("\n\n");

    return {
      url: targetUrl,
      title,
      byline,
      excerpt,
      siteName,
      publishedTime,
      frontmatterYaml,
      contentMarkdown,
      fullDocumentMarkdown,
      estimatedTokenCount,
      characterCount,
      wordCount,
      tableOfContents,
      tables,
    };
  }

  private extractHeadings(markdown: string): MarkdownHeadingItem[] {
    const headings: MarkdownHeadingItem[] = [];
    const lines = markdown.split("\n");

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim().replace(/[*_`[\]]/g, "");
        const slug = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        headings.push({ level, text, slug });
      }
    }

    return headings;
  }

  private renderToc(headings: MarkdownHeadingItem[]): string {
    const lines = ["## Table of Contents", ""];
    const minLevel = Math.min(...headings.map((h) => h.level));

    for (const h of headings) {
      const indent = "  ".repeat(Math.max(0, h.level - minLevel));
      lines.push(`${indent}- [${h.text}](#${h.slug})`);
    }

    return lines.join("\n");
  }

  private generateFrontmatter(meta: Record<string, string | number | undefined>): string {
    const lines = ["---"];
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== "") {
        if (typeof v === "number") {
          lines.push(`${k}: ${v}`);
        } else {
          const escaped = String(v).replace(/"/g, '\\"');
          lines.push(`${k}: "${escaped}"`);
        }
      }
    }
    lines.push("---");
    return lines.join("\n");
  }
}
