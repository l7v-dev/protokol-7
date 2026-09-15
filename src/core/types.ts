/**
 * Scraping actor contracts and execution types.
 */

export type EntityId = string;

export type ActorType =
  | "cheerio-scraper"
  | "playwright-browser"
  | "crawler"
  | "api-extractor"
  | "sitemap-xml"
  | "markdown-reader"
  | "network-interceptor"
  | "serp-search"
  | "pdf-document";

export interface ExtractedTable {
  id: string;
  headers: string[];
  rows: string[][];
  records: Array<Record<string, string>>;
  markdown: string;
}

export interface ScrapedPageResult {
  url: string;
  title: string;
  description?: string;
  favicon?: string;
  content: string;
  markdown?: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  isArticle?: boolean;
  rawHtml?: string;
  selectedData?: Record<string, string>;
  screenshotBase64?: string;
  links?: string[];
  tables?: ExtractedTable[];
  jsonLd?: unknown[];
}

export interface ApiPaginationConfig {
  type: "page" | "offset" | "cursor";
  pageParam?: string;
  limitParam?: string;
  pageSize?: number;
  maxPages?: number;
  cursorPath?: string;
  nextUrlPath?: string;
}

export interface ApiExtractorTaskOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  queryParams?: Record<string, string | number | boolean>;
  body?: unknown;
  timeoutMs?: number;
  bearerToken?: string;
  apiKey?: {
    name: string;
    value: string;
    in?: "header" | "query";
  };
  pagination?: ApiPaginationConfig;
  projectionKeys?: string[];
}

export interface ApiExtractorResult {
  statusCode: number;
  headers: Record<string, string>;
  data: unknown;
  itemCount?: number;
  paginationMetadata?: {
    totalPagesFetched: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface CrawledPageData {
  url: string;
  title: string;
  description?: string;
  content: string;
  links: string[];
  tables?: ExtractedTable[];
}

export interface CrawlerTaskOptions {
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  renderJavaScript?: boolean;
  respectRobotsTxt?: boolean;
  sameDomainOnly?: boolean;
  extractTables?: boolean;
  extractJsonLd?: boolean;
  timeoutMs?: number;
}

export interface CrawlerResult {
  startUrl: string;
  totalCrawled: number;
  pages: CrawledPageData[];
  failedUrls: string[];
}

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export interface SitemapTaskOptions {
  maxUrls?: number;
  maxDepth?: number;
  timeoutMs?: number;
  filterPatterns?: string[];
  respectRobotsTxt?: boolean;
}

export interface SitemapResult {
  sitemapUrl: string;
  isIndex: boolean;
  totalUrls: number;
  subSitemaps?: string[];
  urls: SitemapUrlEntry[];
}

export interface MarkdownHeadingItem {
  level: number;
  text: string;
  slug: string;
}

export interface MarkdownReaderTaskOptions {
  includeFrontmatter?: boolean;
  includeTableOfContents?: boolean;
  charThreshold?: number;
  maxContentLength?: number;
  preserveImages?: boolean;
  timeoutMs?: number;
}

export interface MarkdownReaderResult {
  url: string;
  title: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  publishedTime?: string;
  frontmatterYaml?: string;
  contentMarkdown: string;
  fullDocumentMarkdown: string;
  estimatedTokenCount: number;
  characterCount: number;
  wordCount: number;
  tableOfContents: MarkdownHeadingItem[];
  tables?: ExtractedTable[];
}

export interface InterceptedApiResponse {
  url: string;
  method: string;
  statusCode: number;
  headers: Record<string, string>;
  requestPayload?: unknown;
  responseJson: unknown;
  timestamp: number;
}

export interface NetworkInterceptorTaskOptions {
  urlPatterns?: string[];
  captureHeaders?: boolean;
  waitForNetworkIdleMs?: number;
  maxCapturedRequests?: number;
  timeoutMs?: number;
}

export interface NetworkInterceptorResult {
  pageUrl: string;
  totalCaptured: number;
  responses: InterceptedApiResponse[];
}

export interface SerpResultItem {
  rank: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface SerpSearchTaskOptions {
  maxResults?: number;
  timeoutMs?: number;
  region?: string;
}

export interface SerpSearchResult {
  query: string;
  totalResults: number;
  items: SerpResultItem[];
}

export interface PdfDocumentMetadata {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

export interface PdfPageEntry {
  pageNumber: number;
  text: string;
  characterCount: number;
  wordCount: number;
}

export interface PdfDocumentTaskOptions {
  maxPages?: number;
  pdfBase64?: string;
  timeoutMs?: number;
}

export interface PdfDocumentResult {
  url?: string;
  totalPages: number;
  extractedPages: number;
  metadata?: PdfDocumentMetadata;
  pages: PdfPageEntry[];
  fullText: string;
  totalCharacters: number;
  totalWords: number;
}

export interface ActorTask {
  taskId: EntityId;
  actorType: ActorType;
  targetUrl: string;
  selectors?: Record<string, string>;
  options?: {
    timeoutMs?: number;
    waitForSelector?: string;
    renderJavaScript?: boolean;
    captureScreenshot?: boolean;
    headers?: Record<string, string>;
    apiOptions?: ApiExtractorTaskOptions;
    extractTables?: boolean;
    extractJsonLd?: boolean;
    blockAssets?: boolean;
    crawlerOptions?: CrawlerTaskOptions;
    sitemapOptions?: SitemapTaskOptions;
    markdownOptions?: MarkdownReaderTaskOptions;
    networkInterceptorOptions?: NetworkInterceptorTaskOptions;
    serpOptions?: SerpSearchTaskOptions;
    pdfOptions?: PdfDocumentTaskOptions;
    contentType?: "markdown" | "text" | "html";
  };
}

export interface ActorResult<T = unknown> {
  taskId: EntityId;
  actorType: ActorType;
  status: "completed" | "failed" | "timed_out";
  statusCode?: number;
  data?: T;
  errorMessage?: string;
  executionDurationMs: number;
}

export interface ActorRunContext {
  task: ActorTask;
  startTime: number;
}

export interface IActor<T = unknown> {
  readonly actorType: ActorType;
  readonly description: string;
  run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<T>>;
}
