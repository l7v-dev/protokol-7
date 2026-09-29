/**
 * src/actors/corpus/open-textbook-actor.ts
 *
 * Open Textbook Library (University of Minnesota) Harvester.
 * Extracts peer-reviewed open textbooks, multi-format download links (PDF, EPUB, Online),
 * table of contents, academic peer reviews, and curricular subject categories.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  OpenTextbookActorResult,
  OpenTextbookActorTaskOptions,
  OpenTextbookItem,
  OpenTextbookReview,
  OpenTextbookSubject,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const BASE_HOST = "https://open.umn.edu";

export class OpenTextbookActor implements IActor<OpenTextbookActorResult> {
  readonly actorType = "open-textbook" as const;
  readonly description =
    "Extracts peer-reviewed open textbooks, curricular reviews, and downloadable formats from Open Textbook Library (UMN).";

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      hr: "---",
    });
  }

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<OpenTextbookActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: OpenTextbookActorTaskOptions =
      task.options?.openTextbookOptions ||
      (task.options as unknown as OpenTextbookActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF check on targetUrl if provided
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve Action & Base Endpoint
      const action = this.resolveAction(task, options);
      const baseUrl = this.resolveBaseUrl(task.targetUrl);

      // 3. Dispatch action
      switch (action) {
        case "search":
          return await this.handleSearch(
            task,
            options,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "subjects":
          return await this.handleSubjects(
            task,
            options,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "book":
          return await this.handleBook(
            task,
            options,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        default:
          return await this.handleBook(
            task,
            options,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `Open Textbook extraction error: ${message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveAction(
    task: ActorTask,
    options: OpenTextbookActorTaskOptions
  ): "book" | "search" | "subjects" {
    if (options.action) {
      return options.action;
    }
    if (options.query) {
      return "search";
    }
    if (task.targetUrl?.includes("/subjects")) {
      return "subjects";
    }
    if (task.targetUrl?.includes("term=")) {
      return "search";
    }
    return "book";
  }

  private resolveBaseUrl(targetUrl?: string): string {
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        return `${parsed.protocol}//${parsed.host}`;
      } catch {
        // Fall back
      }
    }
    return BASE_HOST;
  }

  private async handleSearch(
    task: ActorTask,
    options: OpenTextbookActorTaskOptions,
    baseUrl: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<OpenTextbookActorResult>> {
    const query = options.query?.trim() || "";
    const subject = options.subject?.trim() || "";

    let searchUrl: string;
    if (task.targetUrl?.includes("?")) {
      searchUrl = task.targetUrl;
    } else if (subject) {
      searchUrl = `${baseUrl}/opentextbooks/subjects/${encodeURIComponent(subject)}`;
    } else {
      searchUrl = `${baseUrl}/opentextbooks/textbooks?term=${encodeURIComponent(query)}`;
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(searchUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 403,
        errorMessage: `SSRF check failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, application/xhtml+xml, */*",
      },
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Open Textbook search failed with status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const books: OpenTextbookItem[] = [];

    // Select book items from various markup conventions in Open Textbook Library
    $(
      ".textbook-item, .card-textbook, li.textbook, .Grid-cell .Card, .Search-results .Row, article.textbook"
    ).each((_, el) => {
      const $el = $(el);
      const titleLink = $el.find("h2 a, h3 a, .Card-title a, a.textbook-title").first();
      const title = titleLink.text().trim();
      const href = titleLink.attr("href") || "";

      if (!title || !href) return;

      const url = href.startsWith("http")
        ? href
        : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
      const idMatch = href.match(/\/textbooks\/([0-9a-zA-Z_-]+)/);
      const id = idMatch ? idMatch[1] : undefined;

      // Extract authors
      const authors: string[] = [];
      const authorText = $el
        .find(".author, .Card-meta, .byline, p:contains('Contributors'), p:contains('by')")
        .text()
        .trim();
      if (authorText) {
        const cleanAuthors = authorText.replace(/^(Contributors|Authors|By|by):\s*/i, "").trim();
        if (cleanAuthors) {
          authors.push(
            ...cleanAuthors
              .split(/,\s*|\s+and\s+/i)
              .map((a) => a.trim())
              .filter(Boolean)
          );
        }
      }

      // Extract publisher
      const publisher =
        $el
          .find(".publisher, p:contains('Publisher:')")
          .text()
          .replace(/Publisher:\s*/i, "")
          .trim() || undefined;

      // Extract rating / review count
      let rating: number | undefined;
      let reviewCount: number | undefined;
      const reviewText = $el
        .find(".rating, .reviews-count, .StarRating, p:contains('reviews')")
        .text()
        .trim();
      const ratingMatch =
        reviewText.match(/([0-9.]+)\s*(?:\/|\s*out of\s*)5/i) ||
        reviewText.match(/([0-9.]+)\s*stars/i);
      if (ratingMatch) {
        rating = Number.parseFloat(ratingMatch[1]);
      }
      const countMatch =
        reviewText.match(/\(([0-9]+)\s*reviews?\)/i) || reviewText.match(/([0-9]+)\s*reviews?/i);
      if (countMatch) {
        reviewCount = Number.parseInt(countMatch[1], 10);
      }

      // Extract description
      const desc = $el
        .find(".description, .Card-description, p:not(.author):not(.publisher)")
        .first()
        .text()
        .trim();

      books.push({
        id,
        title,
        url,
        authors: authors.length > 0 ? authors : undefined,
        publisher,
        rating,
        reviewCount,
        descriptionMarkdown: desc || undefined,
      });
    });

    const markdown = this.renderSearchMarkdown(query || subject, books);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "search",
        queryUrl: searchUrl,
        totalResults: books.length,
        books,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleBook(
    task: ActorTask,
    options: OpenTextbookActorTaskOptions,
    baseUrl: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<OpenTextbookActorResult>> {
    let bookUrl = task.targetUrl;

    if (!bookUrl) {
      if (options.bookId) {
        bookUrl = `${baseUrl}/opentextbooks/textbooks/${encodeURIComponent(options.bookId)}`;
      } else {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Book action requires targetUrl or bookId.",
          executionDurationMs: Date.now() - startTime,
        };
      }
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(bookUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 403,
        errorMessage: `SSRF check failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(bookUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, application/xhtml+xml, */*",
      },
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Failed to fetch open textbook: HTTP ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract Title
    const title =
      $("h1.textbook-title, h1.Title, h1").first().text().trim() ||
      $("title")
        .text()
        .replace(/ - Open Textbook.*$/, "")
        .trim() ||
      "Untitled Open Textbook";

    // Extract ID
    const idMatch = bookUrl.match(/\/textbooks\/([0-9a-zA-Z_-]+)/);
    const id = idMatch ? idMatch[1] : options.bookId;

    // Extract Authors / Contributors
    const authors: string[] = [];
    $(".authors a, .contributors a, p:contains('Contributors') a, p:contains('Authors') a").each(
      (_, el) => {
        const author = $(el).text().trim();
        if (author && !authors.includes(author)) {
          authors.push(author);
        }
      }
    );
    if (authors.length === 0) {
      const rawAuthor = $("p:contains('Contributors:'), p:contains('Authors:'), .author")
        .text()
        .trim();
      if (rawAuthor) {
        const clean = rawAuthor.replace(/^(Contributors|Authors|By):\s*/i, "").trim();
        if (clean) {
          authors.push(
            ...clean
              .split(/,\s*|\s+and\s+/i)
              .map((a) => a.trim())
              .filter(Boolean)
          );
        }
      }
    }

    // Extract Publisher
    const publisher =
      $("p:contains('Publisher:')")
        .text()
        .replace(/Publisher:\s*/i, "")
        .trim() ||
      $(".publisher").text().trim() ||
      undefined;

    // Extract Publication Date
    const publicationDate =
      $("p:contains('Publication Date:')")
        .text()
        .replace(/Publication Date:\s*/i, "")
        .trim() ||
      $(".publish-date, time").first().text().trim() ||
      undefined;

    // Extract License
    const license =
      $("p:contains('Conditions of Use:'), p:contains('License:')")
        .text()
        .replace(/^(Conditions of Use|License):\s*/i, "")
        .trim() ||
      $(".license, .copyright").text().trim() ||
      undefined;

    // Extract ISBN
    const isbn =
      $("p:contains('ISBN:'), p:contains('ISBN-13:')")
        .text()
        .replace(/ISBN(-13)?:\s*/i, "")
        .trim() || undefined;

    // Extract Formats / Download Links
    const formats: Array<{ format: string; url: string }> = [];
    $(
      "a[href*='.pdf'], a[href*='.epub'], a:contains('PDF'), a:contains('EPUB'), a:contains('Online'), a:contains('Get This Book'), .format-btn, .Download-btn"
    ).each((_, el) => {
      const $a = $(el);
      const linkText = $a.text().trim();
      const href = $a.attr("href") || "";
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        const fullUrl = href.startsWith("http")
          ? href
          : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
        let formatName = linkText || "Download";
        if (href.endsWith(".pdf") || formatName.toLowerCase().includes("pdf")) {
          formatName = "PDF";
        } else if (href.endsWith(".epub") || formatName.toLowerCase().includes("epub")) {
          formatName = "EPUB";
        } else if (formatName.toLowerCase().includes("online")) {
          formatName = "Online";
        }
        if (!formats.some((f) => f.url === fullUrl)) {
          formats.push({ format: formatName, url: fullUrl });
        }
      }
    });

    // Extract Description
    let descHtml = $("#about, .textbook-description, .About-content, #description").html() || "";
    if (!descHtml) {
      descHtml = $("h2:contains('About the Book')").nextUntil("h2").html() || "";
    }
    const descriptionMarkdown = descHtml ? this.turndown.turndown(descHtml).trim() : undefined;

    // Extract Table of Contents
    const tableOfContents: string[] = [];
    $("#table-of-contents li, .toc-item, #toc li, .Table-of-contents li").each((_, el) => {
      const tocText = $(el).text().trim().replace(/\s+/g, " ");
      if (tocText && !tableOfContents.includes(tocText)) {
        tableOfContents.push(tocText);
      }
    });

    // Extract Subjects / Categories
    const subjects: string[] = [];
    $("p:contains('Subject:'), p:contains('Categories:')")
      .find("a")
      .each((_, el) => {
        const sub = $(el).text().trim();
        if (sub && !subjects.includes(sub)) {
          subjects.push(sub);
        }
      });

    // Extract Reviews
    const reviews: OpenTextbookReview[] = [];
    $(".review, .Review-card, .review-item").each((_, el) => {
      const $rev = $(el);
      const reviewer =
        $rev.find(".reviewer-name, h4, .Review-author").first().text().trim() ||
        "Anonymous Academic Reviewer";
      const institution =
        $rev.find(".reviewer-institution, .Review-institution, .institution").text().trim() ||
        undefined;
      const reviewDate = $rev.find("time, .review-date, .Review-date").text().trim() || undefined;

      let rating: number | undefined;
      const ratingText = $rev.find(".rating, .StarRating").text().trim();
      const match =
        ratingText.match(/([0-9.]+)\s*(?:\/|\s*out of\s*)5/i) || ratingText.match(/([0-9.]+)/);
      if (match) {
        rating = Number.parseFloat(match[1]);
      }

      const commentsHtml = $rev.find(".review-content, .Review-body, .comments").html() || "";
      const commentsMarkdown = commentsHtml
        ? this.turndown.turndown(commentsHtml).trim()
        : $rev.find("p").text().trim();

      if (commentsMarkdown) {
        reviews.push({
          reviewer,
          institution,
          rating,
          reviewDate,
          commentsMarkdown,
        });
      }
    });

    // Overall Rating
    let overallRating: number | undefined;
    let reviewCount: number | undefined;
    const ratingSummary = $(".textbook-rating, .RatingSummary, .reviews-count")
      .first()
      .text()
      .trim();
    const rateMatch = ratingSummary.match(/([0-9.]+)\s*(?:\/|\s*out of\s*)5/i);
    if (rateMatch) {
      overallRating = Number.parseFloat(rateMatch[1]);
    }
    const countMatch = ratingSummary.match(/([0-9]+)\s*reviews?/i);
    if (countMatch) {
      reviewCount = Number.parseInt(countMatch[1], 10);
    } else if (reviews.length > 0) {
      reviewCount = reviews.length;
    }

    const bookItem: OpenTextbookItem = {
      id,
      title,
      url: bookUrl,
      authors: authors.length > 0 ? authors : undefined,
      publisher,
      publicationDate,
      license,
      isbn,
      formats: formats.length > 0 ? formats : undefined,
      descriptionMarkdown,
      tableOfContents: tableOfContents.length > 0 ? tableOfContents : undefined,
      subjects: subjects.length > 0 ? subjects : undefined,
      rating: overallRating,
      reviewCount,
      reviews: reviews.length > 0 ? reviews : undefined,
    };

    const markdown = this.renderBookMarkdown(bookItem);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "book",
        queryUrl: bookUrl,
        totalResults: 1,
        book: bookItem,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleSubjects(
    task: ActorTask,
    _options: OpenTextbookActorTaskOptions,
    baseUrl: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<OpenTextbookActorResult>> {
    const subjectsUrl = `${baseUrl}/opentextbooks/subjects`;

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(subjectsUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 403,
        errorMessage: `SSRF check failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(subjectsUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, application/xhtml+xml, */*",
      },
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Failed to fetch subjects list: HTTP ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const subjects: OpenTextbookSubject[] = [];

    $(".subject-item, .subjects-list li a, .Subject-link, a[href*='/subjects/']").each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const href = $el.attr("href") || "";

      if (!text || !href) return;

      const slugMatch = href.match(/\/subjects\/([0-9a-zA-Z_-]+)/);
      if (!slugMatch) return;

      const slug = slugMatch[1];
      const countMatch = text.match(/\(([0-9]+)\)/);
      const bookCount = countMatch ? Number.parseInt(countMatch[1], 10) : undefined;
      const cleanName = text.replace(/\([0-9]+\)/, "").trim();

      const url = href.startsWith("http")
        ? href
        : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

      if (!subjects.some((s) => s.slug === slug)) {
        subjects.push({
          name: cleanName,
          slug,
          bookCount,
          url,
        });
      }
    });

    const lines: string[] = [
      "# Open Textbook Library Academic Subjects",
      `Source URL: ${subjectsUrl}`,
      `Total Subjects: ${subjects.length}`,
      "",
      "| # | Subject Name | Slug | Books Available | URL |",
      "|---|--------------|------|-----------------|-----|",
    ];

    subjects.forEach((s, idx) => {
      lines.push(`| ${idx + 1} | ${s.name} | \`${s.slug}\` | ${s.bookCount ?? "N/A"} | ${s.url} |`);
    });

    const markdown = lines.join("\n");

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "subjects",
        queryUrl: subjectsUrl,
        totalResults: subjects.length,
        subjects,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private renderSearchMarkdown(query: string, books: OpenTextbookItem[]): string {
    const lines: string[] = [
      `# Open Textbook Library Search Results: "${query}"`,
      `Total Textbooks: ${books.length}`,
      "",
    ];

    if (books.length === 0) {
      lines.push("No matching peer-reviewed textbooks found.");
      return lines.join("\n");
    }

    books.forEach((b, idx) => {
      lines.push(`### ${idx + 1}. [${b.title}](${b.url})`);
      if (b.authors && b.authors.length > 0) {
        lines.push(`- **Authors:** ${b.authors.join(", ")}`);
      }
      if (b.publisher) {
        lines.push(`- **Publisher:** ${b.publisher}`);
      }
      if (b.rating) {
        lines.push(`- **Rating:** ${b.rating}/5 (${b.reviewCount ?? 0} reviews)`);
      }
      if (b.descriptionMarkdown) {
        lines.push(`> ${b.descriptionMarkdown.slice(0, 250)}...`);
      }
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  private renderBookMarkdown(book: OpenTextbookItem): string {
    const lines: string[] = [`# ${book.title}`, `URL: ${book.url}`];

    if (book.authors && book.authors.length > 0) {
      lines.push(`- **Authors:** ${book.authors.join(", ")}`);
    }
    if (book.publisher) {
      lines.push(`- **Publisher:** ${book.publisher}`);
    }
    if (book.publicationDate) {
      lines.push(`- **Publication Date:** ${book.publicationDate}`);
    }
    if (book.license) {
      lines.push(`- **License:** ${book.license}`);
    }
    if (book.isbn) {
      lines.push(`- **ISBN:** ${book.isbn}`);
    }
    if (book.rating) {
      lines.push(`- **Peer Review Rating:** ${book.rating}/5 (${book.reviewCount ?? 0} reviews)`);
    }

    if (book.formats && book.formats.length > 0) {
      lines.push("", "### Downloadable Formats & Links", "");
      for (const fmt of book.formats) {
        lines.push(`- [${fmt.format}](${fmt.url})`);
      }
    }

    lines.push("", "---", "");

    if (book.descriptionMarkdown) {
      lines.push("## About the Textbook", "", book.descriptionMarkdown);
    }

    if (book.tableOfContents && book.tableOfContents.length > 0) {
      lines.push("", "## Table of Contents", "");
      for (const toc of book.tableOfContents) {
        lines.push(`- ${toc}`);
      }
    }

    if (book.reviews && book.reviews.length > 0) {
      lines.push("", "## Peer Reviews", "");
      for (const rev of book.reviews) {
        lines.push(
          `### Review by ${rev.reviewer}${rev.institution ? ` (${rev.institution})` : ""}`
        );
        if (rev.rating) {
          lines.push(`**Rating:** ${rev.rating}/5 | **Date:** ${rev.reviewDate || "N/A"}`);
        }
        lines.push("", rev.commentsMarkdown, "");
      }
    }

    return lines.join("\n").trim();
  }
}
