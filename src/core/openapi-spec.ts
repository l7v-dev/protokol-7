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
