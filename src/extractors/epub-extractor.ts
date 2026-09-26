/**
 * Zero-dependency EPUB 2/3 Extractor.
 * Unpacks container, parses OPF metadata & spine reading order, builds hierarchical TOC,
 * and converts XHTML chapter bodies into clean GFM Markdown.
 */

import path from "node:path";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { ArchiveGuard } from "../archive/archive-guard";
import { ZipParser } from "../archive/zip-parser";
import type {
  EpubChapterItem,
  EpubExtractorResult,
  EpubExtractorTaskOptions,
  PublicationIssueMetadata,
  TableOfContentsItem,
} from "../core/types";
import { StructuredExtractor } from "./structured-extractor";

interface ManifestEntry {
  id: string;
  href: string;
  resolvedPath: string;
  mediaType: string;
  properties?: string;
}

export class EpubExtractor {
  private static readonly CONTAINER_PATH = "META-INF/container.xml";

  /**
   * Extracts publication metadata, table of contents hierarchy, and ordered markdown chapters
   * from an EPUB container buffer without external dependencies.
   */
  public static extract(
    buffer: Buffer,
    options: EpubExtractorTaskOptions = {}
  ): EpubExtractorResult {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 30) {
      throw new Error(
        "Invalid EPUB payload: Buffer is empty or too short to be a valid ZIP archive."
      );
    }

    // 1. Unpack ZIP entries
    const rawEntries = ZipParser.parse(buffer);
    if (rawEntries.length === 0) {
      throw new Error("Invalid EPUB archive: Unable to unpack ZIP container or no entries found.");
    }

    const entriesMap = new Map<string, Buffer>();
    let totalUncompressedBytes = 0;
    let fileCount = 0;

    for (const item of rawEntries) {
      if (item.isDirectory) continue;

      const validatedPath = ArchiveGuard.validatePath(item.path);
      ArchiveGuard.checkBombLimits(totalUncompressedBytes, item.data.length, fileCount + 1);

      totalUncompressedBytes += item.data.length;
      fileCount++;

      entriesMap.set(validatedPath, item.data);
      entriesMap.set(validatedPath.toLowerCase(), item.data);
    }

    // 2. Validate mimetype if present
    const mimetypeBuffer = entriesMap.get("mimetype");
    if (mimetypeBuffer) {
      const mimetypeStr = mimetypeBuffer.toString("utf8").trim();
      if (!mimetypeStr.startsWith("application/epub+zip")) {
        throw new Error(
          `Invalid EPUB mimetype: Expected 'application/epub+zip', found '${mimetypeStr}'.`
        );
      }
    }

    // 3. Locate and parse META-INF/container.xml
    const containerBuffer =
      entriesMap.get(EpubExtractor.CONTAINER_PATH) ??
      entriesMap.get(EpubExtractor.CONTAINER_PATH.toLowerCase());

    if (!containerBuffer) {
      throw new Error(
        `Invalid EPUB archive: Missing '${EpubExtractor.CONTAINER_PATH}' packaging descriptor.`
      );
    }

    const opfRelativePath = EpubExtractor.parseContainerXml(containerBuffer.toString("utf8"));
    const opfNormalizedPath = path.posix.normalize(opfRelativePath);

    // 4. Retrieve and parse OPF package file
    const opfBuffer =
      entriesMap.get(opfNormalizedPath) ?? entriesMap.get(opfNormalizedPath.toLowerCase());

    if (!opfBuffer) {
      throw new Error(
        `Invalid EPUB archive: Rootfile package '${opfNormalizedPath}' referenced in container.xml not found.`
      );
    }

    const opfDir =
      path.posix.dirname(opfNormalizedPath) === "." ? "" : path.posix.dirname(opfNormalizedPath);
    const opfXml = opfBuffer.toString("utf8");
    const $opf = cheerio.load(opfXml, { xmlMode: true });

    // 5. Extract Dublin Core Metadata
    const metadata = EpubExtractor.extractMetadata($opf);

    // 6. Parse Manifest
    const manifest = EpubExtractor.parseManifest($opf, opfDir);

    // 7. Parse Spine (Linear Reading Order)
    const spineIdRefs = EpubExtractor.parseSpine($opf);

    // 8. Parse Table of Contents (EPUB 3 nav.xhtml or EPUB 2 toc.ncx)
    let tableOfContents: TableOfContentsItem[] = [];
    if (options.includeTableOfContents !== false) {
      tableOfContents = EpubExtractor.extractTableOfContents($opf, manifest, entriesMap);
    }

    // 9. Extract and Convert Ordered Chapters
    const turndown = EpubExtractor.createTurndownService();
    const chapters: EpubChapterItem[] = [];
    const maxChapters = options.maxChapters ?? Number.POSITIVE_INFINITY;

    for (let i = 0; i < spineIdRefs.length; i++) {
      if (chapters.length >= maxChapters) {
        break;
      }

      const idref = spineIdRefs[i];
      const manifestItem = manifest.get(idref);
      if (!manifestItem) continue;

      const chapterBuffer =
        entriesMap.get(manifestItem.resolvedPath) ??
        entriesMap.get(manifestItem.resolvedPath.toLowerCase());

      if (!chapterBuffer) continue;

      const rawHtml = chapterBuffer.toString("utf8");
      const $chap = cheerio.load(rawHtml);

      // Strip dangerous and noisy elements
      $chap("script, style, iframe, object, embed").remove();
      $chap("*").each((_, el) => {
        const attribs = (el as cheerio.Element).attribs || {};
        for (const attr of Object.keys(attribs)) {
          if (attr.startsWith("on")) {
            $chap(el).removeAttr(attr);
          }
        }
      });

      // Resolve chapter title
      const chapterTitle = EpubExtractor.resolveChapterTitle(
        $chap,
        manifestItem.resolvedPath,
        tableOfContents,
        i + 1
      );

      // Convert body to clean GFM Markdown
      const bodyHtml = $chap("body").html() ?? $chap.root().html() ?? "";
      const markdownContent = turndown.turndown(bodyHtml).trim();

      const characterCount = markdownContent.length;
      const wordCount = characterCount > 0 ? markdownContent.trim().split(/\s+/).length : 0;

      chapters.push({
        id: manifestItem.id,
        title: chapterTitle,
        href: manifestItem.href,
        markdownContent,
        wordCount,
        characterCount,
      });
    }

    // 10. Fallback TOC generation if TOC was empty
    if (tableOfContents.length === 0 && chapters.length > 0) {
      tableOfContents = chapters.map((c, idx) => ({
        id: `toc-auto-${idx + 1}`,
        title: c.title,
        level: 1,
        href: c.href,
      }));
    }

    // 11. Aggregate Metrics & Full Text
    const fullText = chapters
      .map((c) => `# ${c.title}\n\n${c.markdownContent}`)
      .join("\n\n---\n\n");

    const totalChapters = chapters.length;
    const totalWords = chapters.reduce((acc, c) => acc + c.wordCount, 0);
    const totalCharacters = chapters.reduce((acc, c) => acc + c.characterCount, 0);

    return {
      metadata,
      tableOfContents,
      chapters,
      fullText,
      totalChapters,
      totalWords,
      totalCharacters,
    };
  }

  /**
   * Parses META-INF/container.xml to locate the primary OPF rootfile.
   */
  private static parseContainerXml(xml: string): string {
    const $ = cheerio.load(xml, { xmlMode: true });
    let rootfilePath = "";

    $("rootfiles > rootfile, rootfile").each((_, el) => {
      const fullPath = $(el).attr("full-path");
      const mediaType = $(el).attr("media-type");

      if (fullPath) {
        if (!rootfilePath || mediaType === "application/oebps-package+xml") {
          rootfilePath = fullPath;
        }
      }
    });

    if (!rootfilePath) {
      throw new Error(
        "Invalid EPUB container: No valid 'rootfile' with 'full-path' found in container.xml."
      );
    }

    return rootfilePath;
  }

  /**
   * Extracts Dublin Core metadata and identifiers from OPF package.
   */
  private static extractMetadata($opf: cheerio.CheerioAPI): PublicationIssueMetadata {
    const getField = (name: string): string | undefined => {
      let val: string | undefined;
      $opf("metadata *").each((_, el) => {
        const tag = (el as cheerio.Element).name || "";
        if (tag === name || tag === `dc:${name}` || tag.endsWith(`:${name}`)) {
          const text = $opf(el).text().trim();
          if (text && !val) {
            val = text;
          }
        }
      });
      return val;
    };

    const getFields = (name: string): string[] => {
      const results: string[] = [];
      $opf("metadata *").each((_, el) => {
        const tag = (el as cheerio.Element).name || "";
        if (tag === name || tag === `dc:${name}` || tag.endsWith(`:${name}`)) {
          const text = $opf(el).text().trim();
          if (text) results.push(text);
        }
      });
      return results;
    };

    const publicationTitle = getField("title") || "Untitled Publication";
    const authors = getFields("creator");
    const publisher = getField("publisher");
    const language = getField("language");
    const publicationDate = getField("date");
    const description = getField("description");

    const identifiers = getFields("identifier");
    let isbn: string | undefined;
    let doi: string | undefined;

    for (const id of identifiers) {
      const lower = id.toLowerCase();
      if (lower.startsWith("urn:isbn:") || lower.includes("isbn")) {
        isbn = id.replace(/^urn:isbn:/i, "").trim();
      } else if (lower.startsWith("urn:doi:") || lower.startsWith("10.")) {
        doi = id.replace(/^urn:doi:/i, "").trim();
      } else if (!isbn && /^[\d-]{10,17}$/.test(id.trim())) {
        isbn = id.trim();
      }
    }

    return {
      publicationTitle,
      authors: authors.length > 0 ? authors : undefined,
      publisher,
      language,
      publicationDate,
      description,
      isbn,
      doi,
    };
  }

  /**
   * Parses OPF manifest items into a lookup map with resolved archive paths.
   */
  private static parseManifest(
    $opf: cheerio.CheerioAPI,
    opfDir: string
  ): Map<string, ManifestEntry> {
    const manifest = new Map<string, ManifestEntry>();

    $opf("manifest > item, item").each((_, el) => {
      const id = $opf(el).attr("id");
      const href = $opf(el).attr("href");
      const mediaType = $opf(el).attr("media-type") || "";
      const properties = $opf(el).attr("properties");

      if (id && href) {
        const cleanHref = decodeURIComponent(href.split("#")[0].split("?")[0]);
        const resolvedPath = path.posix.normalize(
          opfDir ? path.posix.join(opfDir, cleanHref) : cleanHref
        );

        manifest.set(id, {
          id,
          href,
          resolvedPath,
          mediaType,
          properties,
        });
      }
    });

    return manifest;
  }

  /**
   * Parses OPF spine into an ordered array of manifest item IDs.
   */
  private static parseSpine($opf: cheerio.CheerioAPI): string[] {
    const spine: string[] = [];

    $opf("spine > itemref, itemref").each((_, el) => {
      const idref = $opf(el).attr("idref");
      const linear = $opf(el).attr("linear");

      // Skip non-linear aux items if specified
      if (idref && linear !== "no") {
        spine.push(idref);
      } else if (idref && linear === "no" && !spine.includes(idref)) {
        spine.push(idref);
      }
    });

    return spine;
  }

  /**
   * Extracts Table of Contents hierarchy supporting EPUB 3 nav.xhtml and EPUB 2 toc.ncx.
   */
  private static extractTableOfContents(
    $opf: cheerio.CheerioAPI,
    manifest: Map<string, ManifestEntry>,
    entriesMap: Map<string, Buffer>
  ): TableOfContentsItem[] {
    // 1. Try EPUB 3 Navigation Document (properties="nav")
    for (const item of manifest.values()) {
      if (item.properties?.split(/\s+/).includes("nav")) {
        const navBuffer =
          entriesMap.get(item.resolvedPath) ?? entriesMap.get(item.resolvedPath.toLowerCase());

        if (navBuffer) {
          const navItems = EpubExtractor.parseEpub3Nav(
            navBuffer.toString("utf8"),
            path.posix.dirname(item.resolvedPath)
          );
          if (navItems.length > 0) {
            return navItems;
          }
        }
      }
    }

    // 2. Try EPUB 2 NCX Document (spine toc attribute or media-type application/x-dtbncx+xml)
    const spineTocId = $opf("spine").attr("toc");
    let ncxEntry: ManifestEntry | undefined;

    if (spineTocId) {
      ncxEntry = manifest.get(spineTocId);
    }

    if (!ncxEntry) {
      for (const item of manifest.values()) {
        if (item.mediaType === "application/x-dtbncx+xml" || item.resolvedPath.endsWith(".ncx")) {
          ncxEntry = item;
          break;
        }
      }
    }

    if (ncxEntry) {
      const ncxBuffer =
        entriesMap.get(ncxEntry.resolvedPath) ??
        entriesMap.get(ncxEntry.resolvedPath.toLowerCase());

      if (ncxBuffer) {
        const ncxItems = EpubExtractor.parseEpub2Ncx(
          ncxBuffer.toString("utf8"),
          path.posix.dirname(ncxEntry.resolvedPath)
        );
        if (ncxItems.length > 0) {
          return ncxItems;
        }
      }
    }

    return [];
  }

  /**
   * Parses EPUB 3 HTML5 Navigation Document (<nav epub:type="toc">).
   */
  private static parseEpub3Nav(html: string, navDir: string): TableOfContentsItem[] {
    const $ = cheerio.load(html);
    let navElem = $("nav[epub\\:type='toc'], nav[role='doc-toc'], nav#toc");
    if (navElem.length === 0) {
      navElem = $("nav").first();
    }

    if (navElem.length === 0) return [];

    const rootList = navElem.children("ol, ul").first();
    if (rootList.length === 0) return [];

    const parseList = (
      listEl: cheerio.Cheerio<cheerio.Element>,
      level: number
    ): TableOfContentsItem[] => {
      const items: TableOfContentsItem[] = [];

      listEl.children("li").each((_, li) => {
        const anchor = $(li).children("a, span").first();
        const rawTitle = anchor.text().trim();
        const href = anchor.attr("href");

        const subList = $(li).children("ol, ul").first();
        const children = subList.length > 0 ? parseList(subList, level + 1) : undefined;

        const resolvedHref = href
          ? path.posix.normalize(navDir ? path.posix.join(navDir, href) : href)
          : undefined;

        items.push({
          id: `toc-nav-${level}-${items.length + 1}`,
          title: rawTitle || `Section ${items.length + 1}`,
          level,
          href: resolvedHref,
          ...(children && children.length > 0 ? { children } : {}),
        });
      });

      return items;
    };

    return parseList(rootList, 1);
  }

  /**
   * Parses EPUB 2 NCX Document (<ncx><navMap>).
   */
  private static parseEpub2Ncx(xml: string, ncxDir: string): TableOfContentsItem[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const navMap = $("navMap");
    if (navMap.length === 0) return [];

    const parsePoints = (
      parentEl: cheerio.Cheerio<cheerio.Element>,
      level: number
    ): TableOfContentsItem[] => {
      const items: TableOfContentsItem[] = [];

      parentEl.children("navPoint").each((_, el) => {
        const id = $(el).attr("id") || `navpoint-${level}-${items.length + 1}`;
        const title =
          $(el).children("navLabel").children("text").first().text().trim() || "Untitled Section";
        const contentSrc = $(el).children("content").first().attr("src");

        const childPoints = parsePoints($(el), level + 1);

        const resolvedHref = contentSrc
          ? path.posix.normalize(ncxDir ? path.posix.join(ncxDir, contentSrc) : contentSrc)
          : undefined;

        items.push({
          id,
          title,
          level,
          href: resolvedHref,
          ...(childPoints.length > 0 ? { children: childPoints } : {}),
        });
      });

      return items;
    };

    return parsePoints(navMap, 1);
  }

  /**
   * Resolves the most descriptive title for a chapter file.
   */
  private static resolveChapterTitle(
    $chap: cheerio.CheerioAPI,
    resolvedPath: string,
    toc: TableOfContentsItem[],
    chapterIndex: number
  ): string {
    // 1. Check TOC match
    const findTocTitle = (items: TableOfContentsItem[]): string | undefined => {
      for (const item of items) {
        if (item.href) {
          const itemPath = item.href.split("#")[0];
          if (
            itemPath === resolvedPath ||
            resolvedPath.endsWith(itemPath) ||
            itemPath.endsWith(resolvedPath)
          ) {
            return item.title;
          }
        }
        if (item.children) {
          const childTitle = findTocTitle(item.children);
          if (childTitle) return childTitle;
        }
      }
      return undefined;
    };

    const tocTitle = findTocTitle(toc);
    if (tocTitle) return tocTitle;

    // 2. Check heading 1 or 2
    const heading = $chap("h1, h2").first().text().trim();
    if (heading && heading.length > 0 && heading.length < 120) {
      return heading;
    }

    // 3. Check HTML title
    const htmlTitle = $chap("head > title, title").first().text().trim();
    if (htmlTitle && htmlTitle.length > 0 && htmlTitle.length < 120) {
      return htmlTitle;
    }

    // 4. Fallback: Chapter Index
    return `Chapter ${chapterIndex}`;
  }

  /**
   * Creates a configured Turndown service with GFM table support.
   */
  private static createTurndownService(): TurndownService {
    const service = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
      strongDelimiter: "**",
    });

    service.addRule("gfmTable", {
      filter: "table",
      replacement: (_content, node) => {
        const html = (node as HTMLElement).outerHTML || "";
        const tables = StructuredExtractor.extractTables(html);
        if (tables.length > 0 && tables[0].markdown) {
          return `\n\n${tables[0].markdown}\n\n`;
        }
        return "";
      },
    });

    return service;
  }
}
