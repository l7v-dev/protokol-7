/**
 * Scraping actor contracts and execution types.
 */

export type EntityId = string;

export type ActorType =
  | "cheerio-scraper"
  | "playwright-browser"
  | "crawler"
  | "api-extractor";

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
