/**
 * src/core/openapi-spec.ts
 *
 * OpenAPI 3.1.0 Specification and Interactive API Documentation Generator for Protokol-7.
 * Provides machine-readable API contracts for AI agents (LangChain, AutoGen, GPTs)
 * and interactive documentation for developers.
 */

export const OPENAPI_SPECIFICATION: Record<string, unknown> = {
  openapi: "3.1.0",
  info: {
    title: "Protokol-7 Microservice API",
    version: "1.0.0",
    description:
      "Headless Web Scraping, Deep Crawling, Document Distillation & Anti-Detection Browser Automation Microservice.",
    contact: {
      name: "Protokol-7 Architecture Team",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server",
    },
  ],
  tags: [
    { name: "Scraping", description: "HTML and headless browser web scraping actors" },
    { name: "Documents", description: "PDF distillation and LLM Markdown reader actors" },
    {
      name: "Academic & Search",
      description: "arXiv Export API and organic SERP search engine extractors",
    },
    {
      name: "Clean Datasets",
      description:
        "Primary source clean data extraction actors for LLM pre-training, fine-tuning, and RAG",
    },
    { name: "Crawling", description: "Breadth-first search web graph and XML sitemap harvesters" },
    {
      name: "Browser Control",
      description: "Interactive multi-turn Playwright session controllers",
    },
    {
      name: "Store & Runtime",
      description: "Dynamic actor store, execution registry, and quarantine inspectors",
    },
    { name: "Integrations", description: "Pipedream Connect OAuth and MCP endpoint bridges" },
    {
      name: "Pipelines",
      description: "Declarative YAML extraction, quality filtering, and sharding pipelines",
    },
    {
      name: "Datasets",
      description:
        "Training dataset catalog, snapshots, split partitioning, and verified manifest publisher",
    },
    {
      name: "Jobs",
      description: "Scheduled recurring pipeline executions, cron engine, and job state management",
    },
    {
      name: "Cold Vault",
      description:
        "Offline storage packaging, removable HDD/SSD volume management, and Btrfs SHA256SUMS ledger verification",
    },
    { name: "System", description: "Health checks, agent manifests, and OpenAPI metadata" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "System Health Status",
        description: "Returns health status, active session counts, and memory telemetry.",
        responses: {
          "200": {
            description: "Service is healthy and operating within nominal parameters.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    activeSessions: { type: "integer", example: 0 },
                    uptime: { type: "number", example: 124.5 },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/.well-known/mcp.json": {
      get: {
        tags: ["System"],
        summary: "Model Context Protocol Tool Registry",
        description:
          "Returns AI agent MCP tool registry declaring all available extraction actors.",
        responses: {
          "200": {
            description: "Model Context Protocol tool schema registry.",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        tags: ["System"],
        summary: "OpenAPI 3.1.0 Specification",
        description:
          "Returns the complete machine-readable OpenAPI schema for tool-binding and automated client generation.",
        responses: {
          "200": {
            description: "OpenAPI 3.1.0 document.",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/docs": {
      get: {
        tags: ["System"],
        summary: "Interactive API Documentation",
        description: "Renders the interactive visual API console and reference documentation.",
        responses: {
          "200": {
            description: "Interactive HTML documentation console.",
            content: { "text/html": {} },
          },
        },
      },
    },
    "/api/v1/scrape": {
      post: {
        tags: ["Scraping"],
        summary: "Static HTML Scraping (Cheerio)",
        description:
          "Extracts DOM hierarchy, text, links, GFM markdown, and tables using Cheerio without rendering JavaScript.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUrl"],
                properties: {
                  targetUrl: { type: "string", description: "Target webpage URL (HTTP/HTTPS)." },
                  selectors: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    description: "Key-value mapping of CSS selectors.",
                  },
                  extractTables: { type: "boolean", default: true },
                  extractJsonLd: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Scraped page result with markdown and extracted selectors." },
          "400": { description: "Missing required targetUrl parameter or invalid payload." },
          "500": { description: "Scraping failure or SSRF violation." },
        },
      },
    },
    "/api/v1/crawl": {
      post: {
        tags: ["Crawling"],
        summary: "BFS Web Crawler",
        description:
          "Crawls a website graph starting from targetUrl using breadth-first search with depth and page constraints.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUrl"],
                properties: {
                  targetUrl: { type: "string", description: "Root crawling URL." },
                  options: {
                    type: "object",
                    properties: {
                      maxPages: { type: "integer", default: 10 },
                      maxDepth: { type: "integer", default: 2 },
                      sameDomainOnly: { type: "boolean", default: true },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Crawler traversal results." },
          "400": { description: "Invalid crawler parameters." },
        },
      },
    },
    "/api/v1/search": {
      post: {
        tags: ["Academic & Search"],
        summary: "SERP Organic Search Engine Results",
        description:
          "Extracts search engine result pages resolving redirects, ranks, titles, snippets, and domains.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query string." },
                  targetUrl: { type: "string", description: "Direct search engine URL." },
                  options: {
                    type: "object",
                    properties: {
                      maxResults: { type: "integer", default: 30 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "List of organic search result items." },
        },
      },
    },
    "/api/v1/pdf": {
      post: {
        tags: ["Documents"],
        summary: "PDF Document Text & Metadata Extractor",
        description:
          "Extracts text streams, page boundaries, character metrics, and document metadata from binary PDF files via unpdf.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct URL to PDF file." },
                  pdfBase64: { type: "string", description: "Base64 encoded PDF binary data." },
                  options: {
                    type: "object",
                    properties: {
                      maxPages: { type: "integer", default: 50 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Extracted PDF pages, full text, and document metadata." },
        },
      },
    },
    "/api/v1/documents": {
      post: {
        tags: ["Documents"],
        summary: "Office & Tabular Document Extractor",
        description:
          "Extracts text, structured records, and GFM markdown tables from DOCX, XLSX, CSV, TSV, TXT, JSON, and YAML files.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct URL to document file." },
                  documentBase64: { type: "string", description: "Base64 encoded binary data." },
                  format: {
                    type: "string",
                    enum: ["docx", "xlsx", "csv", "tsv", "txt", "json", "yaml"],
                    description: "Explicit document format override.",
                  },
                  maxRows: { type: "integer", default: 1000 },
                  delimiter: { type: "string", description: "CSV delimiter override." },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Extracted document text, records, and GFM tables." },
          "400": { description: "Missing targetUrl or documentBase64 payload." },
        },
      },
    },
    "/api/v1/archives": {
      post: {
        tags: ["Documents"],
        summary: "Safe Compressed Archive Extractor",
        description:
          "Safely extracts compressed archives (ZIP, TAR, GZ, TGZ, RAR) with Zip Slip path traversal and Zip Bomb volumetric guards.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct URL to archive file." },
                  archiveBase64: { type: "string", description: "Base64 encoded archive binary." },
                  format: {
                    type: "string",
                    enum: ["zip", "tar", "tar.gz", "gz", "rar"],
                  },
                  pattern: {
                    type: "string",
                    description: "Glob pattern to filter extracted files.",
                  },
                  previewMaxChars: { type: "integer", default: 250 },
                  extractTextPreviews: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Archive entries, SHA-256 digests, and previews." },
          "400": { description: "Missing targetUrl or archiveBase64 payload." },
          "403": { description: "Zip Slip path traversal attack detected." },
          "413": { description: "Zip Bomb limit exceeded." },
        },
      },
    },
    "/api/v1/ocr": {
      post: {
        tags: ["Documents"],
        summary: "Optical Character Recognition (OCR)",
        description:
          "Performs optical character recognition using local vision LLMs (llama3.2-vision, qwen2.5-vl) or cloud/CLI connectors.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["imageBase64"],
                properties: {
                  imageBase64: { type: "string", description: "Base64 encoded image data." },
                  mimeType: { type: "string", default: "image/png" },
                  connector: {
                    type: "string",
                    enum: ["local-llm", "cloud-vision", "mistral", "tesseract", "generic-http"],
                    description: "Preferred OCR connector.",
                  },
                  language: { type: "string", default: "eng" },
                  prompt: {
                    type: "string",
                    description: "Custom extraction prompt for vision models.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Transcribed text and page breakdown." },
          "400": { description: "Missing imageBase64 payload." },
          "422": { description: "OCR execution failed across all connectors." },
        },
      },
    },
    "/api/v1/arxiv": {
      post: {
        tags: ["Academic & Search"],
        summary: "arXiv Research Paper & Metadata Extractor",
        description:
          "Queries arXiv Export API (Atom 1.0) for scientific preprints, abstracts, and optional PDF text streams.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  searchQuery: {
                    type: "string",
                    description:
                      "arXiv search query expression (e.g. 'cat:cs.AI AND ti:diffusion').",
                  },
                  idList: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of arXiv IDs.",
                  },
                  maxResults: { type: "integer", default: 10 },
                  downloadPdf: {
                    type: "boolean",
                    default: false,
                    description: "Download and extract PDF full text.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Normalized arXiv research papers." },
        },
      },
    },
    "/api/v1/wikimedia": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Wikimedia Encyclopedic Knowledge Extractor",
        description:
          "Queries official Wikimedia REST API v1 for clean encyclopedic summaries, articles as markdown, and search.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Article title." },
                  lang: { type: "string", default: "en" },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                  },
                  query: { type: "string" },
                  limit: { type: "integer", default: 10 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Clean encyclopedic summaries or markdown." } },
      },
    },
    "/api/v1/wikipedia": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Wikipedia Structured Knowledge Extractor",
        description:
          "Extracts high-fidelity Wikipedia encyclopedic articles, structured sections, infoboxes, and plain text across language editions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Article title." },
                  lang: { type: "string", default: "en" },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "article",
                  },
                  query: { type: "string" },
                  limit: { type: "integer", default: 10 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Structured Wikipedia content or search results." } },
      },
    },
    "/api/v1/openalex": {
      post: {
        tags: ["Clean Datasets"],
        summary: "OpenAlex Scholarly Literature Extractor",
        description:
          "Queries OpenAlex API for scholarly works, reconstructs abstracts from inverted index, and extracts citations.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  searchQuery: { type: "string" },
                  workId: { type: "string" },
                  openAccessOnly: { type: "boolean", default: false },
                  minCitations: { type: "integer" },
                  perPage: { type: "integer", default: 10 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Normalized scholarly literature works." } },
      },
    },
    "/api/v1/stack-exchange": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Stack Exchange Verified Q&A Extractor",
        description:
          "Queries Stack Exchange API v2.3 for verified algorithmic Q&A pairs and instruction-tuning pairs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  site: { type: "string", default: "stackoverflow" },
                  query: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  minScore: { type: "integer" },
                  acceptedOnly: { type: "boolean", default: true },
                  pageSize: { type: "integer", default: 10 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Verified Q&A pairs formatted for instruction tuning." },
        },
      },
    },
    "/api/v1/gutenberg": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Project Gutenberg Public Domain Literature Extractor",
        description:
          "Queries Gutendex API for public domain books, extracts metadata, and downloads unadulterated book text without license headers.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  searchQuery: { type: "string" },
                  topic: { type: "string" },
                  languages: { type: "array", items: { type: "string" } },
                  bookId: { type: "integer" },
                  downloadText: { type: "boolean", default: false },
                  maxBytes: { type: "integer", default: 10485760 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Public domain books metadata and clean text." } },
      },
    },
    "/api/v1/europe-pmc": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Europe PMC Biomedical Literature Extractor",
        description:
          "Queries Europe PMC and PubMed Central REST API for peer-reviewed biomedical literature, abstracts, and open-access full-text links.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  openAccessOnly: { type: "boolean", default: false },
                  pageSize: { type: "integer", default: 10 },
                  cursorMark: { type: "string" },
                  synonym: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Biomedical literature articles and abstracts." } },
      },
    },
    "/api/v1/ietf-rfc": {
      post: {
        tags: ["Clean Datasets"],
        summary: "IETF RFC Internet Standards Extractor",
        description:
          "Queries IETF RFC Editor and Datatracker for official Internet standards, extracts metadata, and cleans plain text RFC streams.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  rfcNumber: { type: "integer" },
                  query: { type: "string" },
                  limit: { type: "integer", default: 20 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Normative Internet standards and clean RFC text." } },
      },
    },
    "/api/v1/saglik-ekutuphane": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Turkish Ministry of Health E-Library Extractor",
        description:
          "Scrapes ekutuphane.saglik.gov.tr for medical books, journals, guidelines, and articles with PDF distillation.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["list", "detail", "extract"], default: "list" },
                  category: {
                    type: "string",
                    enum: ["all", "books", "journals", "articles"],
                    default: "all",
                  },
                  publicationId: { type: "integer" },
                  page: { type: "integer", default: 1 },
                  limit: { type: "integer", default: 20 },
                  downloadPdf: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Health publications metadata and distilled text." },
        },
      },
    },
    "/api/v1/ktb-ekitap": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Turkish Ministry of Culture E-Book Portal Extractor",
        description:
          "Scrapes ekitap.ktb.gov.tr for literary and cultural e-books with anti-hotlink referral and LLM text sanitization.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["list", "detail", "extract"], default: "list" },
                  category: {
                    type: "string",
                    enum: [
                      "all",
                      "edebiyat",
                      "halk-bilimi",
                      "halk-kutuphaneleri",
                      "kultur",
                      "kulturel-miras",
                      "kutuphanecilik",
                      "sanat",
                      "tanitim",
                      "tarih",
                      "son-eklenen",
                    ],
                    default: "son-eklenen",
                  },
                  bookId: { type: "integer" },
                  detailUrl: { type: "string" },
                  page: { type: "integer", default: 1 },
                  limit: { type: "integer", default: 20 },
                  downloadPdf: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Cultural e-books metadata and sanitized text." },
        },
      },
    },
    "/api/v1/epub": {
      post: {
        tags: ["Documents"],
        summary: "EPUB E-Book & Publication Extractor",
        description:
          "Extracts e-books and periodicals from EPUB 2/3 containers with Dublin Core metadata, hierarchical TOC, and spine-ordered GFM Markdown.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Remote EPUB URL" },
                  epubBase64: { type: "string", description: "Base64-encoded EPUB binary" },
                  includeTableOfContents: { type: "boolean", default: true },
                  maxChapters: { type: "integer", default: 100 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "EPUB metadata, TOC, and chapters converted to GFM markdown." },
        },
      },
    },
    "/api/v1/dergipark": {
      post: {
        tags: ["Clean Datasets"],
        summary: "DergiPark Academic Journal Harvester",
        description:
          "Harvests article metadata and PDF links from DergiPark academic journals via OAI-PMH 2.0 Dublin Core.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["search", "record", "list-sets"],
                    default: "search",
                  },
                  identifier: { type: "string", description: "OAI-PMH record identifier" },
                  set: { type: "string", description: "OAI-PMH journal set specifier" },
                  keyword: { type: "string", description: "Client-side keyword filter" },
                  maxRecords: { type: "integer", default: 20 },
                  resumptionToken: { type: "string", description: "Pagination cursor" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "DergiPark articles, sets, or single record metadata." },
        },
      },
    },
    "/api/v1/internet-archive": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Internet Archive Item Fetcher",
        description:
          "Fetches item metadata, search results, and OCR text streams from archive.org public collections.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Archive.org item URL" },
                  action: {
                    type: "string",
                    enum: ["metadata", "search", "text"],
                    default: "metadata",
                  },
                  identifier: { type: "string", description: "Archive item identifier" },
                  searchQuery: { type: "string", description: "Full-text search query" },
                  mediaType: { type: "string", default: "texts" },
                  maxResults: { type: "integer", default: 20 },
                  maxTextChars: { type: "integer", default: 100000 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Internet Archive item metadata, search docs, or OCR text stream.",
          },
        },
      },
    },
    "/api/v1/clinical-trials": {
      post: {
        tags: ["Clean Datasets"],
        summary: "ClinicalTrials.gov Protocol Harvester",
        description:
          "Queries ClinicalTrials.gov API v2 for trial protocols, eligibility criteria, interventions, and outcomes.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct API URL or study page URL" },
                  query: { type: "string", description: "General keyword search term" },
                  condition: { type: "string", description: "Medical condition/disease filter" },
                  intervention: {
                    type: "string",
                    description: "Treatment or drug intervention filter",
                  },
                  status: { type: "string", description: "Recruitment status filter" },
                  nctId: {
                    type: "string",
                    description: "Direct NCT identifier (e.g. NCT04567890)",
                  },
                  pageSize: { type: "integer", default: 10 },
                  pageToken: { type: "string", description: "Pagination cursor token" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Clinical trial protocol records, eligibility criteria, and markdown.",
          },
        },
      },
    },
    "/api/v1/open-fda": {
      post: {
        tags: ["Clean Datasets"],
        summary: "openFDA Public Datasets Harvester",
        description:
          "Queries official openFDA API for drug labels, indications, warnings, adverse events, and device clearances.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct API URL" },
                  endpoint: {
                    type: "string",
                    enum: ["drug/label", "drug/event", "device/510k", "food/enforcement"],
                    default: "drug/label",
                  },
                  search: { type: "string", description: "Search query or drug/device name" },
                  limit: { type: "integer", default: 10 },
                  skip: { type: "integer", default: 0 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "FDA records, regulatory metadata, and structured markdown." },
        },
      },
    },
    "/api/v1/sec-edgar": {
      post: {
        tags: ["Clean Datasets"],
        summary: "SEC EDGAR Financial Filings Harvester",
        description:
          "Queries SEC EDGAR Submissions API for corporate CIK, company filings (10-K, 10-Q, 8-K), and accession documents.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct API URL" },
                  ticker: { type: "string", description: "Stock ticker symbol (e.g. AAPL, NVDA)" },
                  cik: { type: "string", description: "SEC Central Index Key" },
                  formType: {
                    type: "string",
                    description: "Filing form type filter (e.g. 10-K, 10-Q)",
                  },
                  limit: { type: "integer", default: 10 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Corporate filings, accession items, and structured markdown." },
        },
      },
    },
    "/api/v1/court-listener": {
      post: {
        tags: ["Clean Datasets"],
        summary: "CourtListener Legal Opinions Harvester",
        description:
          "Queries CourtListener Free Law Project v4 API for US federal and state case law, court opinions, and legal precedents.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct API URL" },
                  query: { type: "string", description: "Legal search query or party names" },
                  court: {
                    type: "string",
                    description: "Court jurisdiction code (e.g. scotus, ca9)",
                  },
                  judge: { type: "string", description: "Judge name" },
                  opinionId: { type: "integer", description: "Direct opinion record ID" },
                  limit: { type: "integer", default: 10 },
                  page: { type: "integer", default: 1 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Court opinions, judicial decisions, and structured markdown." },
        },
      },
    },
    "/api/v1/software-heritage": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Software Heritage Universal Source Code Harvester",
        description:
          "Queries Software Heritage Universal Source Code Archive for persistent SWHIDs, code blobs, directory trees, and origin visits.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct API URL" },
                  swhid: {
                    type: "string",
                    description: "SWHID identifier (e.g. swh:1:cnt:..., swh:1:dir:...)",
                  },
                  originUrl: {
                    type: "string",
                    description: "Repository origin URL (e.g. https://github.com/...)",
                  },
                  action: {
                    type: "string",
                    enum: ["content", "directory", "origin", "revision"],
                    default: "content",
                  },
                  rawTextMaxChars: { type: "integer", default: 100000 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Source code blobs, directory entries, or snapshot origin metadata.",
          },
        },
      },
    },
    "/api/v1/eur-lex": {
      post: {
        tags: ["Clean Datasets"],
        summary: "EUR-Lex European Union Law Harvester",
        description:
          "Queries EUR-Lex and EU CELLAR repository for EU directives, regulations, decisions, and Court of Justice case law.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct API URL" },
                  celex: {
                    type: "string",
                    description: "CELEX identifier (e.g. 32016R0679 for GDPR)",
                  },
                  query: { type: "string", description: "Search query for EU legal acts" },
                  language: { type: "string", default: "en" },
                  limit: { type: "integer", default: 10 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "EU directives, regulations, court judgments, and structured markdown.",
          },
        },
      },
    },
    "/api/v1/openstax": {
      post: {
        tags: ["Clean Datasets"],
        summary: "OpenStax Textbook & Curriculum Harvester",
        description:
          "Queries OpenStax for openly licensed peer-reviewed college textbooks, curriculums, and chapter content.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct API or chapter URL" },
                  query: { type: "string", description: "Search query for textbooks" },
                  bookId: { type: "string", description: "OpenStax CMS book ID" },
                  slug: { type: "string", description: "Book slug identifier" },
                  action: {
                    type: "string",
                    enum: ["catalog", "search", "detail", "chapter"],
                    default: "catalog",
                  },
                  limit: { type: "integer", default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OpenStax textbooks list, book details, or chapter markdown content.",
          },
        },
      },
    },
    "/api/v1/mit-ocw": {
      post: {
        tags: ["Clean Datasets"],
        summary: "MIT OpenCourseWare Harvester",
        description:
          "Queries MIT OpenCourseWare for university curriculum materials, syllabi, lecture metadata, and course resources.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct course API URL" },
                  query: { type: "string", description: "Course keyword or topic search" },
                  courseSlug: {
                    type: "string",
                    description: "Course slug for syllabus detail",
                  },
                  action: {
                    type: "string",
                    enum: ["search", "course"],
                    default: "search",
                  },
                  limit: { type: "integer", default: 10 },
                  offset: { type: "integer", default: 0 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "MIT OpenCourseWare courses, syllabi, lecture notes, and structured markdown.",
          },
        },
      },
    },
    "/api/v1/resmi-gazete": {
      post: {
        tags: ["Clean Datasets"],
        summary: "T.C. Resmî Gazete Harvester",
        description:
          "Harvests T.C. Resmî Gazete daily bulletins, laws, presidential decrees, regulations, and announcements with full metadata.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: { type: "string", description: "Direct Resmî Gazete bulletin URL" },
                  date: {
                    type: "string",
                    description: "Publication date (YYYY-MM-DD or YYYYMMDD)",
                  },
                  issueNumber: { type: "integer", description: "Official gazette issue number" },
                  category: {
                    type: "string",
                    enum: [
                      "all",
                      "kanun",
                      "cumhurbaskanligi",
                      "yonetmelik",
                      "teblig",
                      "kurul-karari",
                      "ilanlar",
                    ],
                    default: "all",
                  },
                  query: { type: "string", description: "Keyword search filter" },
                  format: { type: "string", enum: ["markdown", "json"], default: "markdown" },
                  limit: { type: "integer", default: 50 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured Resmî Gazete legislation documents, issue metadata, and LLM Markdown.",
          },
        },
      },
    },
    "/api/v1/yargitay": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Yargıtay & Danıştay Jurisprudence Harvester",
        description:
          "Extracts Turkish Supreme Court of Appeals (Yargıtay) and Council of State (Danıştay) precedent rulings, case jurisprudence, and reasoning.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: {
                    type: "string",
                    description: "Direct decision URL or search query endpoint",
                  },
                  court: {
                    type: "string",
                    enum: ["yargitay", "danistay"],
                    default: "yargitay",
                  },
                  chamber: {
                    type: "string",
                    description: "Chamber name (e.g. '1. Hukuk Dairesi')",
                  },
                  caseNumber: { type: "string", description: "Esas No (e.g. '2021/1234')" },
                  decisionNumber: { type: "string", description: "Karar No (e.g. '2022/567')" },
                  year: { type: "integer", description: "Decision year" },
                  legalArea: {
                    type: "string",
                    enum: ["all", "hukuk", "ceza", "idari", "vergi"],
                    default: "all",
                  },
                  query: { type: "string", description: "Search keyword" },
                  limit: { type: "integer", default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured court decisions, chambers, legal reasoning, and LLM-ready Markdown.",
          },
        },
      },
    },
    "/api/v1/kap": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Kamuoyu Aydınlatma Platformu (KAP) Harvester",
        description:
          "Extracts Borsa Istanbul (BIST) corporate disclosures, financial reports, board decisions, and regulatory filings.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: {
                    type: "string",
                    description: "Direct URL to a specific KAP disclosure or endpoint",
                  },
                  companyTicker: {
                    type: "string",
                    description: "BIST company ticker (e.g. THYAO, ASELS, GARAN)",
                  },
                  disclosureType: {
                    type: "string",
                    enum: ["all", "oda", "fr", "dg", "gk"],
                    default: "all",
                  },
                  fromDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
                  toDate: { type: "string", description: "End date (YYYY-MM-DD)" },
                  query: { type: "string", description: "Search keyword in disclosures" },
                  limit: { type: "integer", default: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured company disclosures, financial reports, and LLM-ready Markdown.",
          },
        },
      },
    },
    "/api/v1/github": {
      post: {
        tags: ["Clean Datasets"],
        summary: "GitHub Repository & Code Harvester",
        description:
          "Extracts repository metadata, README documentation, issues, pull requests, releases, and git trees from GitHub.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: {
                    type: "string",
                    description:
                      "Direct URL to GitHub repository (e.g. https://github.com/owner/repo)",
                  },
                  owner: {
                    type: "string",
                    description: "Repository owner or organization name",
                  },
                  repo: {
                    type: "string",
                    description: "Repository name",
                  },
                  action: {
                    type: "string",
                    enum: ["repo", "readme", "issues", "pulls", "releases", "tree"],
                    default: "repo",
                  },
                  state: {
                    type: "string",
                    enum: ["open", "closed", "all"],
                    default: "open",
                  },
                  limit: { type: "integer", default: 30 },
                  token: {
                    type: "string",
                    description: "Optional GitHub personal access token for higher rate limits",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured repository data, documentation, issue/PR discussions, and LLM-ready Markdown.",
          },
        },
      },
    },
    "/api/v1/openreview": {
      post: {
        tags: ["Clean Datasets"],
        summary: "OpenReview Academic Submissions & Reviews Harvester",
        description:
          "Extracts academic paper submissions, peer reviews, author rebuttals, meta-reviews, and decisions (ICLR, NeurIPS, ICML).",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: {
                    type: "string",
                    description:
                      "Direct OpenReview forum URL (e.g. https://openreview.net/forum?id=xxx)",
                  },
                  action: {
                    type: "string",
                    enum: ["submissions", "forum", "note"],
                    default: "submissions",
                  },
                  venue: {
                    type: "string",
                    description:
                      "Conference venue ID (e.g. ICLR.cc/2024/Conference, NeurIPS.cc/2023/Conference)",
                  },
                  forumId: {
                    type: "string",
                    description:
                      "Paper forum ID to fetch all peer reviews, comments, and author rebuttals",
                  },
                  noteId: {
                    type: "string",
                    description: "Specific note ID",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword in paper titles and abstracts",
                  },
                  limit: { type: "integer", default: 25 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured academic submissions, peer review scores, author rebuttals, and LLM-ready dialectic Markdown.",
          },
        },
      },
    },
    "/api/v1/hacker-news": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Hacker News Discussions & Architecture Post-Mortems Harvester",
        description:
          "Extracts Hacker News engineering discussions, architecture post-mortems, and nested comment trees via Algolia and Firebase APIs.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetUrl: {
                    type: "string",
                    description:
                      "Direct Hacker News item or API URL (e.g. https://news.ycombinator.com/item?id=38870197)",
                  },
                  action: {
                    type: "string",
                    enum: ["top", "best", "new", "ask", "show", "story", "search"],
                    default: "top",
                  },
                  storyId: {
                    type: "integer",
                    description: "Hacker News story ID to fetch complete nested comment tree",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword query across stories and discussions",
                  },
                  limit: { type: "integer", default: 20 },
                  maxComments: { type: "integer", default: 50 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured Hacker News stories, points, authors, nested comment trees, and LLM-ready Markdown.",
          },
        },
      },
    },
    "/api/v1/huggingface-datasets": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Hugging Face Datasets Server Harvester",
        description:
          "Streams structured dataset rows, split configurations, and schema features from Hugging Face Serverless Datasets API.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["dataset"],
                properties: {
                  dataset: {
                    type: "string",
                    description:
                      "Hugging Face dataset identifier (e.g. 'openai/gsm8k' or 'tatsu-lab/alpaca')",
                    example: "openai/gsm8k",
                  },
                  action: {
                    type: "string",
                    enum: ["rows", "splits", "info", "size"],
                    default: "rows",
                    description: "Target action: rows, splits, info, or size",
                  },
                  config: {
                    type: "string",
                    default: "default",
                    description: "Dataset configuration or subset name",
                  },
                  split: {
                    type: "string",
                    default: "train",
                    description: "Dataset split (e.g. train, test, validation)",
                  },
                  offset: {
                    type: "integer",
                    default: 0,
                    description: "Row offset to start streaming from",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Maximum number of rows to return (1-100)",
                  },
                  hfToken: {
                    type: "string",
                    description: "Optional Hugging Face user access token for gated datasets",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Hugging Face dataset URL or datasets-server endpoint",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured dataset rows, schema features, total row count, and GFM Markdown preview table.",
          },
        },
      },
    },
    "/api/v1/math-reasoning": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Mathematical Reasoning & Chain-of-Thought Harvester",
        description:
          "Extracts mathematical problem solving and multi-step Chain-of-Thought (CoT) reasoning pairs (GSM8K, Hendrycks MATH, SVAMP, OlympiadBench).",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  benchmark: {
                    type: "string",
                    enum: ["gsm8k", "math", "svamp", "olympiadbench"],
                    default: "gsm8k",
                    description: "Target benchmark dataset family",
                    example: "gsm8k",
                  },
                  subject: {
                    type: "string",
                    description: "Specific subject or category (e.g. 'algebra' for Hendrycks MATH)",
                    example: "algebra",
                  },
                  split: {
                    type: "string",
                    default: "train",
                    description: "Dataset split: train or test",
                    example: "train",
                  },
                  offset: {
                    type: "integer",
                    default: 0,
                    description: "Row offset to start streaming from",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Maximum number of problems to return (1-100)",
                  },
                  hfToken: {
                    type: "string",
                    description: "Optional Hugging Face user access token",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Hugging Face dataset URL or datasets-server endpoint",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured problem-reasoning-answer items, LaTeX expressions, and Chain-of-Thought Markdown.",
          },
        },
      },
    },
    "/api/v1/code-eval": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Code Generation & Evaluation Benchmark Harvester",
        description:
          "Extracts standard coding evaluation benchmark tasks (HumanEval, MBPP, SWE-bench) with prompts, canonical solutions, and verification unit tests.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  benchmark: {
                    type: "string",
                    enum: ["humaneval", "mbpp", "swe-bench"],
                    default: "humaneval",
                    description: "Target coding benchmark family",
                    example: "humaneval",
                  },
                  split: {
                    type: "string",
                    default: "test",
                    description: "Dataset split: test or train",
                    example: "test",
                  },
                  offset: {
                    type: "integer",
                    default: 0,
                    description: "Task offset to start streaming from",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Maximum number of tasks to return (1-100)",
                  },
                  hfToken: {
                    type: "string",
                    description: "Optional Hugging Face user access token",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Hugging Face dataset URL or datasets-server endpoint",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured coding tasks, entry points, canonical solutions, and verification unit tests.",
          },
        },
      },
    },
    "/api/v1/proofwiki": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Formal Mathematical Proofs & Theorems Harvester",
        description:
          "Extracts mathematical theorems, formal multi-step proofs, definitions, sources, and normalized LaTeX math equations from ProofWiki via MediaWiki API.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["theorem", "search", "random", "category"],
                    default: "theorem",
                    description:
                      "Extraction mode: theorem (direct title lookup), search, random, or category",
                    example: "theorem",
                  },
                  title: {
                    type: "string",
                    description: "Target theorem or definition title",
                    example: "Pythagorean Theorem",
                  },
                  query: {
                    type: "string",
                    description: "Keyword search query when action is search",
                    example: "Euler identity",
                  },
                  category: {
                    type: "string",
                    description:
                      "MediaWiki category title without namespace prefix when action is category",
                    example: "Theorems",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Maximum number of items to return (1-50)",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Optional custom ProofWiki API endpoint URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Structured theorems, proofs, definitions, categories, and GFM Markdown.",
          },
        },
      },
    },
    "/api/v1/lean-mathlib": {
      post: {
        tags: ["Clean Datasets"],
        summary: "Lean 4 & Mathlib Computer-Verified Formal Proofs Harvester",
        description:
          "Extracts machine-verified formal theorems, lemmas, definitions, and step-by-step proof tactic sequences from Lean 4 and Mathlib4 repositories.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["file", "theorem", "search", "random"],
                    default: "file",
                    description:
                      "Extraction mode: file (full file declarations), theorem (specific theorem), search, or random",
                    example: "file",
                  },
                  repo: {
                    type: "string",
                    default: "leanprover-community/mathlib4",
                    description: "Target GitHub repository",
                    example: "leanprover-community/mathlib4",
                  },
                  path: {
                    type: "string",
                    default: "Mathlib/Data/Nat/Basic.lean",
                    description: "Path to .lean file in repository",
                    example: "Mathlib/Data/Nat/Basic.lean",
                  },
                  theorem: {
                    type: "string",
                    description: "Specific theorem or lemma name to filter and extract",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword for code search mode",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Maximum number of declarations to return (1-100)",
                  },
                  githubToken: {
                    type: "string",
                    description: "Optional GitHub personal access token",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct GitHub raw URL or mock endpoint",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured formal declarations, docstrings, type signatures, and tactic proofs.",
          },
        },
      },
    },
    "/api/v1/lesswrong": {
      post: {
        tags: ["Clean Datasets"],
        summary: "LessWrong & Alignment Forum Epistemic Rationality Harvester",
        description:
          "Extracts epistemic rationality, Bayesian epistemology, decision theory, and AI alignment essays and dialectic comment trees from LessWrong and Alignment Forum GraphQL APIs.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["posts", "post", "comments", "search"],
                    default: "posts",
                    description:
                      "Extraction mode: posts (list), post (single article with comments), comments, or search",
                    example: "posts",
                  },
                  platform: {
                    type: "string",
                    enum: ["lesswrong", "alignmentforum"],
                    default: "lesswrong",
                    description: "Target platform: lesswrong or alignmentforum",
                    example: "lesswrong",
                  },
                  postId: {
                    type: "string",
                    description: "Specific post ID",
                  },
                  slug: {
                    type: "string",
                    description: "Post URL slug",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword for articles or topics",
                  },
                  view: {
                    type: "string",
                    enum: ["curated", "top", "new"],
                    default: "curated",
                    description: "Article sorting view",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Maximum number of posts or comments to return (1-50)",
                  },
                  includeComments: {
                    type: "boolean",
                    default: true,
                    description: "Whether to include dialectic comment thread for single post",
                  },
                  maxComments: {
                    type: "integer",
                    default: 10,
                    description: "Maximum comments to fetch for a post (1-50)",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct LessWrong/AlignmentForum URL or mock endpoint",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured rationality essays, author metadata, vote scores, and dialectic comments.",
          },
        },
      },
    },
    "/api/v1/youtube-transcripts": {
      post: {
        tags: ["Clean Datasets", "Scraping"],
        summary: "YouTube Transcripts & Captions Harvester",
        description:
          "Extracts captions, timestamped transcripts, and video metadata from YouTube videos and Shorts with LLM text cleaning, dual-engine HTTP/Playwright execution, and multi-format export.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  urls: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "List of YouTube video URLs (watch, youtu.be, shorts) or video IDs",
                    example: ["https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
                  },
                  videoId: {
                    type: "string",
                    description: "Single YouTube 11-character video ID",
                  },
                  outputFormat: {
                    type: "string",
                    enum: [
                      "captions",
                      "textWithTimestamps",
                      "xmlWithoutTimestamps",
                      "xmlWithTimestamps",
                      "singleStringText",
                    ],
                    default: "captions",
                    description:
                      "Transcript format: captions, textWithTimestamps, singleStringText, xml",
                  },
                  languageCode: {
                    type: "string",
                    default: "en",
                    description: "Preferred caption language code (e.g. en, tr)",
                  },
                  cleanText: {
                    type: "boolean",
                    default: true,
                    description:
                      "Whether to strip auditory noise markers ([Music], [Applause]) for LLM dataset cleanliness",
                  },
                  channelNameBoolean: {
                    type: "boolean",
                    default: false,
                    description: "Whether to extract channel name",
                  },
                  channelIDBoolean: {
                    type: "boolean",
                    default: false,
                    description: "Whether to extract channel ID",
                  },
                  datePublishedBoolean: {
                    type: "boolean",
                    default: false,
                    description: "Whether to extract ISO 8601 publish date",
                  },
                  viewCountBoolean: {
                    type: "boolean",
                    default: false,
                    description: "Whether to extract view count",
                  },
                  keywordsBoolean: {
                    type: "boolean",
                    default: false,
                    description: "Whether to extract video keywords/tags",
                  },
                  descriptionBoolean: {
                    type: "boolean",
                    default: false,
                    description: "Whether to extract video description",
                  },
                  preferBrowser: {
                    type: "boolean",
                    default: false,
                    description: "Whether to force Playwright Chromium engine",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Target YouTube URL or mock endpoint",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured YouTube transcripts, video metadata, segment timestamps, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/wikisource": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikisource Primary Historical & Literary Sources Harvester",
        description:
          "Extracts verified primary historical documents, philosophical essays, speeches, and literary classics across 85+ languages from official Wikimedia Wikisource REST and Action APIs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Work or chapter title (e.g. 'De bello Gallico', 'Nutuk')",
                    example: "De bello Gallico",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language edition code (e.g. 'la', 'tr', 'en', 'sa', 'mul')",
                    example: "la",
                  },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search expression for discovering primary works",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Maximum search results to return",
                  },
                  fetchFullArticles: {
                    type: "boolean",
                    default: false,
                    description: "Whether to fetch full markdown for each search result",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikisource URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured Wikisource items, metadata, full markdown texts, and query metadata.",
          },
        },
      },
    },
    "/api/v1/wiktionary": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wiktionary Multi-Language Lexical & Etymological Extractor",
        description:
          "Queries official Wikimedia Wiktionary REST and Action APIs across 198+ languages for lexical definitions, etymology, parts of speech, and translations.",
        operationId: "queryWiktionary",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  word: {
                    type: "string",
                    description: "Word or lemma to look up (e.g. 'algorithm', 'kitap')",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language edition code (e.g. 'en', 'tr', 'la', 'fr', 'de')",
                  },
                  action: {
                    type: "string",
                    enum: ["definition", "entry", "search", "random"],
                    default: "definition",
                    description: "Extraction mode: definition, entry, search, or random",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword for finding dictionary words",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Maximum search or random items to return",
                  },
                  extractMarkdown: {
                    type: "boolean",
                    default: true,
                    description: "Convert HTML definitions and entries to clean GFM Markdown",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wiktionary URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured dictionary entries, parts of speech, definitions, etymology, and GFM Markdown.",
          },
        },
      },
    },
    "/api/v1/wikiquote": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikiquote Quotations & Aphorisms Harvester",
        description:
          "Extracts verified quotations, speeches, aphorisms, and literary dialogue across 90+ languages from official Wikiquote REST and Action APIs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Author, work, or topic title",
                    example: "Albert Einstein",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language edition code",
                    example: "en",
                  },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search expression",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max results",
                  },
                  fetchFullArticles: {
                    type: "boolean",
                    default: false,
                    description: "Whether to fetch full article markdown for search hits",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikiquote URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Structured quotations, metadata, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/wikibooks": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikibooks Open Textbooks Harvester",
        description:
          "Extracts open-access textbooks, pedagogical modules, and technical manuals across 120+ languages from official Wikibooks REST and Action APIs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Textbook or chapter title",
                    example: "Python Programming",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language edition code",
                    example: "en",
                  },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search expression",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max results",
                  },
                  fetchFullArticles: {
                    type: "boolean",
                    default: false,
                    description: "Whether to fetch full chapter markdown for search hits",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikibooks URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Structured textbook chapters, metadata, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/wikiversity": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikiversity Academic Courses Harvester",
        description:
          "Extracts university course modules, academic study guides, and research outlines across 17+ languages from official Wikiversity REST and Action APIs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Course or module title",
                    example: "Introduction to Computer Science",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language edition code",
                    example: "en",
                  },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search expression",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max results",
                  },
                  fetchFullArticles: {
                    type: "boolean",
                    default: false,
                    description: "Whether to fetch full module markdown for search hits",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikiversity URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Structured academic course modules, metadata, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/wikivoyage": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikivoyage Travel & Geographic Harvester",
        description:
          "Extracts geographic guides, destination profiles, cultural itineraries, and landmarks across 30+ languages from official Wikivoyage REST and Action APIs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Destination or guide title",
                    example: "Istanbul",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language edition code",
                    example: "en",
                  },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search expression",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max results",
                  },
                  fetchFullArticles: {
                    type: "boolean",
                    default: false,
                    description: "Whether to fetch full destination markdown for search hits",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikivoyage URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Structured destination guides, listings, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/wikinews": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikinews Journalism & News Harvester",
        description:
          "Extracts collaborative journalism dispatches, event timelines, and news articles across 35+ languages from official Wikinews REST and Action APIs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "News article or dispatch title",
                    example: "James Webb Space Telescope",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language edition code",
                    example: "en",
                  },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search expression",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max results",
                  },
                  fetchFullArticles: {
                    type: "boolean",
                    default: false,
                    description: "Whether to fetch full article markdown for search hits",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikinews URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured journalism articles, event timelines, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/wikispecies": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikispecies Taxonomic Nomenclature Harvester",
        description:
          "Extracts biological classifications, phylogenetic clades, and nomenclature from official Wikispecies APIs on species.wikimedia.org.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  taxon: {
                    type: "string",
                    description: "Taxon or scientific name",
                    example: "Panthera leo",
                  },
                  action: {
                    type: "string",
                    enum: ["summary", "article", "search"],
                    default: "summary",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search expression",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max results",
                  },
                  fetchFullArticles: {
                    type: "boolean",
                    default: false,
                    description: "Whether to fetch full profile markdown for search hits",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikispecies URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Structured taxonomic profiles, classifications, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/wikidata": {
      post: {
        tags: ["Corpus Extraction"],
        summary: "Wikidata Structured Knowledge Graph Harvester",
        description:
          "Extracts structured knowledge graph entities, claims, statements, and executes SPARQL queries against official Wikidata APIs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  entityId: {
                    type: "string",
                    description: "Wikidata entity identifier (QID or PID)",
                    example: "Q42",
                  },
                  action: {
                    type: "string",
                    enum: ["entity", "search", "sparql", "claims"],
                    default: "entity",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword for entity lookup",
                  },
                  sparql: {
                    type: "string",
                    description: "SPARQL query string",
                  },
                  propertyId: {
                    type: "string",
                    description: "Filter specific claims property (e.g. P31)",
                  },
                  lang: {
                    type: "string",
                    default: "en",
                    description: "Language for labels and descriptions",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max results",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Wikidata URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured entity claims, labels, SPARQL bindings, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/stanford-phil": {
      post: {
        tags: ["Corpus - Deep Reasoning"],
        summary: "Stanford Encyclopedia of Philosophy (SEP) Harvester",
        description:
          "Harvests peer-reviewed philosophical entries, bibliographies, outlines, and concepts from the Stanford Encyclopedia of Philosophy (SEP).",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  slug: {
                    type: "string",
                    description: "SEP entry slug (e.g. 'goedel-incompleteness', 'logic-modal')",
                  },
                  action: {
                    type: "string",
                    enum: ["entry", "search", "contents"],
                    default: "entry",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Keyword search query",
                  },
                  letter: {
                    type: "string",
                    description: "Index letter for contents",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Max results",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct SEP URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured SEP treatise, authors, outlines, bibliography, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/internet-phil": {
      post: {
        tags: ["Corpus - Deep Reasoning"],
        summary: "Internet Encyclopedia of Philosophy (IEP) Harvester",
        description:
          "Harvests peer-reviewed academic philosophy articles, outlines, author attributions, and references from the Internet Encyclopedia of Philosophy (IEP).",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  slug: {
                    type: "string",
                    description: "IEP article slug (e.g. 'goedel', 'prop-log')",
                  },
                  action: {
                    type: "string",
                    enum: ["entry", "search"],
                    default: "entry",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword query",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Max results",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct IEP URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured IEP article, authors, outlines, references, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/metamath": {
      post: {
        tags: ["Corpus - Deep Reasoning"],
        summary: "Metamath Formal Proof Explorer Harvester",
        description:
          "Harvests formal mathematical proofs, axioms, hypotheses, and step-by-step verification chains from the Metamath Proof Explorer (set.mm, iset.mm, ql.mm).",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  theorem: {
                    type: "string",
                    description: "Metamath theorem symbol (e.g. 'mpc2', 'pythag')",
                  },
                  axiom: {
                    type: "string",
                    description: "Metamath axiom symbol (e.g. 'ax-1')",
                  },
                  action: {
                    type: "string",
                    enum: ["theorem", "search", "axiom"],
                    default: "theorem",
                    description: "Extraction mode",
                  },
                  database: {
                    type: "string",
                    enum: ["set.mm", "iset.mm", "ql.mm"],
                    default: "set.mm",
                    description: "Metamath database",
                  },
                  query: {
                    type: "string",
                    description: "Search query",
                  },
                  includeProofSteps: {
                    type: "boolean",
                    default: true,
                    description: "Whether to include proof step table",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Max results",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Metamath URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured formal proof report, hypotheses, assertion, proof steps, and GFM Markdown.",
          },
        },
      },
    },
    "/api/v1/philpapers": {
      post: {
        tags: ["Corpus - Deep Reasoning"],
        summary: "PhilPapers Philosophical Research Archive Harvester",
        description:
          "Harvests academic philosophy citations, abstracts, publication metadata, and category taxonomies from the PhilPapers Archive.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "PhilPapers record ID (e.g. 'CHADCO')",
                  },
                  action: {
                    type: "string",
                    enum: ["record", "search", "category"],
                    default: "record",
                    description: "Extraction mode",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword query",
                  },
                  category: {
                    type: "string",
                    description: "Category slug",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Max results",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct PhilPapers URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured publication record, authors, abstract, taxonomy categories, and GFM Markdown report.",
          },
        },
      },
    },
    "/api/v1/devdocs": {
      post: {
        tags: ["Corpus - Developer Knowledge"],
        summary: "DevDocs Developer Documentation Harvester",
        description:
          "Harvests official developer documentation, API references, guides, and docset indexes across 100+ technologies from DevDocs.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["list_docs", "search", "entry"],
                    default: "list_docs",
                    description: "Extraction mode",
                  },
                  doc: {
                    type: "string",
                    description: "Docset slug (e.g. 'rust', 'python~3.12')",
                  },
                  path: {
                    type: "string",
                    description: "Entry path within docset",
                  },
                  query: {
                    type: "string",
                    description: "Keyword search query",
                  },
                  category: {
                    type: "string",
                    description: "Category filter",
                  },
                  limit: {
                    type: "integer",
                    default: 20,
                    description: "Max results",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct DevDocs URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Documentation catalog, search index results, or clean GFM Markdown documentation.",
          },
        },
      },
    },
    "/api/v1/rosetta-code": {
      post: {
        tags: ["Corpus - Developer Knowledge"],
        summary: "Rosetta Code Multi-Language Algorithm Harvester",
        description:
          "Harvests multi-language algorithm implementations, code comparisons, and programming tasks across 800+ languages from Rosetta Code.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["task", "search", "random", "languages"],
                    default: "task",
                    description: "Extraction mode",
                  },
                  task: {
                    type: "string",
                    description: "Task name (e.g. '100 doors')",
                  },
                  language: {
                    type: "string",
                    description: "Target programming language (e.g. 'Python', 'Rust')",
                  },
                  query: {
                    type: "string",
                    description: "Keyword search query",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max implementations or results",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct Rosetta Code wiki URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured task description, multi-language code implementations, and GFM Markdown.",
          },
        },
      },
    },
    "/api/v1/papers-with-code": {
      post: {
        tags: ["Corpus - Developer Knowledge"],
        summary: "Papers With Code & Hugging Face Papers Harvester",
        description:
          "Harvests machine learning papers, official GitHub code repositories, arXiv abstracts, and benchmark tasks from Papers With Code & Hugging Face Papers.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["paper", "trending", "daily", "search"],
                    default: "paper",
                    description: "Extraction mode",
                  },
                  paper: {
                    type: "string",
                    description: "Paper slug or title (e.g. 'attention-is-all-you-need')",
                  },
                  arxivId: {
                    type: "string",
                    description: "arXiv identifier (e.g. '1706.03762')",
                  },
                  query: {
                    type: "string",
                    description: "Search keyword query",
                  },
                  limit: {
                    type: "integer",
                    default: 10,
                    description: "Max papers to return",
                  },
                  targetUrl: {
                    type: "string",
                    description: "Direct paper URL",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Structured ML paper record, authors, abstract, GitHub code implementations, and GFM Markdown.",
          },
        },
      },
    },
    "/api/v1/sitemap": {
      post: {
        tags: ["Crawling"],
        summary: "XML Sitemap & Feed Harvester",
        description:
          "Traverses standard XML sitemaps, sitemapindex, gzipped sitemaps, and RSS/Atom feeds.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUrl"],
                properties: {
                  targetUrl: { type: "string", description: "Sitemap or sitemapindex URL." },
                  options: {
                    type: "object",
                    properties: {
                      maxUrls: { type: "integer", default: 5000 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Extracted URL entries and child sitemaps." },
        },
      },
    },
    "/api/v1/reader": {
      post: {
        tags: ["Documents"],
        summary: "LLM Markdown Reader & Document Distiller",
        description:
          "Distills web pages into clean GitHub Flavored Markdown with YAML frontmatter, table of contents, and token estimation.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUrl"],
                properties: {
                  targetUrl: { type: "string", description: "Target webpage or article URL." },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Clean Markdown with metadata and token estimates." },
        },
      },
    },
    "/api/v1/network/intercept": {
      post: {
        tags: ["Scraping"],
        summary: "Headless Browser Network Interceptor",
        description:
          "Loads page in headless Chromium and intercepts background XHR/Fetch JSON API responses.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUrl"],
                properties: {
                  targetUrl: { type: "string", description: "Target dynamic web application URL." },
                  options: {
                    type: "object",
                    properties: {
                      urlPatterns: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Captured background API network requests." },
        },
      },
    },
    "/api/v1/browser/action": {
      post: {
        tags: ["Browser Control"],
        summary: "Execute Interactive Browser Action",
        description:
          "Executes stateful browser actions (navigate, click, fill, screenshot, evaluate) within an isolated Chromium session.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sessionId", "action"],
                properties: {
                  sessionId: { type: "string", description: "Target browser session UUID." },
                  action: {
                    type: "string",
                    enum: ["navigate", "click", "fill", "screenshot", "evaluate", "html"],
                    description: "Browser action to execute.",
                  },
                  params: {
                    type: "object",
                    description: "Action-specific parameters (e.g. url, selector, value).",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Action executed successfully." },
          "400": { description: "Action execution failure or missing parameters." },
        },
      },
    },
    "/api/v1/browser/session/{id}": {
      delete: {
        tags: ["Browser Control"],
        summary: "Close Interactive Browser Session",
        description:
          "Closes the target Chromium browser session and releases allocated memory and contexts.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Browser session ID to terminate.",
          },
        ],
        responses: {
          "200": { description: "Browser session closed successfully." },
        },
      },
    },
    "/api/v1/store/actors": {
      get: {
        tags: ["Store & Runtime"],
        summary: "List Actor Store Catalog",
        description:
          "Returns the inventory of available microservice extraction actors and metrics.",
        responses: {
          "200": { description: "Actor catalog array." },
        },
      },
    },
    "/api/v1/store/actors/{name}": {
      get: {
        tags: ["Store & Runtime"],
        summary: "Get Actor Manifest & Schema",
        description:
          "Returns full manifest, input/output schemas, and usage documentation for a specific actor.",
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Actor manifest definition." },
          "404": { description: "Actor not found." },
        },
      },
    },
    "/api/v1/store/actors/{name}/run": {
      post: {
        tags: ["Store & Runtime"],
        summary: "Execute Actor via Store Router",
        description:
          "Executes an actor instance, records telemetry in run registry, and streams live SSE logs.",
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        responses: {
          "200": { description: "Run execution result with runId." },
        },
      },
    },
    "/api/v1/pipelines/run": {
      post: {
        tags: ["Pipelines"],
        summary: "Execute Declarative YAML Pipeline",
        description:
          "Executes a declarative pipeline to acquire, normalize, quality filter, deduplicate, and shard LLM dataset items.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  yaml: { type: "string", description: "Raw YAML pipeline definition." },
                  filePath: {
                    type: "string",
                    description: "Relative path to YAML pipeline file.",
                  },
                  config: { type: "object", description: "Parsed JSON pipeline configuration." },
                  async: {
                    type: "boolean",
                    description: "If true, executes asynchronously in background and returns 202.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Pipeline executed successfully." },
          "202": { description: "Pipeline execution started in background." },
          "400": { description: "Invalid pipeline payload or missing parameters." },
          "422": { description: "Pipeline execution failed." },
        },
      },
    },
    "/api/v1/pipelines/runs": {
      get: {
        tags: ["Pipelines"],
        summary: "List Pipeline Execution Runs",
        description: "Returns recent pipeline execution records and statuses.",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 50 },
            description: "Maximum number of executions to return.",
          },
        ],
        responses: {
          "200": { description: "Pipeline executions array." },
        },
      },
    },
    "/api/v1/pipelines/runs/{id}": {
      get: {
        tags: ["Pipelines"],
        summary: "Get Pipeline Execution Details",
        description:
          "Returns metadata, status, duration, item count, and storage receipt for a run.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Pipeline execution ID.",
          },
        ],
        responses: {
          "200": { description: "Pipeline run details." },
          "404": { description: "Run not found." },
        },
      },
    },
    "/api/v1/pipelines/templates": {
      get: {
        tags: ["Pipelines"],
        summary: "List Available Pipeline Templates",
        description:
          "Returns pre-configured sample pipeline YAML templates from examples/pipelines/.",
        responses: {
          "200": { description: "Pipeline templates array." },
        },
      },
    },
    "/api/v1/datasets/publish": {
      post: {
        tags: ["Datasets"],
        summary: "Publish Training Dataset Snapshot",
        description:
          "Seals corpus shards into a versioned training dataset snapshot with cryptographic SHA-256 checksums, train/val/test splits, and verified manifest.json.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["datasetName"],
                properties: {
                  datasetName: { type: "string", example: "arxiv_math" },
                  version: { type: "string", example: "2026.09.27.1" },
                  filePaths: {
                    type: "array",
                    items: { type: "string" },
                    description: "Local shard file paths to register and package.",
                  },
                  shardIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Pre-registered shard IDs.",
                  },
                  splitRatios: {
                    type: "object",
                    properties: {
                      train: { type: "number", example: 0.8 },
                      validation: { type: "number", example: 0.1 },
                      test: { type: "number", example: 0.1 },
                    },
                  },
                  outputDir: { type: "string", example: "data/snapshots/arxiv_math_v1" },
                  connectorName: { type: "string", example: "s3_archive" },
                  licenseGroup: {
                    type: "string",
                    enum: [
                      "permissive_commercial",
                      "non_commercial_research",
                      "public_domain",
                      "restricted",
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Dataset snapshot created and manifest sealed." },
          "400": { description: "Missing required parameters." },
          "403": { description: "Path traversal rejected." },
        },
      },
    },
    "/api/v1/datasets": {
      get: {
        tags: ["Datasets"],
        summary: "List Datasets in Catalog",
        description:
          "Returns all cataloged datasets with shard counts, total records, byte size, and latest snapshot summary.",
        responses: {
          "200": { description: "Array of datasets with snapshot metadata." },
        },
      },
    },
    "/api/v1/datasets/{name}": {
      get: {
        tags: ["Datasets"],
        summary: "Get Dataset Details",
        description:
          "Returns metadata, registered shard inventory, and snapshot history for the specified dataset.",
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Dataset detail record." },
          "404": { description: "Dataset not found." },
        },
      },
    },
    "/api/v1/datasets/{name}/manifest": {
      get: {
        tags: ["Datasets"],
        summary: "Get Latest Training Dataset Manifest",
        description:
          "Returns the raw, verified Training Dataset Manifest (manifest.json) for the dataset's latest snapshot.",
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Full Training Dataset Manifest JSON." },
          "404": { description: "No snapshot or manifest found." },
        },
      },
    },
    "/api/v1/datasets/{name}/snapshots": {
      get: {
        tags: ["Datasets"],
        summary: "List Dataset Snapshots",
        description:
          "Returns list of all published snapshots and versions for the specified dataset.",
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "List of snapshot records." },
        },
      },
    },
    "/api/v1/datasets/{name}/snapshots/{snapshotId}": {
      get: {
        tags: ["Datasets"],
        summary: "Get Specific Dataset Snapshot",
        description:
          "Returns snapshot metadata, split mappings, and full manifest for the given snapshot ID.",
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "snapshotId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Snapshot record and parsed manifest." },
          "404": { description: "Snapshot not found." },
        },
      },
    },
    "/api/v1/jobs/schedule": {
      post: {
        tags: ["Jobs"],
        summary: "Schedule Recurring Pipeline or Actor Task",
        description:
          "Schedules a recurring pipeline or actor task with a 5-part cron expression and SQLite ACID tracking.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cronExpression"],
                properties: {
                  jobId: { type: "string", example: "job_daily_arxiv" },
                  cronExpression: { type: "string", example: "0 2 * * *" },
                  pipeline: {
                    type: "object",
                    properties: {
                      yaml: { type: "string" },
                      filePath: {
                        type: "string",
                        example: "examples/pipelines/corpus-parquet-sample.yaml",
                      },
                      config: { type: "object" },
                    },
                  },
                  actor: {
                    type: "object",
                    properties: {
                      actorName: { type: "string", example: "arxiv" },
                      input: { type: "object" },
                    },
                  },
                  description: { type: "string", example: "Daily arXiv ingestion" },
                  checkIntervalMs: { type: "integer", example: 60000 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Job scheduled successfully." },
          "400": { description: "Invalid cron expression or payload." },
          "403": { description: "Path traversal attempt detected." },
          "404": { description: "Pipeline file not found." },
        },
      },
    },
    "/api/v1/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List Scheduled Jobs",
        description:
          "Lists all scheduled cron jobs from memory and persistent SQLite catalog with run counts and timestamps.",
        responses: {
          "200": { description: "List of scheduled jobs." },
        },
      },
    },
    "/api/v1/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Get Scheduled Job Details",
        description:
          "Returns metadata, cron expression, execution status, and run counts for a specific job.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Job details." },
          "404": { description: "Job not found." },
        },
      },
      delete: {
        tags: ["Jobs"],
        summary: "Cancel and Stop Scheduled Job",
        description:
          "Cancels the recurring timer and deactivates the job in persistent SQLite catalog.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Job cancelled successfully." },
          "404": { description: "Job not found." },
        },
      },
    },
    "/api/v1/jobs/{id}/stop": {
      post: {
        tags: ["Jobs"],
        summary: "Stop Scheduled Job (POST Alias)",
        description: "Cancels and deactivates the scheduled job via POST request.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Job stopped successfully." },
          "404": { description: "Job not found." },
        },
      },
    },
    "/api/v1/vault/export": {
      post: {
        tags: ["Cold Vault"],
        summary: "Export Dataset to Cold Vault Volume",
        description:
          "Copies sealed dataset shards and verified manifest to an offline/removable cold storage volume with atomic integrity verification and SHA256SUMS ledger recording.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["datasetName", "volumeRoot"],
                properties: {
                  datasetName: { type: "string", example: "arxiv_math" },
                  volumeRoot: {
                    type: "string",
                    example: "data/cold_vault/VOL-001",
                  },
                  version: { type: "string", example: "2026.09.27.1" },
                  volumeLabel: { type: "string", example: "VOL-2026-001" },
                  filesystem: {
                    type: "string",
                    enum: ["btrfs", "ext4", "other"],
                    example: "btrfs",
                  },
                  copyMode: {
                    type: "string",
                    enum: ["copy", "hardlink"],
                    example: "copy",
                  },
                  verifyChecksums: { type: "boolean", example: true },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Dataset exported to volume successfully." },
          "400": { description: "Invalid export payload." },
          "403": { description: "Path traversal attempt detected." },
          "404": { description: "Dataset or snapshot not found." },
          "500": { description: "Cryptographic checksum mismatch or transfer failure." },
        },
      },
    },
    "/api/v1/vault/verify": {
      post: {
        tags: ["Cold Vault"],
        summary: "Verify Cold Vault Volume Integrity",
        description:
          "Cryptographically audits all files on a cold vault volume against its checksums/SHA256SUMS ledger.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["volumeRoot"],
                properties: {
                  volumeRoot: {
                    type: "string",
                    example: "data/cold_vault/VOL-001",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Volume verification report." },
          "403": { description: "Forbidden volume path." },
        },
      },
    },
    "/api/v1/vault/inspect": {
      get: {
        tags: ["Cold Vault"],
        summary: "Inspect Cold Vault Volume Metadata",
        description:
          "Reads volume.json from the specified volume root and returns hardware label, UUID, and schema version.",
        parameters: [
          {
            name: "volumeRoot",
            in: "query",
            required: true,
            schema: { type: "string" },
            example: "data/cold_vault/VOL-001",
          },
        ],
        responses: {
          "200": { description: "Volume metadata." },
          "404": { description: "Volume metadata not found." },
        },
      },
    },
  },
};

export function renderDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Protokol-7 // API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #090b10; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
    .swagger-ui .wrapper { max-width: 1200px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
}
