/**
 * Scraping actor contracts and execution types.
 */

import type { StoredSessionState } from "../browser/session-vault";
import type { ProxyConfig } from "../network/proxy-manager";
import type { RetryOptions } from "../network/retry-handler";

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
  | "pdf-document"
  | "saglik-ekutuphane"
  | "arxiv"
  | "wikimedia"
  | "openalex"
  | "stack-exchange"
  | "gutenberg"
  | "europe-pmc"
  | "ietf-rfc"
  | "ktb-ekitap"
  | "document-extractor"
  | "archive-extractor"
  | "epub-extractor";

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
  frontierDirectory?: string;
  outputJsonlPath?: string;
  resume?: boolean;
  proxy?: ProxyConfig;
  retryOptions?: RetryOptions;
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
  maxTokens?: number;
  maxOutputLength?: number;
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
  isTruncated?: boolean;
  retainedTokenCount?: number;
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
  query?: string;
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

export type PdfAnomalyStatus =
  | "EXTRACTABLE"
  | "SCANNED_IMAGE_ONLY"
  | "EMPTY_TEXT_LAYER"
  | "PASSWORD_PROTECTED"
  | "CORRUPT_PAYLOAD"
  | "ENCODING_ERROR";

export interface PdfDocumentAnomalyInfo {
  status: PdfAnomalyStatus;
  isAnomaly: boolean;
  reason?: string;
  averageCharsPerPage: number;
  ocrRecommended: boolean;
  detectedImageCount?: number;
}

export interface PdfDocumentTaskOptions {
  maxPages?: number;
  pdfBase64?: string;
  timeoutMs?: number;
  quarantineOnAnomaly?: boolean;
  enableOcrFallback?: boolean;
  ocrConnector?: string;
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
  anomaly?: PdfDocumentAnomalyInfo;
  quarantined?: boolean;
  ocrApplied?: boolean;
  ocrConnectorUsed?: string;
}

export type SupportedDocumentFormat = "docx" | "xlsx" | "csv" | "tsv" | "txt" | "json" | "yaml";

export interface DocumentExtractorTaskOptions {
  format?: SupportedDocumentFormat;
  documentBase64?: string;
  timeoutMs?: number;
  maxRows?: number;
  delimiter?: string;
}

export interface DocumentSpreadsheetSheet {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  records: Array<Record<string, unknown>>;
  markdownTable?: string;
}

export interface DocumentExtractorResult {
  url?: string;
  format: SupportedDocumentFormat;
  fullText: string;
  totalCharacters: number;
  totalWords?: number;
  metadata?: Record<string, unknown>;
  sheets?: DocumentSpreadsheetSheet[];
  records?: Array<Record<string, unknown>>;
  markdownTable?: string;
}

export type ArchiveFormat = "zip" | "tar" | "tar.gz" | "gz" | "rar" | "unknown";

export interface ArchiveEntryResult {
  path: string;
  size: number;
  compressedSize?: number;
  mimeType: string;
  sha256: string;
  textPreview?: string;
}

export interface ArchiveExtractorTaskOptions {
  archiveBase64?: string;
  format?: ArchiveFormat;
  maxFiles?: number;
  maxTotalBytes?: number;
  extractTextPreviews?: boolean;
  previewLength?: number;
  timeoutMs?: number;
}

export interface ArchiveExtractorResult {
  url?: string;
  format: ArchiveFormat;
  totalFiles: number;
  totalUncompressedBytes: number;
  entries: ArchiveEntryResult[];
  securityCheckPassed: boolean;
}

export interface PublicationIssueMetadata {
  publicationTitle: string;
  issn?: string;
  isbn?: string;
  volume?: string;
  issue?: string;
  publicationDate?: string;
  publisher?: string;
  language?: string;
  doi?: string;
  authors?: string[];
  description?: string;
}

export interface TableOfContentsItem {
  id: string;
  title: string;
  level: number;
  href?: string;
  pageNumber?: number;
  children?: TableOfContentsItem[];
}

export interface EpubChapterItem {
  id: string;
  title: string;
  href: string;
  markdownContent: string;
  wordCount: number;
  characterCount: number;
}

export interface EpubExtractorTaskOptions {
  epubBase64?: string;
  includeTableOfContents?: boolean;
  maxChapters?: number;
  timeoutMs?: number;
}

export interface EpubExtractorResult {
  url?: string;
  metadata: PublicationIssueMetadata;
  tableOfContents: TableOfContentsItem[];
  chapters: EpubChapterItem[];
  fullText: string;
  totalChapters: number;
  totalWords: number;
  totalCharacters: number;
}

export interface MultiColumnLayoutOptions {
  enabled?: boolean;
  minColumnGap?: number;
  expectedColumns?: number;
}

export interface ArxivAuthor {
  name: string;
  affiliation?: string;
}

export interface ArxivPaperItem {
  id: string;
  entryUrl: string;
  title: string;
  summary: string;
  authors: ArxivAuthor[];
  published: string;
  updated: string;
  primaryCategory: string;
  categories: string[];
  doi?: string;
  comment?: string;
  journalRef?: string;
  pdfUrl: string;
  htmlUrl: string;
  fullText?: string;
  pageCount?: number;
}

export interface ArxivActorTaskOptions {
  searchQuery?: string;
  idList?: string[];
  start?: number;
  maxResults?: number;
  sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate";
  sortOrder?: "ascending" | "descending";
  downloadPdf?: boolean;
  timeoutMs?: number;
}

export interface ArxivActorResult {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  papers: ArxivPaperItem[];
  queryUrl: string;
}

export interface WikimediaArticleItem {
  title: string;
  extract?: string;
  description?: string;
  url: string;
  markdown?: string;
  lang: string;
  thumbnailUrl?: string;
  coordinates?: { lat: number; lon: number };
  timestamp?: string;
}

export interface WikimediaActorTaskOptions {
  lang?: string;
  title?: string;
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface WikimediaActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikimediaArticleItem[];
  queryUrl: string;
}

export interface OpenAlexWorkItem {
  id: string;
  doi?: string;
  title: string;
  displayName: string;
  publicationYear?: number;
  abstract?: string;
  authors: string[];
  citedByCount: number;
  openAccessUrl?: string;
  isOpenAccess: boolean;
  concepts: string[];
  sourceVenue?: string;
}

export interface OpenAlexActorTaskOptions {
  searchQuery?: string;
  doi?: string;
  author?: string;
  concept?: string;
  publicationYear?: number;
  minCitations?: number;
  isOpenAccess?: boolean;
  perPage?: number;
  page?: number;
  mailto?: string;
  timeoutMs?: number;
}

export interface OpenAlexActorResult {
  totalResults: number;
  perPage: number;
  page: number;
  works: OpenAlexWorkItem[];
  queryUrl: string;
}

export interface StackExchangeAnswerItem {
  answerId: number;
  score: number;
  isAccepted: boolean;
  bodyMarkdown: string;
  authorName?: string;
  creationDate: number;
}

export interface StackExchangeQuestionItem {
  questionId: number;
  title: string;
  bodyMarkdown: string;
  score: number;
  tags: string[];
  link: string;
  isAnswered: boolean;
  acceptedAnswerId?: number;
  answers: StackExchangeAnswerItem[];
  instructionPair?: {
    prompt: string;
    completion: string;
  };
}

export interface StackExchangeActorTaskOptions {
  query?: string;
  site?: string;
  tagged?: string;
  minScore?: number;
  acceptedOnly?: boolean;
  order?: "desc" | "asc";
  sort?: "votes" | "activity" | "creation" | "relevance";
  pageSize?: number;
  page?: number;
  apiKey?: string;
  timeoutMs?: number;
}

export interface StackExchangeActorResult {
  site: string;
  totalItems: number;
  hasMore: boolean;
  questions: StackExchangeQuestionItem[];
  queryUrl: string;
}

export interface GutenbergBookItem {
  id: number;
  title: string;
  authors: string[];
  subjects: string[];
  languages: string[];
  downloadCount: number;
  textUrl?: string;
  cleanText?: string;
}

export interface GutenbergActorTaskOptions {
  searchQuery?: string;
  topic?: string;
  languages?: string[];
  bookId?: number;
  downloadText?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface GutenbergActorResult {
  totalCount: number;
  books: GutenbergBookItem[];
  queryUrl: string;
}

export interface EuropePmcArticleItem {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: number;
  abstractText?: string;
  isOpenAccess: boolean;
  hasTextMinedTerms?: boolean;
  fullTextUrl?: string;
}

export interface EuropePmcActorTaskOptions {
  query?: string;
  openAccessOnly?: boolean;
  pageSize?: number;
  cursorMark?: string;
  synonym?: boolean;
  timeoutMs?: number;
}

export interface EuropePmcActorResult {
  hitCount: number;
  nextCursorMark?: string;
  articles: EuropePmcArticleItem[];
  queryUrl: string;
}

export interface IetfRfcItem {
  rfcNumber: number;
  title: string;
  abstract?: string;
  status?: string;
  authors?: string[];
  pubDate?: string;
  url: string;
  obsoletes?: string[];
  obsoletedBy?: string[];
  cleanText?: string;
}

export interface IetfRfcActorTaskOptions {
  rfcNumber?: number;
  query?: string;
  stream?: string;
  status?: string;
  limit?: number;
  downloadText?: boolean;
  timeoutMs?: number;
}

export interface IetfRfcActorResult {
  totalResults: number;
  rfcs: IetfRfcItem[];
  queryUrl: string;
}

export type SaglikEkutuphaneCategory = "all" | "books" | "journals" | "articles";
export type SaglikEkutuphaneAction = "list" | "detail" | "extract";

export interface SaglikEkutuphaneItem {
  id: number;
  title: string;
  category: string;
  detailUrl: string;
  downloadUrl?: string;
  publisher?: string;
  year?: string;
  language?: string;
  pageCount?: number;
  fileSizeBytes?: number;
  originalFilename?: string;
  extractedText?: string;
}

export interface SaglikEkutuphaneTaskOptions {
  action?: SaglikEkutuphaneAction;
  category?: SaglikEkutuphaneCategory;
  publicationId?: number;
  page?: number;
  limit?: number;
  downloadPdf?: boolean;
  timeoutMs?: number;
}

export interface SaglikEkutuphaneActorResult {
  totalItems: number;
  action: SaglikEkutuphaneAction;
  category?: SaglikEkutuphaneCategory;
  page?: number;
  items: SaglikEkutuphaneItem[];
  queryUrl: string;
}

export type KtbEkitapCategory =
  | "all"
  | "edebiyat"
  | "halk-bilimi"
  | "halk-kutuphaneleri"
  | "kultur"
  | "kulturel-miras"
  | "kutuphanecilik"
  | "sanat"
  | "tanitim"
  | "tarih"
  | "son-eklenen";

export type KtbEkitapAction = "list" | "detail" | "extract";

export interface KtbEkitapItem {
  id: number;
  title: string;
  category?: string;
  detailUrl: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  author?: string;
  publisher?: string;
  year?: string;
  pageCount?: number;
  summary?: string;
  extractedMarkdown?: string;
}

export interface KtbEkitapTaskOptions {
  action?: KtbEkitapAction;
  category?: KtbEkitapCategory;
  bookId?: number;
  detailUrl?: string;
  page?: number;
  limit?: number;
  downloadPdf?: boolean;
  timeoutMs?: number;
}

export interface KtbEkitapActorResult {
  totalItems: number;
  action: KtbEkitapAction;
  category?: KtbEkitapCategory;
  page?: number;
  items: KtbEkitapItem[];
  queryUrl: string;
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
    arxivOptions?: ArxivActorTaskOptions;
    wikimediaOptions?: WikimediaActorTaskOptions;
    openalexOptions?: OpenAlexActorTaskOptions;
    stackExchangeOptions?: StackExchangeActorTaskOptions;
    gutenbergOptions?: GutenbergActorTaskOptions;
    europePmcOptions?: EuropePmcActorTaskOptions;
    ietfRfcOptions?: IetfRfcActorTaskOptions;
    saglikEkutuphaneOptions?: SaglikEkutuphaneTaskOptions;
    ktbEkitapOptions?: KtbEkitapTaskOptions;
    documentOptions?: DocumentExtractorTaskOptions;
    archiveOptions?: ArchiveExtractorTaskOptions;
    epubOptions?: EpubExtractorTaskOptions;
    contentType?: "markdown" | "text" | "html";
    proxy?: ProxyConfig;
    storageState?: string | StoredSessionState;
    retryOptions?: RetryOptions;
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

export interface SelfHealingError {
  code: string;
  message: string;
  retryable: boolean;
  remedy: string;
  timestamp: string;
  details?: unknown;
}

export interface SelfHealingErrorResponse {
  success: false;
  error: string;
  code: string;
  retryable: boolean;
  remedy: string;
  timestamp: string;
  details?: unknown;
}
