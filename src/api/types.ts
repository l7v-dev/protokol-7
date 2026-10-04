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
  | "wikipedia"
  | "openalex"
  | "stack-exchange"
  | "gutenberg"
  | "europe-pmc"
  | "ietf-rfc"
  | "ktb-ekitap"
  | "document-extractor"
  | "archive-extractor"
  | "epub-extractor"
  | "dergipark"
  | "internet-archive"
  | "clinical-trials"
  | "open-fda"
  | "sec-edgar"
  | "court-listener"
  | "software-heritage"
  | "eur-lex"
  | "openstax"
  | "mit-ocw"
  | "resmi-gazete"
  | "yargitay"
  | "kap"
  | "github"
  | "openreview"
  | "hacker-news"
  | "huggingface-datasets"
  | "math-reasoning"
  | "code-eval"
  | "proofwiki"
  | "lean-mathlib"
  | "lesswrong"
  | "youtube-transcripts"
  | "wikisource"
  | "wiktionary"
  | "wikiquote"
  | "wikibooks"
  | "wikiversity"
  | "wikivoyage"
  | "wikinews"
  | "wikispecies"
  | "wikidata"
  | "stanford-phil"
  | "internet-phil"
  | "metamath"
  | "philpapers"
  | "devdocs"
  | "rosetta-code"
  | "papers-with-code"
  | "libretexts"
  | "open-textbook"
  | "semantic-scholar"
  | "anayasa-mahkemesi"
  | "danistay"
  | "google-patents"
  | "perseus-dl"
  | "sacred-texts"
  | "instagram"
  | "pubmed"
  | "biorxiv"
  | "doaj"
  | "aperta"
  | "binance-vision";

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
  multiColumnOptions?: MultiColumnLayoutOptions;
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
  pattern?: string;
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

// ---------------------------------------------------------------------------
// DergiPark
// ---------------------------------------------------------------------------

export type DergiParkAction = "search" | "record" | "list-sets";

export interface DergiParkActorTaskOptions {
  action?: DergiParkAction;
  /**
   * OAI-PMH set identifier, e.g. "tbd:dergi:1234".
   * Required for action="record". Optional filter for action="search".
   */
  set?: string;
  /** OAI-PMH identifier for a single record (action="record"). */
  identifier?: string;
  /** Full-text keyword filter applied client-side on titles/abstracts. */
  keyword?: string;
  /** Maximum number of records to return (default 20). */
  maxRecords?: number;
  /** OAI-PMH resumption token for cursor-based pagination. */
  resumptionToken?: string;
  timeoutMs?: number;
}

export interface DergiParkArticle {
  identifier: string;
  title: string;
  authors: string[];
  abstract?: string;
  keywords?: string[];
  journal?: string;
  issn?: string;
  doi?: string;
  publicationDate?: string;
  language?: string;
  pdfUrl?: string;
  htmlUrl?: string;
}

export interface DergiParkActorResult {
  action: DergiParkAction;
  totalItems: number;
  articles: DergiParkArticle[];
  resumptionToken?: string;
  sets?: Array<{ setSpec: string; setName: string }>;
  queryUrl: string;
}

// ---------------------------------------------------------------------------
// InternetArchive
// ---------------------------------------------------------------------------

export type InternetArchiveAction = "metadata" | "search" | "text";

export interface InternetArchiveActorTaskOptions {
  action?: InternetArchiveAction;
  /** Archive.org item identifier, e.g. "gutenberg99" or "encyclopediabritan28chisrich". */
  identifier?: string;
  /** Full-text search query (action="search"). */
  searchQuery?: string;
  /** Media type filter: "texts", "audio", "movies", etc. */
  mediaType?: string;
  /** Maximum number of search results (default 20). */
  maxResults?: number;
  /** For action="text": maximum characters to return from OCR text stream. */
  maxTextChars?: number;
  /**
   * Specific item identifiers to exclude from search/ingestion.
   */
  excludeIdentifiers?: string[];
  /**
   * Specific collection identifiers to exclude from search (e.g. ["stackexchange"]).
   */
  excludeCollections?: string[];
  /**
   * Whether to exclude specialized relational dataset corpora (defaults to true).
   * When true, excludes items like 'stackexchange' which are harvested by
   * dedicated ETL pipelines (e.g. scripts/stackexchange_pipeline/).
   */
  excludeSpecializedCorpora?: boolean;
  timeoutMs?: number;
}

export interface InternetArchiveFile {
  name: string;
  format: string;
  size?: number;
  url: string;
}

export interface InternetArchiveItem {
  identifier: string;
  title: string;
  creator?: string;
  description?: string;
  subject?: string[];
  publisher?: string;
  date?: string;
  language?: string;
  mediaType?: string;
  downloadUrl?: string;
  textUrl?: string;
  files: InternetArchiveFile[];
}

export interface InternetArchiveActorResult {
  action: InternetArchiveAction;
  totalItems: number;
  items: InternetArchiveItem[];
  extractedText?: string;
  queryUrl: string;
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
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikimediaActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikimediaArticleItem[];
  queryUrl: string;
}

export type WikipediaArticleItem = WikimediaArticleItem;
export type WikipediaActorTaskOptions = WikimediaActorTaskOptions;
export type WikipediaActorResult = WikimediaActorResult;

export interface WikisourceArticleItem {
  title: string;
  url: string;
  extract?: string;
  description?: string;
  fullMarkdown?: string;
  rawHtml?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  lang: string;
}

export interface WikisourceActorTaskOptions {
  lang?: string;
  title?: string;
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikisourceActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikisourceArticleItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WiktionarySenseItem {
  definition: string;
  examples?: string[];
  subdefinitions?: string[];
}

export interface WiktionaryPartOfSpeechItem {
  partOfSpeech: string;
  language: string;
  definitions: WiktionarySenseItem[];
}

export interface WiktionaryEntryItem {
  word: string;
  url: string;
  lang: string;
  etymology?: string;
  partsOfSpeech?: WiktionaryPartOfSpeechItem[];
  pronunciations?: string[];
  synonyms?: string[];
  antonyms?: string[];
  translations?: Record<string, string[]>;
  fullMarkdown?: string;
  rawHtml?: string;
  timestamp?: string;
}

export interface WiktionaryActorTaskOptions {
  lang?: string;
  word?: string;
  words?: string[];
  action?: "definition" | "entry" | "search" | "random";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  extractMarkdown?: boolean;
}

export interface WiktionaryActorResult {
  lang: string;
  action: "definition" | "entry" | "search" | "random";
  items: WiktionaryEntryItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WikiquoteArticleItem {
  title: string;
  url: string;
  extract?: string;
  description?: string;
  fullMarkdown?: string;
  rawHtml?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  lang: string;
}

export interface WikiquoteActorTaskOptions {
  lang?: string;
  title?: string;
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikiquoteActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikiquoteArticleItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WikibooksArticleItem {
  title: string;
  url: string;
  extract?: string;
  description?: string;
  fullMarkdown?: string;
  rawHtml?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  lang: string;
}

export interface WikibooksActorTaskOptions {
  lang?: string;
  title?: string;
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikibooksActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikibooksArticleItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WikiversityArticleItem {
  title: string;
  url: string;
  extract?: string;
  description?: string;
  fullMarkdown?: string;
  rawHtml?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  lang: string;
}

export interface WikiversityActorTaskOptions {
  lang?: string;
  title?: string;
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikiversityActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikiversityArticleItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WikivoyageArticleItem {
  title: string;
  url: string;
  extract?: string;
  description?: string;
  fullMarkdown?: string;
  rawHtml?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  lang: string;
}

export interface WikivoyageActorTaskOptions {
  lang?: string;
  title?: string;
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikivoyageActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikivoyageArticleItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WikinewsArticleItem {
  title: string;
  url: string;
  extract?: string;
  description?: string;
  fullMarkdown?: string;
  rawHtml?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  lang: string;
}

export interface WikinewsActorTaskOptions {
  lang?: string;
  title?: string;
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikinewsActorResult {
  lang: string;
  action: "summary" | "article" | "search";
  items: WikinewsArticleItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WikispeciesTaxonItem {
  taxon: string;
  url: string;
  extract?: string;
  description?: string;
  fullMarkdown?: string;
  rawHtml?: string;
  thumbnailUrl?: string;
  timestamp?: string;
}

export interface WikispeciesActorTaskOptions {
  taxon?: string;
  title?: string;
  titles?: string[];
  action?: "summary" | "article" | "search";
  query?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFullArticles?: boolean;
}

export interface WikispeciesActorResult {
  action: "summary" | "article" | "search";
  items: WikispeciesTaxonItem[];
  queryUrl: string;
  markdown?: string;
}

export interface WikidataEntityItem {
  id: string;
  title?: string;
  url: string;
  label?: string;
  description?: string;
  aliases?: string[];
  claims?: Record<string, Array<{ property: string; value: unknown; datatype?: string }>>;
  sitelinks?: Record<string, { site: string; title: string; url?: string }>;
  rawJson?: Record<string, unknown>;
}

export interface WikidataSparqlBinding {
  [variable: string]: {
    type: string;
    value: string;
    datatype?: string;
    "xml:lang"?: string;
  };
}

export interface WikidataActorTaskOptions {
  action?: "entity" | "search" | "sparql" | "claims";
  entityId?: string;
  entityIds?: string[];
  query?: string;
  sparql?: string;
  propertyId?: string;
  lang?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface WikidataActorResult {
  action: "entity" | "search" | "sparql" | "claims";
  queryUrl: string;
  items?: WikidataEntityItem[];
  sparqlResults?: {
    head: { vars: string[] };
    results: { bindings: WikidataSparqlBinding[] };
  };
  markdown?: string;
}

export interface StanfordPhilTableOfContentsItem {
  sectionNumber?: string;
  title: string;
  anchor: string;
}

export interface StanfordPhilSection {
  title: string;
  level: number;
  content: string;
}

export interface StanfordPhilSearchResultItem {
  title: string;
  slug: string;
  url: string;
  snippet?: string;
}

export interface StanfordPhilEntry {
  slug: string;
  title: string;
  url: string;
  authors: string[];
  pubDate?: string;
  revDate?: string;
  preamble?: string;
  tableOfContents: StanfordPhilTableOfContentsItem[];
  sections: StanfordPhilSection[];
  bibliography: string[];
  relatedEntries: Array<{ slug: string; title: string }>;
  markdown: string;
}

export interface StanfordPhilActorTaskOptions {
  action?: "entry" | "search" | "contents";
  slug?: string;
  query?: string;
  letter?: string;
  limit?: number;
  includeBibliography?: boolean;
  includeRelated?: boolean;
  timeoutMs?: number;
}

export interface StanfordPhilActorResult {
  action: "entry" | "search" | "contents";
  queryUrl: string;
  totalResults: number;
  entry?: StanfordPhilEntry;
  searchResults?: StanfordPhilSearchResultItem[];
  contents?: Array<{ slug: string; title: string; url: string }>;
  markdown?: string;
}

export interface InternetPhilSection {
  title: string;
  level: number;
  content: string;
}

export interface InternetPhilSearchResultItem {
  title: string;
  slug: string;
  url: string;
  snippet?: string;
}

export interface InternetPhilEntry {
  slug: string;
  title: string;
  url: string;
  authors: string[];
  tableOfContents: string[];
  sections: InternetPhilSection[];
  references: string[];
  markdown: string;
}

export interface InternetPhilActorTaskOptions {
  action?: "entry" | "search";
  slug?: string;
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface InternetPhilActorResult {
  action: "entry" | "search";
  queryUrl: string;
  totalResults: number;
  entry?: InternetPhilEntry;
  searchResults?: InternetPhilSearchResultItem[];
  markdown?: string;
}

export interface MetamathHypothesis {
  tag: string;
  type: "essential" | "distinct" | "floating";
  expression: string;
}

export interface MetamathProofStep {
  step: number;
  hyp: string[];
  ref: string;
  expression: string;
}

export interface MetamathTheorem {
  name: string;
  database: string;
  url: string;
  description: string;
  hypotheses: MetamathHypothesis[];
  assertion: string;
  proofSteps?: MetamathProofStep[];
  crossReferences?: {
    usedBy?: string[];
    uses?: string[];
  };
  markdown: string;
}

export interface MetamathSearchResultItem {
  name: string;
  database: string;
  url: string;
  description?: string;
  assertion?: string;
}

export interface MetamathActorTaskOptions {
  action?: "theorem" | "search" | "axiom";
  theorem?: string;
  axiom?: string;
  query?: string;
  database?: "set.mm" | "iset.mm" | "ql.mm";
  limit?: number;
  includeProofSteps?: boolean;
  timeoutMs?: number;
}

export interface MetamathActorResult {
  action: "theorem" | "search" | "axiom";
  queryUrl: string;
  totalResults: number;
  theorem?: MetamathTheorem;
  searchResults?: MetamathSearchResultItem[];
  markdown?: string;
}

export interface PhilPapersRecord {
  id: string;
  title: string;
  url: string;
  authors: string[];
  year?: number;
  publication?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  abstract?: string;
  categories: string[];
  doi?: string;
  directLink?: string;
  openAccess?: boolean;
  markdown: string;
}

export interface PhilPapersSearchResultItem {
  id: string;
  title: string;
  url: string;
  authors: string[];
  year?: number;
  publication?: string;
  snippet?: string;
}

export interface PhilPapersCategoryDetails {
  category: string;
  title: string;
  url: string;
  description?: string;
  subcategories: Array<{ name: string; url: string; count?: number }>;
  topRecords: PhilPapersSearchResultItem[];
}

export interface PhilPapersActorTaskOptions {
  action?: "record" | "search" | "category";
  id?: string;
  query?: string;
  category?: string;
  filterSubject?: string;
  startYear?: number;
  endYear?: number;
  limit?: number;
  timeoutMs?: number;
}

export interface PhilPapersActorResult {
  action: "record" | "search" | "category";
  queryUrl: string;
  totalResults: number;
  record?: PhilPapersRecord;
  searchResults?: PhilPapersSearchResultItem[];
  categoryDetails?: PhilPapersCategoryDetails;
  markdown?: string;
}

// ---------------------------------------------------------------------------
// DevDocs (API Documentation)
// ---------------------------------------------------------------------------

export interface DevDocMeta {
  name: string;
  slug: string;
  type: string;
  version?: string;
  release?: string;
  mtime?: number;
  db_size?: number;
  links?: {
    home?: string;
    code?: string;
  };
  attribution?: string;
  alias?: string;
}

export interface DevDocEntry {
  name: string;
  path: string;
  type: string;
}

export interface DevDocsActorTaskOptions {
  action?: "list_docs" | "search" | "entry";
  doc?: string;
  path?: string;
  query?: string;
  category?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface DevDocsActorResult {
  action: "list_docs" | "search" | "entry";
  queryUrl: string;
  totalResults: number;
  doc?: string;
  path?: string;
  title?: string;
  docs?: DevDocMeta[];
  entries?: DevDocEntry[];
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Rosetta Code (Multi-language Algorithms)
// ---------------------------------------------------------------------------

export interface RosettaCodeImplementation {
  language: string;
  code: string;
  explanation?: string;
  lineCount: number;
}

export interface RosettaCodeSearchResultItem {
  title: string;
  snippet?: string;
  size?: number;
  wordCount?: number;
}

export interface RosettaCodeTaskDetails {
  task: string;
  title: string;
  url: string;
  description: string;
  totalLanguages: number;
  availableLanguages: string[];
  implementations: RosettaCodeImplementation[];
  markdown: string;
}

export interface RosettaCodeActorTaskOptions {
  action?: "task" | "search" | "random" | "languages";
  task?: string;
  language?: string;
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface RosettaCodeActorResult {
  action: "task" | "search" | "random" | "languages";
  queryUrl: string;
  totalResults: number;
  taskDetails?: RosettaCodeTaskDetails;
  searchResults?: RosettaCodeSearchResultItem[];
  languages?: string[];
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Papers With Code / Hugging Face Papers (Machine Learning & Benchmarks)
// ---------------------------------------------------------------------------

export interface PapersWithCodeRepo {
  url: string;
  name?: string;
  stars?: number;
  framework?: string;
  isOfficial?: boolean;
}

export interface PapersWithCodePaperRecord {
  id: string;
  title: string;
  url: string;
  arxivId?: string;
  publishedAt?: string;
  authors: string[];
  summary: string;
  aiSummary?: string;
  upvotes?: number;
  tasks?: string[];
  methods?: string[];
  linkedModels?: string[];
  linkedDatasets?: string[];
  codeRepositories?: PapersWithCodeRepo[];
  markdown: string;
}

export interface PapersWithCodeSearchResultItem {
  id: string;
  title: string;
  url: string;
  arxivId?: string;
  publishedAt?: string;
  authors: string[];
  summary?: string;
  upvotes?: number;
}

export interface PapersWithCodeActorTaskOptions {
  action?: "paper" | "search" | "trending" | "daily";
  paper?: string;
  arxivId?: string;
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface PapersWithCodeActorResult {
  action: "paper" | "search" | "trending" | "daily";
  queryUrl: string;
  totalResults: number;
  paper?: PapersWithCodePaperRecord;
  papers?: PapersWithCodePaperRecord[];
  searchResults?: PapersWithCodeSearchResultItem[];
  markdown?: string;
}

// ---------------------------------------------------------------------------
// LibreTexts (STEM & Engineering Open Textbooks)
// ---------------------------------------------------------------------------

export interface LibreTextsPageItem {
  id?: number | string;
  title: string;
  url: string;
  library: string;
  path?: string;
  contentMarkdown?: string;
  contentHtml?: string;
  summary?: string;
  breadcrumbs?: string[];
  subpages?: Array<{ id?: number | string; title: string; url: string }>;
}

export interface LibreTextsActorTaskOptions {
  action?: "page" | "search" | "subpages" | "toc";
  library?: string;
  pageId?: number | string;
  path?: string;
  query?: string;
  limit?: number;
  includeHtml?: boolean;
  timeoutMs?: number;
}

export interface LibreTextsActorResult {
  action: "page" | "search" | "subpages" | "toc";
  library: string;
  queryUrl: string;
  totalResults: number;
  page?: LibreTextsPageItem;
  pages?: LibreTextsPageItem[];
  subpages?: Array<{ id?: number | string; title: string; url: string }>;
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Open Textbook Library (UMN Curricular Textbooks)
// ---------------------------------------------------------------------------

export interface OpenTextbookReview {
  reviewer: string;
  institution?: string;
  rating?: number;
  reviewDate?: string;
  commentsMarkdown: string;
}

export interface OpenTextbookItem {
  id?: number | string;
  title: string;
  url: string;
  authors?: string[];
  publisher?: string;
  publicationDate?: string;
  license?: string;
  isbn?: string;
  formats?: Array<{ format: string; url: string }>;
  descriptionMarkdown?: string;
  tableOfContents?: string[];
  subjects?: string[];
  rating?: number;
  reviewCount?: number;
  reviews?: OpenTextbookReview[];
}

export interface OpenTextbookSubject {
  name: string;
  slug: string;
  bookCount?: number;
  url: string;
}

export interface OpenTextbookActorTaskOptions {
  action?: "book" | "search" | "subjects";
  bookId?: number | string;
  query?: string;
  subject?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface OpenTextbookActorResult {
  action: "book" | "search" | "subjects";
  queryUrl: string;
  totalResults: number;
  book?: OpenTextbookItem;
  books?: OpenTextbookItem[];
  subjects?: OpenTextbookSubject[];
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Semantic Scholar (Academic Knowledge Graph API)
// ---------------------------------------------------------------------------

export interface SemanticScholarPaperItem {
  paperId: string;
  corpusId?: number;
  title: string;
  url: string;
  abstract?: string;
  tldr?: string;
  venue?: string;
  year?: number;
  publicationDate?: string;
  authors?: Array<{ authorId?: string; name: string }>;
  citationCount?: number;
  referenceCount?: number;
  isOpenAccess?: boolean;
  openAccessPdfUrl?: string;
  fieldsOfStudy?: string[];
  externalIds?: Record<string, string>;
}

export interface SemanticScholarAuthorItem {
  authorId: string;
  name: string;
  aliases?: string[];
  affiliations?: string[];
  homepage?: string;
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  papers?: Array<{ paperId: string; title: string; year?: number }>;
}

export interface SemanticScholarActorTaskOptions {
  action?: "paper" | "search" | "author" | "author_search" | "citations" | "references" | "pdf_ocr";
  paperId?: string;
  authorId?: string;
  query?: string;
  fields?: string;
  limit?: number;
  offset?: number;
  year?: string;
  apiKey?: string;
  timeoutMs?: number;
  /** pdf_ocr action: preferred OCR connector name (e.g. "local-llm", "tesseract"). */
  ocrConnector?: string;
  /** pdf_ocr action: maximum number of PDF pages to process. Defaults to 50. */
  maxPages?: number;
  /** pdf_ocr action: direct PDF URL (optional if paperId or targetUrl provided). */
  pdfUrl?: string;
}

export interface SemanticScholarPdfExtractionResult {
  pdfUrl: string;
  fullText: string;
  totalCharacters: number;
  totalWords: number;
  totalPages: number;
  ocrApplied: boolean;
  ocrConnectorUsed?: string;
  anomalyStatus: string;
  ocrRecommended: boolean;
}

export interface SemanticScholarActorResult {
  action: "paper" | "search" | "author" | "author_search" | "citations" | "references" | "pdf_ocr";
  queryUrl: string;
  totalResults: number;
  offset?: number;
  next?: number;
  paper?: SemanticScholarPaperItem;
  papers?: SemanticScholarPaperItem[];
  author?: SemanticScholarAuthorItem;
  authors?: SemanticScholarAuthorItem[];
  pdfExtraction?: SemanticScholarPdfExtractionResult;
  markdown?: string;
}

// ---------------------------------------------------------------------------
// T.C. Anayasa Mahkemesi (AYM - Constitutional Court of Turkey)
// ---------------------------------------------------------------------------

export type AnayasaMahkemesiAction =
  | "individual_application"
  | "norm_review"
  | "search"
  | "decision";

export type AnayasaMahkemesiCategory = "individual" | "norm" | "party" | "yuce_divan" | "all";

export interface AnayasaMahkemesiDecisionItem {
  id: string;
  category: "individual" | "norm" | "party" | "yuce_divan";
  caseNumber?: string;
  decisionNumber?: string;
  applicationNumber?: string;
  applicationDate?: string;
  decisionDate: string;
  officialGazetteDate?: string;
  officialGazetteNumber?: string;
  title: string;
  applicant?: string;
  violatedRights?: string[];
  outcome: string;
  summary?: string;
  url: string;
}

export interface AnayasaMahkemesiDecisionDetail extends AnayasaMahkemesiDecisionItem {
  examinedNorm?: string;
  facts?: string;
  legalAssessment?: string;
  verdict?: string;
  dissentingOpinions?: Array<{
    judgeName: string;
    type: "karsi_oy" | "farkli_gerekce";
    text: string;
  }>;
  fullTextMarkdown: string;
}

export interface AnayasaMahkemesiActorTaskOptions {
  action?: AnayasaMahkemesiAction;
  query?: string;
  category?: AnayasaMahkemesiCategory;
  applicationNumber?: string;
  caseNumber?: string;
  decisionNumber?: string;
  decisionId?: string;
  right?: string;
  outcome?: string;
  year?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  timeoutMs?: number;
}

export interface AnayasaMahkemesiActorResult {
  action: AnayasaMahkemesiAction;
  queryUrl: string;
  totalResults: number;
  offset?: number;
  decisions: AnayasaMahkemesiDecisionItem[];
  decision?: AnayasaMahkemesiDecisionDetail;
  markdown?: string;
}

// ---------------------------------------------------------------------------
// T.C. Danıştay Başkanlığı (Council of State of Turkey - Administrative Supreme Court)
// ---------------------------------------------------------------------------

export type DanistayAction = "search" | "decision";

export interface DanistayDecisionItem {
  id: string;
  chamber: string;
  caseNumber: string;
  decisionNumber: string;
  decisionDate: string;
  legalArea: string;
  decisionType?: string;
  subject?: string;
  summary?: string;
  url: string;
}

export interface DanistayDecisionDetail extends DanistayDecisionItem {
  lowerCourt?: string;
  appellant?: string;
  appellee?: string;
  reporterOpinion?: string;
  prosecutorOpinion?: string;
  facts?: string;
  legalReasoning?: string;
  verdict?: string;
  dissentingOpinions?: Array<{
    member: string;
    text: string;
  }>;
  fullTextMarkdown: string;
}

export interface DanistayActorTaskOptions {
  action?: DanistayAction;
  query?: string;
  chamber?: string;
  caseNumber?: string;
  decisionNumber?: string;
  decisionId?: string;
  year?: number;
  legalArea?: string;
  decisionType?: string;
  limit?: number;
  offset?: number;
  timeoutMs?: number;
}

export interface DanistayActorResult {
  action: DanistayAction;
  queryUrl: string;
  totalResults: number;
  offset?: number;
  decisions: DanistayDecisionItem[];
  decision?: DanistayDecisionDetail;
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Google Patents (Global Patent Engineering & Claims)
// ---------------------------------------------------------------------------

export type GooglePatentsAction = "patent" | "search" | "claims";

export interface GooglePatentClaimItem {
  number: number;
  claimId: string;
  text: string;
  isIndependent: boolean;
  dependentOn?: number;
}

export interface GooglePatentItem {
  patentId: string;
  title: string;
  abstract?: string;
  url: string;
  publicationDate?: string;
  filingDate?: string;
  priorityDate?: string;
  grantDate?: string;
  inventors?: string[];
  assignees?: string[];
  jurisdiction?: string;
  kindCode?: string;
  cpcClassifications?: string[];
  ipcClassifications?: string[];
  claimsCount?: number;
  claims?: GooglePatentClaimItem[];
  descriptionMarkdown?: string;
  priorArtCitations?: Array<{
    patentId: string;
    title?: string;
    filingDate?: string;
  }>;
}

export interface GooglePatentsActorTaskOptions {
  action?: GooglePatentsAction;
  patentId?: string;
  query?: string;
  inventor?: string;
  assignee?: string;
  country?: string;
  status?: "grant" | "application" | "all";
  before?: string;
  after?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface GooglePatentsActorResult {
  action: GooglePatentsAction;
  queryUrl: string;
  totalResults: number;
  patent?: GooglePatentItem;
  claims?: GooglePatentClaimItem[];
  patents?: GooglePatentItem[];
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Perseus Digital Library (Tufts)
// ---------------------------------------------------------------------------

export type PerseusDlAction = "text" | "morph" | "search";

export interface PerseusMorphAnalysis {
  lemma: string;
  pos: string;
  parsedForm?: string;
  dialect?: string;
  features?: {
    case?: string;
    gender?: string;
    number?: string;
    tense?: string;
    voice?: string;
    mood?: string;
    person?: string;
  };
  shortDefinition?: string;
}

export interface PerseusTextPassage {
  urn?: string;
  docId: string;
  author?: string;
  work?: string;
  edition?: string;
  language: "greek" | "latin" | "hebrew" | "arabic" | "english" | string;
  subReference?: string;
  originalText?: string;
  translationText?: string;
  sections?: Array<{
    id: string;
    label?: string;
    text: string;
  }>;
}

export interface PerseusSearchResultItem {
  docId: string;
  title: string;
  author?: string;
  language?: string;
  snippet?: string;
  url: string;
}

export interface PerseusDlActorTaskOptions {
  action?: PerseusDlAction;
  doc?: string;
  subReference?: string;
  word?: string;
  language?: "greek" | "latin" | "hebrew" | "arabic" | string;
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface PerseusDlActorResult {
  action: PerseusDlAction;
  queryUrl: string;
  totalResults: number;
  passage?: PerseusTextPassage;
  morphAnalysis?: PerseusMorphAnalysis[];
  searchResults?: PerseusSearchResultItem[];
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Internet Sacred Text Archive (ISTA)
// ---------------------------------------------------------------------------

export type SacredTextsAction = "text" | "catalog" | "search";

export interface SacredTextsBookItem {
  title: string;
  author?: string;
  translator?: string;
  year?: string;
  url: string;
  tradition?: string;
  description?: string;
}

export interface SacredTextsFootnote {
  id: string;
  number?: number;
  text: string;
}

export interface SacredTextsPassage {
  title: string;
  bookTitle?: string;
  author?: string;
  translator?: string;
  tradition: string;
  subPath?: string;
  content: string;
  footnotes?: SacredTextsFootnote[];
  nextUrl?: string;
  prevUrl?: string;
}

export interface SacredTextsActorTaskOptions {
  action?: SacredTextsAction;
  tradition?: string;
  path?: string;
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface SacredTextsActorResult {
  action: SacredTextsAction;
  queryUrl: string;
  totalResults: number;
  passage?: SacredTextsPassage;
  books?: SacredTextsBookItem[];
  markdown?: string;
}

// ---------------------------------------------------------------------------
// Instagram (Public Profile, Post/Reel, Recent Media & Hashtag Harvester)
// ---------------------------------------------------------------------------

export type InstagramAction = "profile" | "post" | "recent_posts" | "hashtag";
export type InstagramMediaType = "image" | "video" | "carousel";

export interface InstagramMediaChild {
  id: string;
  mediaType: "image" | "video";
  displayUrl: string;
  videoUrl?: string;
  dimensions?: { width: number; height: number };
}

export interface InstagramCommentRecord {
  id: string;
  username: string;
  text: string;
  createdAtTimestamp?: number;
  likeCount?: number;
  authorProfilePicUrl?: string;
  authorIsVerified?: boolean;
}

export interface InstagramMediaRecord {
  id: string;
  shortcode: string;
  url: string;
  mediaType: InstagramMediaType;
  caption: string;
  likeCount: number;
  commentCount: number;
  takenAtTimestamp: number;
  displayUrl: string;
  videoUrl?: string;
  videoViewCount?: number;
  hashtags: string[];
  mentions: string[];
  dimensions?: { width: number; height: number };
  children?: InstagramMediaChild[];
  comments?: InstagramCommentRecord[];
  location?: {
    id: string;
    name: string;
    slug?: string;
  };
  owner?: {
    id: string;
    username: string;
    fullName?: string;
    isVerified?: boolean;
    profilePicUrl?: string;
  };
}

export interface InstagramProfileRecord {
  id: string;
  username: string;
  fullName: string;
  biography: string;
  externalUrl?: string;
  profilePicUrl?: string;
  isVerified: boolean;
  isPrivate: boolean;
  followerCount: number;
  followingCount: number;
  mediaCount: number;
  recentPostsPreview?: InstagramMediaRecord[];
}

export interface InstagramHashtagRecord {
  name: string;
  mediaCount: number;
  topPosts: InstagramMediaRecord[];
  recentPosts: InstagramMediaRecord[];
}

export interface InstagramActorTaskOptions {
  action?: InstagramAction;
  username?: string;
  shortcode?: string;
  hashtag?: string;
  limit?: number;
  targetUrl?: string;
  useBrowser?: boolean;
  renderJavaScript?: boolean;
  sessionCookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  timeoutMs?: number;
  extractMarkdown?: boolean;
  allowLocalNetwork?: boolean;
  extractComments?: boolean;
  commentsLimit?: number;
  persistToDatabase?: boolean;
  dbPath?: string;
}

export interface InstagramActorResult {
  action: InstagramAction;
  query: string;
  profile?: InstagramProfileRecord;
  posts?: InstagramMediaRecord[];
  hashtag?: InstagramHashtagRecord;
  markdown: string;
  engineUsed: "http" | "browser";
  databaseSaved?: {
    profilesSaved: number;
    postsSaved: number;
    commentsSaved: number;
    dbPath: string;
  };
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

export interface PubmedArticleItem {
  pmid: string;
  pmcid?: string;
  doi?: string;
  title: string;
  abstractText?: string;
  journalTitle?: string;
  pubDate?: string;
  pubYear?: number;
  authors: string[];
  meshHeadings?: string[];
  pubTypes?: string[];
  fullTextUrl?: string;
  markdown?: string;
}

export interface PubmedActorTaskOptions {
  action?: "search" | "summary" | "fetch" | "bioc";
  query?: string;
  pmids?: string[];
  pmcids?: string[];
  maxResults?: number;
  apiKey?: string;
  timeoutMs?: number;
}

export interface PubmedActorResult {
  action: "search" | "summary" | "fetch" | "bioc";
  totalCount: number;
  pmids: string[];
  articles: PubmedArticleItem[];
  queryUrl: string;
}

export interface BiorxivArticleItem {
  doi: string;
  title: string;
  server: "biorxiv" | "medrxiv" | string;
  category: string;
  pubDate?: string;
  pubYear?: number;
  version?: number;
  authors?: string;
  correspondingAuthor?: string;
  institution?: string;
  license?: string;
  publishedDoi?: string;
  abstractText?: string;
  jatsxmlUrl?: string;
  markdown?: string;
}

export interface BiorxivActorTaskOptions {
  server?: "biorxiv" | "medrxiv";
  doi?: string;
  interval?: string;
  category?: string;
  query?: string;
  cursor?: number;
  limit?: number;
  timeoutMs?: number;
}

export interface BiorxivActorResult {
  server: string;
  totalCount: number;
  cursor: number;
  articles: BiorxivArticleItem[];
  queryUrl: string;
  markdown: string;
}

export interface DoajArticleItem {
  id: string;
  doi?: string;
  title: string;
  abstract?: string;
  journal?: string;
  publisher?: string;
  issn?: string;
  language?: string;
  year?: number;
  authors?: string;
  affiliations?: string;
  keywords?: string[];
  subjects?: string[];
  fulltextUrl?: string;
  charCount?: number;
  wordCount?: number;
  markdown?: string;
}

export interface DoajActorTaskOptions {
  action?: "search_articles" | "search_journals" | "get_article";
  query?: string;
  articleId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  timeoutMs?: number;
}

export interface DoajActorResult {
  action: "search_articles" | "search_journals" | "get_article";
  totalCount: number;
  page: number;
  pageSize: number;
  articles: DoajArticleItem[];
  queryUrl: string;
  markdown: string;
}

export interface ApertaFileItem {
  id?: string;
  key?: string;
  size?: number;
  checksum?: string;
  downloadUrl?: string;
}

export interface ApertaRecordItem {
  id: string;
  doi?: string;
  title: string;
  creators?: string;
  description?: string;
  publisher?: string;
  publicationDate?: string;
  resourceType?: string;
  language?: string;
  keywords?: string[];
  subjects?: string[];
  rights?: string;
  files?: ApertaFileItem[];
  fileCount?: number;
  totalFileSize?: number;
  charCount?: number;
  wordCount?: number;
  markdown?: string;
}

export interface ApertaActorTaskOptions {
  action?: "search_records" | "get_record" | "list_files";
  query?: string;
  recordId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  timeoutMs?: number;
}

export interface ApertaActorResult {
  action: "search_records" | "get_record" | "list_files";
  totalCount: number;
  page: number;
  pageSize: number;
  records: ApertaRecordItem[];
  queryUrl: string;
  markdown: string;
}

export interface BinanceVisionFileItem {
  key: string;
  size: number;
  lastModified?: string;
  downloadUrl: string;
  checksumUrl?: string;
}

export interface BinanceVisionKlineItem {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteAssetVolume: number;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: number;
  takerBuyQuoteAssetVolume: number;
  symbol: string;
  market: string;
  interval: string;
}

export interface BinanceVisionActorTaskOptions {
  action?: "list_files" | "list_symbols" | "get_latest_klines" | "get_file_info";
  market?: "spot" | "futures_um" | "futures_cm";
  dataType?: "klines" | "trades" | "aggTrades";
  symbol?: string;
  interval?: string;
  periodType?: "monthly" | "daily";
  year?: string;
  month?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface BinanceVisionActorResult {
  action: "list_files" | "list_symbols" | "get_latest_klines" | "get_file_info";
  market: string;
  dataType: string;
  symbol?: string;
  interval?: string;
  periodType?: string;
  totalCount: number;
  files?: BinanceVisionFileItem[];
  klines?: BinanceVisionKlineItem[];
  symbols?: string[];
  queryUrl: string;
  markdown: string;
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

export interface ClinicalStudySummary {
  nctId: string;
  briefTitle: string;
  officialTitle?: string;
  leadSponsor?: string;
  overallStatus?: string;
  conditions?: string[];
  interventions?: string[];
  briefSummary?: string;
  eligibilityCriteria?: string;
  phases?: string[];
  studyType?: string;
  startDate?: string;
  completionDate?: string;
  studyUrl: string;
}

export interface ClinicalTrialsActorTaskOptions {
  query?: string;
  condition?: string;
  intervention?: string;
  status?: string | string[];
  nctId?: string;
  pageSize?: number;
  pageToken?: string;
  format?: "markdown" | "json";
  timeoutMs?: number;
}

export interface ClinicalTrialsActorResult {
  totalCount: number;
  nextPageToken?: string;
  studies: ClinicalStudySummary[];
  queryUrl: string;
  markdown?: string;
}

export interface OpenFdaActorTaskOptions {
  endpoint?: "drug/label" | "drug/event" | "device/510k" | "food/enforcement";
  search?: string;
  limit?: number;
  skip?: number;
  format?: "markdown" | "json";
  timeoutMs?: number;
}

export interface OpenFdaActorResult {
  total: number;
  endpoint: string;
  results: Record<string, unknown>[];
  queryUrl: string;
  markdown?: string;
}

export interface SecFilingItem {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  acceptanceDateTime?: string;
  act?: string;
  form: string;
  fileNumber?: string;
  filmNumber?: string;
  items?: string[];
  size?: number;
  isXBRL?: boolean;
  isInlineXBRL?: boolean;
  primaryDocument: string;
  primaryDocDescription?: string;
  documentUrl: string;
}

export interface SecEdgarActorTaskOptions {
  cik?: string | number;
  ticker?: string;
  form?: string;
  formType?: string;
  limit?: number;
  format?: "markdown" | "json";
  timeoutMs?: number;
}

export interface SecEdgarActorResult {
  cik: string;
  entityName: string;
  sic?: string;
  sicDescription?: string;
  tickers?: string[];
  exchanges?: string[];
  totalFilings: number;
  filings: SecFilingItem[];
  queryUrl: string;
  markdown?: string;
}

export interface CourtListenerDocumentItem {
  id: number;
  caseName: string;
  citation?: string[];
  court: string;
  courtExact?: string;
  dateFiled?: string;
  judge?: string;
  status?: string;
  snippet?: string;
  downloadUrl?: string;
  absoluteUrl: string;
}

export interface CourtListenerActorTaskOptions {
  query?: string;
  court?: string;
  judge?: string;
  type?: "o" | "r" | "d";
  statPrecedential?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
  opinionId?: number | string;
  format?: "markdown" | "json";
  timeoutMs?: number;
}

export interface CourtListenerActorResult {
  totalCount: number;
  page: number;
  results: CourtListenerDocumentItem[];
  queryUrl: string;
  markdown?: string;
}

export interface SoftwareHeritageDirectoryEntry {
  name: string;
  type: "file" | "dir" | "rev";
  target: string;
  perms?: number;
  length?: number;
}

export interface SoftwareHeritageActorTaskOptions {
  swhid?: string;
  originUrl?: string;
  action?: "content" | "directory" | "origin" | "revision";
  rawTextMaxChars?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface SoftwareHeritageActorResult {
  swhid?: string;
  action: string;
  url: string;
  data?: unknown;
  markdown: string;
}

export interface EurLexDocumentItem {
  celex: string;
  title: string;
  documentType?: string;
  date?: string;
  language: string;
  ojReference?: string;
  url: string;
  contentSnippet?: string;
}

export interface EurLexActorTaskOptions {
  celex?: string;
  query?: string;
  language?: string;
  format?: "markdown" | "html" | "json";
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface EurLexActorResult {
  celex?: string;
  query?: string;
  language: string;
  totalCount: number;
  documents: EurLexDocumentItem[];
  markdown: string;
}

export interface OpenStaxBookItem {
  id: number | string;
  title: string;
  slug: string;
  description?: string;
  publishDate?: string;
  licenseName?: string;
  pdfUrl?: string;
  coverUrl?: string;
  htmlUrl?: string;
  cnxId?: string;
}

export interface OpenStaxActorTaskOptions {
  query?: string;
  bookId?: number | string;
  slug?: string;
  action?: "catalog" | "search" | "detail" | "chapter";
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface OpenStaxActorResult {
  query?: string;
  action: "catalog" | "search" | "detail" | "chapter";
  totalCount: number;
  books: OpenStaxBookItem[];
  bookDetail?: Record<string, unknown>;
  markdown: string;
  queryUrl: string;
}

export interface MitOcwCourseItem {
  id: string;
  courseNumber?: string;
  title: string;
  description?: string;
  level?: string[];
  topics?: string[];
  instructors?: string[];
  department?: string;
  year?: number | string;
  semester?: string;
  url: string;
  platform?: string;
}

export interface MitOcwActorTaskOptions {
  query?: string;
  courseSlug?: string;
  action?: "search" | "course";
  limit?: number;
  offset?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface MitOcwActorResult {
  query?: string;
  courseSlug?: string;
  action: "search" | "course";
  totalCount: number;
  courses: MitOcwCourseItem[];
  courseDetail?: Record<string, unknown>;
  markdown: string;
  queryUrl: string;
}

export interface ResmiGazeteItem {
  id: string;
  title: string;
  category: string;
  actNumber?: string;
  url: string;
  pdfUrl?: string;
  content?: string;
  summary?: string;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface ResmiGazeteActorTaskOptions {
  date?: string;
  issueNumber?: number;
  category?:
    | "all"
    | "kanun"
    | "cumhurbaskanligi"
    | "yonetmelik"
    | "teblig"
    | "kurul-karari"
    | "ilanlar";
  query?: string;
  downloadPdf?: boolean;
  format?: "markdown" | "json";
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface ResmiGazeteActorResult {
  date: string;
  issueNumber?: number;
  isRepeated?: boolean;
  totalItems: number;
  items: ResmiGazeteItem[];
  queryUrl: string;
  markdown?: string;
}

export interface YargitayDecisionItem {
  id: string;
  court: "Yargıtay" | "Danıştay" | string;
  chamber: string;
  caseNumber: string;
  decisionNumber: string;
  decisionDate: string;
  legalArea?: string;
  subject?: string;
  summary?: string;
  fullText?: string;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface YargitayActorTaskOptions {
  query?: string;
  court?: "yargitay" | "danistay" | "all";
  chamber?: string;
  caseNumber?: string;
  decisionNumber?: string;
  year?: number;
  legalArea?: "hukuk" | "ceza" | "idari" | "vergi" | "all";
  format?: "markdown" | "json";
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface YargitayActorResult {
  totalCount: number;
  court: string;
  decisions: YargitayDecisionItem[];
  queryUrl: string;
  markdown?: string;
}

export interface KapDisclosureItem {
  id: string;
  companyTicker: string;
  companyName: string;
  publishDate: string;
  disclosureType: string;
  subject?: string;
  summary?: string;
  content?: string;
  url: string;
  attachmentUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface KapActorTaskOptions {
  query?: string;
  companyTicker?: string;
  disclosureType?: "all" | "oda" | "fr" | "dg" | "gk" | string;
  fromDate?: string;
  toDate?: string;
  format?: "markdown" | "json";
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface KapActorResult {
  totalCount: number;
  companyTicker?: string;
  disclosures: KapDisclosureItem[];
  queryUrl: string;
  markdown?: string;
}

export interface GithubActorTaskOptions {
  owner?: string;
  repo?: string;
  action?: "repo" | "readme" | "issues" | "pulls" | "releases" | "tree";
  state?: "open" | "closed" | "all";
  token?: string;
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface GithubActorResult {
  owner: string;
  repo: string;
  action: string;
  data: Record<string, unknown> | Array<Record<string, unknown>>;
  queryUrl: string;
  markdown?: string;
}

export interface OpenReviewNoteItem {
  id: string;
  forum?: string;
  replyto?: string;
  invitation?: string;
  title?: string;
  authors?: string[];
  abstract?: string;
  venue?: string;
  year?: number;
  pdfUrl?: string;
  rating?: string;
  confidence?: string;
  decision?: string;
  comment?: string;
  content?: Record<string, unknown>;
  createdAt?: string | number;
}

export interface OpenReviewActorTaskOptions {
  action?: "submissions" | "forum" | "note";
  venue?: string;
  forumId?: string;
  noteId?: string;
  query?: string;
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface OpenReviewActorResult {
  action: string;
  venue?: string;
  forumId?: string;
  totalCount: number;
  notes: OpenReviewNoteItem[];
  queryUrl: string;
  markdown?: string;
}

export interface HackerNewsCommentItem {
  id: number;
  author?: string;
  text?: string;
  time?: number;
  parentId?: number;
  children?: HackerNewsCommentItem[];
}

export interface HackerNewsStoryItem {
  id: number;
  title: string;
  url?: string;
  author?: string;
  points?: number;
  commentsCount?: number;
  time?: number;
  text?: string;
  comments?: HackerNewsCommentItem[];
}

export interface HackerNewsActorTaskOptions {
  action?: "top" | "best" | "new" | "ask" | "show" | "story" | "search";
  storyId?: number;
  query?: string;
  limit?: number;
  maxComments?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface HackerNewsActorResult {
  action: string;
  totalStories: number;
  stories: HackerNewsStoryItem[];
  queryUrl: string;
  markdown?: string;
}

export interface HuggingFaceDatasetsFeatureItem {
  featureIdx: number;
  name: string;
  type: string;
}

export interface HuggingFaceDatasetsSplitItem {
  dataset: string;
  config: string;
  split: string;
  numRows?: number;
}

export interface HuggingFaceDatasetsActorTaskOptions {
  action?: "rows" | "splits" | "info" | "size";
  dataset: string;
  config?: string;
  split?: string;
  offset?: number;
  limit?: number;
  hfToken?: string;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface HuggingFaceDatasetsActorResult {
  dataset: string;
  action: string;
  config?: string;
  split?: string;
  totalRows?: number;
  offset?: number;
  limit?: number;
  features?: HuggingFaceDatasetsFeatureItem[];
  splits?: HuggingFaceDatasetsSplitItem[];
  rows?: Array<Record<string, unknown>>;
  info?: {
    description?: string;
    homepage?: string;
    license?: string;
    citation?: string;
  };
  queryUrl: string;
  markdown?: string;
}

export interface MathReasoningItem {
  id?: string | number;
  benchmark: string;
  subject?: string;
  level?: string | number;
  problem: string;
  reasoning: string;
  answer: string;
  boxedAnswer?: string;
  rawSolution?: string;
}

export interface MathReasoningActorTaskOptions {
  benchmark?: "gsm8k" | "math" | "svamp" | "olympiadbench" | string;
  subject?: string;
  split?: "train" | "test" | string;
  offset?: number;
  limit?: number;
  targetUrl?: string;
  hfToken?: string;
  timeoutMs?: number;
}

export interface MathReasoningActorResult {
  benchmark: string;
  totalProblems: number;
  problems: MathReasoningItem[];
  queryUrl: string;
  markdown?: string;
}

export interface CodeEvalItem {
  taskId: string;
  entryPoint?: string;
  prompt: string;
  canonicalSolution?: string;
  test?: string;
  language?: string;
  difficulty?: string;
  raw?: Record<string, unknown>;
}

export interface CodeEvalActorTaskOptions {
  benchmark?: "humaneval" | "mbpp" | "swe-bench" | string;
  split?: string;
  offset?: number;
  limit?: number;
  targetUrl?: string;
  hfToken?: string;
  timeoutMs?: number;
}

export interface CodeEvalActorResult {
  benchmark: string;
  split: string;
  totalTasks: number;
  offset: number;
  limit: number;
  tasks: CodeEvalItem[];
  queryUrl: string;
  markdown?: string;
}

export interface ProofWikiItem {
  pageId?: number;
  title: string;
  url: string;
  theorem?: string;
  proofs?: string[];
  definitions?: string[];
  sources?: string[];
  categories?: string[];
  rawWikitext?: string;
}

export interface ProofWikiActorTaskOptions {
  action?: "theorem" | "search" | "random" | "category" | string;
  title?: string;
  query?: string;
  category?: string;
  limit?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface ProofWikiActorResult {
  action: string;
  totalResults: number;
  items: ProofWikiItem[];
  queryUrl: string;
  markdown?: string;
}

export interface LeanMathlibItem {
  name: string;
  kind: "theorem" | "lemma" | "def" | "axiom" | "instance" | string;
  docstring?: string;
  signature: string;
  proof?: string;
  tactics?: string[];
  code: string;
  file?: string;
  repo: string;
  url: string;
}

export interface LeanMathlibActorTaskOptions {
  action?: "file" | "theorem" | "search" | "random" | string;
  repo?: string;
  path?: string;
  theorem?: string;
  query?: string;
  limit?: number;
  githubToken?: string;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface LeanMathlibActorResult {
  action: string;
  repo: string;
  totalDeclarations: number;
  items: LeanMathlibItem[];
  queryUrl: string;
  markdown?: string;
}

export interface LessWrongComment {
  id: string;
  postId?: string;
  parentCommentId?: string;
  author: string;
  postedAt: string;
  score: number;
  contentMarkdown: string;
}

export interface LessWrongPost {
  id: string;
  title: string;
  slug: string;
  url: string;
  author: string;
  postedAt: string;
  score: number;
  voteCount?: number;
  commentCount?: number;
  contentMarkdown?: string;
  comments?: LessWrongComment[];
}

export interface LessWrongActorTaskOptions {
  action?: "posts" | "post" | "comments" | "sequence" | "search" | string;
  platform?: "lesswrong" | "alignmentforum" | string;
  postId?: string;
  slug?: string;
  sequenceId?: string;
  query?: string;
  limit?: number;
  view?: "curated" | "top" | "new" | string;
  includeComments?: boolean;
  maxComments?: number;
  targetUrl?: string;
  timeoutMs?: number;
}

export interface LessWrongActorResult {
  action: string;
  platform: string;
  totalResults: number;
  posts: LessWrongPost[];
  comments?: LessWrongComment[];
  queryUrl: string;
  markdown?: string;
}

// ---------------------------------------------------------------------------
// YouTube Transcripts
// ---------------------------------------------------------------------------

export type YoutubeTranscriptOutputFormat =
  | "captions"
  | "textWithTimestamps"
  | "xmlWithoutTimestamps"
  | "xmlWithTimestamps"
  | "singleStringText";

export interface YoutubeTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface YoutubeTranscriptRecord {
  videoId: string;
  title: string;
  captions: string[] | YoutubeTranscriptSegment[] | string | null;
  channelName?: string | null;
  channelID?: string | null;
  datePublished?: string | null;
  dateText?: string | null;
  relativeDateText?: string | null;
  viewCount?: string | null;
  likes?: string | null;
  comments?: string | null;
  keywords?: string | null;
  thumbnailUrl?: string | null;
  description?: string | null;
  status?: "completed" | "failed";
  reason?: string | null;
  processedBy?: "http-innertube" | "playwright-browser";
  transcriptFound: boolean;
}

export interface YoutubeTranscriptsActorTaskOptions {
  urls?: string[];
  videoId?: string;
  outputFormat?: YoutubeTranscriptOutputFormat;
  languageCode?: string;
  cleanText?: boolean;
  maxRetries?: number;
  preferBrowser?: boolean;
  poToken?: string;
  channelNameBoolean?: boolean;
  channelIDBoolean?: boolean;
  dateTextBoolean?: boolean;
  relativeDateTextBoolean?: boolean;
  datePublishedBoolean?: boolean;
  viewCountBoolean?: boolean;
  likesBoolean?: boolean;
  commentsBoolean?: boolean;
  keywordsBoolean?: boolean;
  thumbnailBoolean?: boolean;
  descriptionBoolean?: boolean;
  targetUrl?: string;
  timeoutMs?: number;
  proxy?: ProxyConfig;
}

export interface YoutubeTranscriptsActorResult {
  totalProcessed: number;
  successfulCount: number;
  failedCount: number;
  records: YoutubeTranscriptRecord[];
  queryUrl: string;
  markdown: string;
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
    wikipediaOptions?: WikipediaActorTaskOptions;
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
    dergiParkOptions?: DergiParkActorTaskOptions;
    internetArchiveOptions?: InternetArchiveActorTaskOptions;
    clinicalTrialsOptions?: ClinicalTrialsActorTaskOptions;
    openFdaOptions?: OpenFdaActorTaskOptions;
    secEdgarOptions?: SecEdgarActorTaskOptions;
    courtListenerOptions?: CourtListenerActorTaskOptions;
    softwareHeritageOptions?: SoftwareHeritageActorTaskOptions;
    eurLexOptions?: EurLexActorTaskOptions;
    openstaxOptions?: OpenStaxActorTaskOptions;
    mitOcwOptions?: MitOcwActorTaskOptions;
    resmiGazeteOptions?: ResmiGazeteActorTaskOptions;
    yargitayOptions?: YargitayActorTaskOptions;
    kapOptions?: KapActorTaskOptions;
    githubOptions?: GithubActorTaskOptions;
    openreviewOptions?: OpenReviewActorTaskOptions;
    hackerNewsOptions?: HackerNewsActorTaskOptions;
    huggingfaceDatasetsOptions?: HuggingFaceDatasetsActorTaskOptions;
    mathReasoningOptions?: MathReasoningActorTaskOptions;
    codeEvalOptions?: CodeEvalActorTaskOptions;
    proofWikiOptions?: ProofWikiActorTaskOptions;
    leanMathlibOptions?: LeanMathlibActorTaskOptions;
    lessWrongOptions?: LessWrongActorTaskOptions;
    youtubeTranscriptsOptions?: YoutubeTranscriptsActorTaskOptions;
    wikisourceOptions?: WikisourceActorTaskOptions;
    wiktionaryOptions?: WiktionaryActorTaskOptions;
    wikiquoteOptions?: WikiquoteActorTaskOptions;
    wikibooksOptions?: WikibooksActorTaskOptions;
    wikiversityOptions?: WikiversityActorTaskOptions;
    wikivoyageOptions?: WikivoyageActorTaskOptions;
    wikinewsOptions?: WikinewsActorTaskOptions;
    wikispeciesOptions?: WikispeciesActorTaskOptions;
    wikidataOptions?: WikidataActorTaskOptions;
    stanfordPhilOptions?: StanfordPhilActorTaskOptions;
    internetPhilOptions?: InternetPhilActorTaskOptions;
    metamathOptions?: MetamathActorTaskOptions;
    philpapersOptions?: PhilPapersActorTaskOptions;
    devdocsOptions?: DevDocsActorTaskOptions;
    rosettaCodeOptions?: RosettaCodeActorTaskOptions;
    papersWithCodeOptions?: PapersWithCodeActorTaskOptions;
    libretextsOptions?: LibreTextsActorTaskOptions;
    openTextbookOptions?: OpenTextbookActorTaskOptions;
    semanticScholarOptions?: SemanticScholarActorTaskOptions;
    anayasaMahkemesiOptions?: AnayasaMahkemesiActorTaskOptions;
    danistayOptions?: DanistayActorTaskOptions;
    googlePatentsOptions?: GooglePatentsActorTaskOptions;
    perseusDlOptions?: PerseusDlActorTaskOptions;
    sacredTextsOptions?: SacredTextsActorTaskOptions;
    instagramOptions?: InstagramActorTaskOptions;
    pubmedOptions?: PubmedActorTaskOptions;
    biorxivOptions?: BiorxivActorTaskOptions;
    doajOptions?: DoajActorTaskOptions;
    apertaOptions?: ApertaActorTaskOptions;
    binanceVisionOptions?: BinanceVisionActorTaskOptions;
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
  task?: ActorTask;
  taskId?: EntityId;
  startTime?: number;
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
