/**
 * Actor manifests, schemas, and metadata definitions for Protokol-7 Store.
 */

import type { ActorType } from "../core/types";

export type ActorCategory =
  | "SCRAPING"
  | "DOCUMENT"
  | "SEARCH"
  | "NETWORK"
  | "API"
  | "HEALTHCARE"
  | "GENERAL";

export interface ActorInputField {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  title: string;
  description: string;
  required?: boolean;
  default?: unknown;
  prefill?: unknown;
  enum?: string[];
  editor?: "textfield" | "textarea" | "select" | "json" | "checkbox" | "number";
}

export interface ActorInputSchema {
  type: "object";
  title: string;
  description: string;
  properties: Record<string, ActorInputField>;
  required: string[];
}

export interface ActorManifest {
  actorType: ActorType;
  name: string;
  title: string;
  category: ActorCategory;
  version: string;
  description: string;
  author: string;
  tags: string[];
  inputSchema: ActorInputSchema;
  outputSchema: {
    type: "object";
    fields: Record<string, { type: string; description: string }>;
  };
  exampleInput: Record<string, unknown>;
  readme: string;
  mcpTool: {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const ACTOR_MANIFESTS: Record<string, ActorManifest> = {
  "cheerio-scraper": {
    actorType: "cheerio-scraper",
    name: "cheerio-scraper",
    title: "Cheerio HTML Scraper",
    category: "SCRAPING",
    version: "1.2.0",
    description:
      "Statik HTML sayfalarini yuksek hizda indirip CSS secicileri ve DOM hiyerarsisini ayiklayan mikro-aktor.",
    author: "protokol-7",
    tags: ["html", "cheerio", "scraper", "low-latency"],
    inputSchema: {
      type: "object",
      title: "Cheerio Scraper Input",
      description: "Statik web kazıma girdi parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description: "Kazınacak sayfanın tam adresi (HTTP/HTTPS).",
          required: true,
          editor: "textfield",
          prefill: "https://example.com",
        },
        selectors: {
          name: "selectors",
          type: "object",
          title: "CSS Seçicileri",
          description:
            "Anahtar-değer formatında CSS seçici haritası (örn: { heading: 'h1', text: 'p' }).",
          editor: "json",
          prefill: { title: "h1", content: "article p" },
        },
        extractTables: {
          name: "extractTables",
          type: "boolean",
          title: "Tabloları Ayıkla",
          description: "HTML tablolarını GFM markdown formatına dönüştürür.",
          default: true,
          editor: "checkbox",
        },
        extractJsonLd: {
          name: "extractJsonLd",
          type: "boolean",
          title: "JSON-LD Ayıkla",
          description: "Sayfa içindeki schema.org mikro-verilerini ayıklar.",
          default: true,
          editor: "checkbox",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        url: { type: "string", description: "Taranan nihai adres" },
        title: { type: "string", description: "Sayfa başlığı" },
        content: { type: "string", description: "Ayıklanan gövde metni" },
        markdown: { type: "string", description: "GFM formatında markdown çıktısı" },
        tables: { type: "array", description: "Çıkarılan GFM tabloları" },
        links: { type: "array", description: "Sayfadaki bağlantı adresleri" },
      },
    },
    exampleInput: {
      targetUrl: "https://example.com",
      selectors: { title: "h1", paragraph: "p" },
      extractTables: true,
    },
    readme: `# Cheerio HTML Scraper\n\nStatik HTML dokümanlarını düşük gecikmeyle ayrıştırır.\n\n## Parametreler\n- \`targetUrl\`: Hedef URL\n- \`selectors\`: Özel CSS seçicileri\n- \`extractTables\`: Tablo ayıklama bayrağı`,
    mcpTool: {
      name: "scrape_static_html",
      description: "Cheerio tabanli yuksek hizli statik HTML DOM ayiklayici.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Hedef web adresi." },
          selectors: { type: "object", description: "CSS secicileri sozcesi." },
        },
        required: ["targetUrl"],
      },
    },
  },

  "playwright-browser": {
    actorType: "playwright-browser",
    name: "playwright-browser",
    title: "Playwright Headless Browser",
    category: "SCRAPING",
    version: "1.3.0",
    description:
      "JavaScript render eden, SPA ve dinamik web sitelerini Chromium oturum havuzuyla kazıyan stealth aktör.",
    author: "protokol-7",
    tags: ["playwright", "chromium", "spa", "javascript", "stealth"],
    inputSchema: {
      type: "object",
      title: "Playwright Browser Input",
      description: "Dinamik tarayıcı kazıma parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description: "Ziyaret edilecek dinamik web sayfası.",
          required: true,
          editor: "textfield",
          prefill: "https://news.ycombinator.com",
        },
        waitForSelector: {
          name: "waitForSelector",
          type: "string",
          title: "Beklenecek Seçici",
          description: "Sayfa render edilirken DOM'da belirmesi beklenecek CSS seçicisi.",
          editor: "textfield",
        },
        captureScreenshot: {
          name: "captureScreenshot",
          type: "boolean",
          title: "Ekran Görüntüsü Al",
          description: "Sayfanın Base64 formatında tam sayfa ekran görüntüsünü alır.",
          default: false,
          editor: "checkbox",
        },
        blockAssets: {
          name: "blockAssets",
          type: "boolean",
          title: "Gereksiz Medyayı Engelle",
          description: "Resim ve yazı tiplerini engelleyerek hızı 3 katına çıkarır.",
          default: true,
          editor: "checkbox",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        url: { type: "string", description: "Açılan web adresi" },
        title: { type: "string", description: "Sayfa başlığı" },
        content: { type: "string", description: "Dinamik olarak yüklenmiş metin" },
        markdown: { type: "string", description: "Markdown çıktısı" },
        screenshotBase64: { type: "string", description: "Base64 ekran görüntüsü (varsa)" },
      },
    },
    exampleInput: {
      targetUrl: "https://news.ycombinator.com",
      blockAssets: true,
      captureScreenshot: false,
    },
    readme: `# Playwright Headless Browser\n\nChromium tabanlı tam JavaScript yürütmeli sayfa tarayıcısı.\n\n## Yetenekler\n- Otomatik stealth koruması\n- Medya engelleme\n- Oturum havuzu yönetimi`,
    mcpTool: {
      name: "scrape_dynamic_browser",
      description:
        "Playwright Chromium kullanarak JavaScript ve SPA sitelerini render edip ayiklar.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Dinamik web adresi." },
          waitForSelector: { type: "string", description: "Beklenecek secici." },
        },
        required: ["targetUrl"],
      },
    },
  },

  "pdf-document": {
    actorType: "pdf-document",
    name: "pdf-document",
    title: "PDF Document Distiller",
    category: "DOCUMENT",
    version: "1.1.0",
    description:
      "İkili PDF belgelerinden metin akışlarını, sayfa sınırlarını, sözcük metriklerini ve metaverileri ayıklayan aktör.",
    author: "protokol-7",
    tags: ["pdf", "unpdf", "document", "distiller", "offline"],
    inputSchema: {
      type: "object",
      title: "PDF Distiller Input",
      description: "PDF metin damıtma parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "PDF URL",
          description: "İndirilecek PDF dosyasının doğrudan bağlantısı.",
          required: true,
          editor: "textfield",
          prefill: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
        maxPages: {
          name: "maxPages",
          type: "integer",
          title: "Maksimum Sayfa",
          description: "İşlenecek maksimum sayfa adedi (sınırlandırma için).",
          default: 50,
          editor: "number",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalPages: { type: "number", description: "Toplam sayfa sayısı" },
        extractedPages: { type: "number", description: "Ayıklanan sayfa sayısı" },
        fullText: { type: "string", description: "Birleştirilmiş metin" },
        totalCharacters: { type: "number", description: "Karakter sayısı" },
        metadata: { type: "object", description: "PDF yazar, başlık ve tarih metaverisi" },
      },
    },
    exampleInput: {
      targetUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      maxPages: 10,
    },
    readme: `# PDF Document Distiller\n\nPDF dosyalarından metin ve metaveri damıtır.\n\n## Çıktı\nSayfa bazlı metin, toplam karakter/kelime ve PDF metaverisi.`,
    mcpTool: {
      name: "extract_pdf_text",
      description: "Binary PDF belgelerinden saf metin ve metaveri cikarir.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "PDF baglantisi." },
          maxPages: { type: "number", description: "Maksimum sayfa sayisi." },
        },
        required: ["targetUrl"],
      },
    },
  },

  "sitemap-xml": {
    actorType: "sitemap-xml",
    name: "sitemap-xml",
    title: "XML Sitemap & Feed Harvester",
    category: "SEARCH",
    version: "1.1.0",
    description:
      "Sitemap index, urlset, .xml.gz ve RSS/Atom beslemelerini özyinelemeli olarak tarayıp URL haritası çıkaran aktör.",
    author: "protokol-7",
    tags: ["sitemap", "xml", "index", "rss", "atom", "gzip"],
    inputSchema: {
      type: "object",
      title: "Sitemap Harvester Input",
      description: "Sitemap tarama parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Sitemap URL",
          description: "Sitemap veya sitemap-index dosyasının adresi.",
          required: true,
          editor: "textfield",
          prefill: "https://apify.com/sitemap.xml",
        },
        maxUrls: {
          name: "maxUrls",
          type: "integer",
          title: "Maksimum URL",
          description: "Toplanacak en fazla URL adedi.",
          default: 5000,
          editor: "number",
        },
        recursive: {
          name: "recursive",
          type: "boolean",
          title: "Alt Sitemapleri Tara",
          description: "Sitemap index içerisindeki çocuk sitemapleri de çözer.",
          default: true,
          editor: "checkbox",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalUrls: { type: "number", description: "Bulunan toplam URL adedi" },
        urls: { type: "array", description: "URL listesi ve son güncelleme tarihleri" },
        childSitemaps: { type: "array", description: "Bağlı alt sitemap adresleri" },
      },
    },
    exampleInput: {
      targetUrl: "https://apify.com/sitemap.xml",
      maxUrls: 1000,
      recursive: true,
    },
    readme: `# XML Sitemap Harvester\n\nWeb sitelerinin tüm sitemap haritasını deşifre eder.`,
    mcpTool: {
      name: "harvest_sitemap_urls",
      description: "XML sitemap ve besleme adreslerini derinlemesine cozer.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Sitemap adresi." },
          maxUrls: { type: "number", description: "Maksimum URL." },
        },
        required: ["targetUrl"],
      },
    },
  },

  crawler: {
    actorType: "crawler",
    name: "crawler",
    title: "BFS Web Crawler",
    category: "SCRAPING",
    version: "1.0.0",
    description:
      "Genişlik öncelikli (BFS) web grafik gezgini. Derinlik, alan adı ve desen sınırlandırmaları içerir.",
    author: "protokol-7",
    tags: ["crawler", "bfs", "graph", "multipage"],
    inputSchema: {
      type: "object",
      title: "Crawler Input",
      description: "Web gezgini parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Başlangıç URL",
          description: "Taramaya başlanacak kök adres.",
          required: true,
          editor: "textfield",
          prefill: "https://example.com",
        },
        maxPages: {
          name: "maxPages",
          type: "integer",
          title: "Maksimum Sayfa",
          description: "Gezilecek toplam maksimum sayfa limiti.",
          default: 10,
          editor: "number",
        },
        maxDepth: {
          name: "maxDepth",
          type: "integer",
          title: "Maksimum Derinlik",
          description: "Bağlantı takip derinliği (1: sadece ana sayfa linkleri).",
          default: 2,
          editor: "number",
        },
        sameDomainOnly: {
          name: "sameDomainOnly",
          type: "boolean",
          title: "Sadece Aynı Alan Adı",
          description: "Dış sitelere giden bağlantıları yok sayar.",
          default: true,
          editor: "checkbox",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalCrawled: { type: "number", description: "Gezilen sayfa adedi" },
        pages: { type: "array", description: "Sayfa sonuçları dizisi" },
      },
    },
    exampleInput: {
      targetUrl: "https://example.com",
      maxPages: 5,
      maxDepth: 1,
      sameDomainOnly: true,
    },
    readme: `# BFS Web Crawler\n\nWeb sitelerini belirli kurallara göre gezerek veri toplar.`,
    mcpTool: {
      name: "crawl_website_graph",
      description: "Web sitelerini BFS algoritmasiyla cok sayfali olarak gezer.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Baslangic adresi." },
          maxPages: { type: "number", description: "Limit." },
        },
        required: ["targetUrl"],
      },
    },
  },

  "serp-search": {
    actorType: "serp-search",
    name: "serp-search",
    title: "SERP Organic Search Extractor",
    category: "SEARCH",
    version: "1.0.0",
    description:
      "Arama motoru sonuç sayfalarını ayrıştırıp sıralama, başlık, snippet ve yönlendirme bağlantılarını çözer.",
    author: "protokol-7",
    tags: ["serp", "search", "seo", "rankings"],
    inputSchema: {
      type: "object",
      title: "SERP Extractor Input",
      description: "Arama motoru ayrıştırıcı parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Arama URL veya Sorgusu",
          description: "Doğrudan SERP HTML adresi veya arama motoru URL'si.",
          required: true,
          editor: "textfield",
          prefill: "https://html.duckduckgo.com/html/?q=site:gov.tr+saglik",
        },
        maxResults: {
          name: "maxResults",
          type: "integer",
          title: "Maksimum Sonuç",
          description: "Ayıklanacak en fazla arama sonucu adedi.",
          default: 30,
          editor: "number",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        query: { type: "string", description: "Aranan terim" },
        totalResults: { type: "number", description: "Bulunan sonuç sayısı" },
        items: { type: "array", description: "Sıralı sonuç listesi" },
      },
    },
    exampleInput: {
      targetUrl: "https://html.duckduckgo.com/html/?q=protokol-7",
      maxResults: 20,
    },
    readme: `# SERP Organic Search Extractor\n\nArama sonuçlarından sıralı link ve özetleri çeker.`,
    mcpTool: {
      name: "extract_serp_results",
      description: "SERP sayfalarini ayristirip siralama ve linkleri dondurur.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Arama sayfasi adresi." },
        },
        required: ["targetUrl"],
      },
    },
  },

  "api-extractor": {
    actorType: "api-extractor",
    name: "api-extractor",
    title: "REST API Extractor & Paginator",
    category: "API",
    version: "1.0.0",
    description:
      "Sayfalamalı REST API uçlarını otomatik sayfalar, token ile kimlik doğrular ve alan projeksiyonu uygular.",
    author: "protokol-7",
    tags: ["api", "rest", "paginator", "json"],
    inputSchema: {
      type: "object",
      title: "API Extractor Input",
      description: "REST API parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "API Endpoint URL",
          description: "Sorgulanacak REST API adresi.",
          required: true,
          editor: "textfield",
          prefill: "https://api.github.com/repos/nodejs/node/releases",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        statusCode: { type: "number", description: "HTTP yanıt kodu" },
        data: { type: "object", description: "API JSON yanıtı" },
        itemCount: { type: "number", description: "Dönen kayıt sayısı" },
      },
    },
    exampleInput: {
      targetUrl: "https://api.github.com/repos/nodejs/node/releases",
    },
    readme: `# REST API Extractor\n\nRESTful API'lerden otomatik sayfalama ile yapılandırılmış veri çeker.`,
    mcpTool: {
      name: "extract_rest_api",
      description: "REST API uclarini sorgular ve sonuclari toplar.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "API adresi." },
        },
        required: ["targetUrl"],
      },
    },
  },

  "markdown-reader": {
    actorType: "markdown-reader",
    name: "markdown-reader",
    title: "Markdown Reader & LLM Distiller",
    category: "DOCUMENT",
    version: "1.1.0",
    description:
      "Web makalelerini gürültüden arındırıp LLM'lerin doğrudan tüketebileceği YAML frontmatter'lı GFM markdown üretir.",
    author: "protokol-7",
    tags: ["readability", "markdown", "llm", "tokens"],
    inputSchema: {
      type: "object",
      title: "Markdown Reader Input",
      description: "Doküman damıtma parametreleri",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef Makale URL",
          description: "Damıtılacak makale veya sayfa adresi.",
          required: true,
          editor: "textfield",
          prefill: "https://en.wikipedia.org/wiki/Internet",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        markdown: { type: "string", description: "Temiz GFM metni" },
        estimatedTokens: { type: "number", description: "Tahmini LLM token maliyeti" },
        frontmatter: { type: "object", description: "YAML başlık metaverisi" },
      },
    },
    exampleInput: {
      targetUrl: "https://en.wikipedia.org/wiki/Internet",
    },
    readme: `# Markdown Reader\n\nWeb sayfalarını LLM hazır markdown metnine dönüştürür.`,
    mcpTool: {
      name: "distill_web_to_markdown",
      description: "Web sayfalarini reklam ve menulerden arindirip temiz markdown uretir.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Sayfa adresi." },
        },
        required: ["targetUrl"],
      },
    },
  },

  "network-interceptor": {
    actorType: "network-interceptor",
    name: "network-interceptor",
    title: "Network API Interceptor",
    category: "NETWORK",
    version: "1.0.0",
    description:
      "Headless browser actor that intercepts and extracts background XHR and Fetch JSON API network responses.",
    author: "protokol-7",
    tags: ["network", "interceptor", "xhr", "fetch", "api", "json"],
    inputSchema: {
      type: "object",
      title: "Network Interceptor Input",
      description: "Background network request interception parameters",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target Page URL",
          description: "Web page address to load and monitor for network activity.",
          required: true,
          editor: "textfield",
          prefill: "https://example.com",
        },
        urlPatterns: {
          name: "urlPatterns",
          type: "array",
          title: "URL Patterns",
          description:
            "Optional wildcard URL patterns to filter captured API calls (e.g. ['*/api/*']).",
          editor: "json",
        },
        maxCapturedRequests: {
          name: "maxCapturedRequests",
          type: "integer",
          title: "Max Captured Requests",
          description: "Maximum number of responses to intercept (default: 50).",
          default: 50,
          editor: "number",
        },
        waitForNetworkIdleMs: {
          name: "waitForNetworkIdleMs",
          type: "integer",
          title: "Wait Idle (ms)",
          description: "Milliseconds to wait for network to settle after load.",
          default: 1000,
          editor: "number",
        },
        captureHeaders: {
          name: "captureHeaders",
          type: "boolean",
          title: "Capture Headers",
          description: "Whether to record response headers.",
          default: false,
          editor: "checkbox",
        },
      },
      required: ["targetUrl"],
    },
    outputSchema: {
      type: "object",
      fields: {
        pageUrl: { type: "string", description: "Target page URL" },
        totalCaptured: { type: "number", description: "Count of intercepted API responses" },
        responses: { type: "array", description: "Captured XHR/Fetch JSON responses" },
      },
    },
    exampleInput: {
      targetUrl: "https://example.com",
      urlPatterns: ["*/api/*"],
      maxCapturedRequests: 10,
    },
    readme: `# Network Interceptor\n\nIntercepts background XHR and Fetch JSON API calls during browser rendering.`,
    mcpTool: {
      name: "intercept_network_api",
      description:
        "Intercepts and captures background XHR/Fetch JSON API responses from dynamic web applications.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Target web page URL to load and monitor." },
          urlPatterns: {
            type: "array",
            items: { type: "string" },
            description: "Optional URL wildcard patterns to filter intercepted responses.",
          },
          maxCapturedRequests: {
            type: "integer",
            description: "Maximum number of JSON responses to capture (default 50).",
          },
        },
        required: ["targetUrl"],
      },
    },
  },

  "saglik-ekutuphane": {
    actorType: "saglik-ekutuphane",
    name: "saglik-ekutuphane",
    title: "Saglik Bakanligi E-Kutuphane Scraper",
    category: "HEALTHCARE",
    version: "3.0.0",
    description:
      "Scrapes Turkish Ministry of Health e-library (ekutuphane.saglik.gov.tr) for medical books, journals, guidelines, and articles with PDF text distillation.",
    author: "protokol-7",
    tags: ["healthcare", "government", "pdf", "medical", "turkey"],
    inputSchema: {
      type: "object",
      title: "Saglik E-Kutuphane Input",
      description: "E-Kütüphane query and extraction parameters",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Operation type: 'list', 'detail', or 'extract'.",
          default: "list",
          enum: ["list", "detail", "extract"],
          editor: "select",
        },
        category: {
          name: "category",
          type: "string",
          title: "Category",
          description: "Target publication category.",
          default: "all",
          enum: ["all", "books", "journals", "articles"],
          editor: "select",
        },
        publicationId: {
          name: "publicationId",
          type: "integer",
          title: "Publication ID",
          description: "Publication identifier for detail or text extraction.",
          editor: "number",
        },
        page: {
          name: "page",
          type: "integer",
          title: "Page Number",
          description: "Pagination page index.",
          default: 1,
          editor: "number",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Maximum publications to return.",
          default: 20,
          editor: "number",
        },
        downloadPdf: {
          name: "downloadPdf",
          type: "boolean",
          title: "Download PDF",
          description: "Whether to download and distill PDF text.",
          default: false,
          editor: "checkbox",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalItems: { type: "number", description: "Returned items count" },
        action: { type: "string", description: "Executed action" },
        items: { type: "array", description: "Publication items" },
        queryUrl: { type: "string", description: "Queried URL" },
      },
    },
    exampleInput: {
      action: "list",
      category: "books",
      limit: 10,
    },
    readme: `# Saglik Bakanligi E-Kutuphane Scraper\n\nScrapes ekutuphane.saglik.gov.tr for medical books, journals, guidelines, and articles. Supports listing categories, fetching metadata details, and distilling PDF text.`,
    mcpTool: {
      name: "saglik_ekutuphane",
      description:
        "Scrape Turkish Ministry of Health e-library for medical books, journals, and articles.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "detail", "extract"],
            description: "Action to perform",
          },
          category: {
            type: "string",
            enum: ["all", "books", "journals", "articles"],
            description: "Category",
          },
          publicationId: { type: "integer", description: "Publication ID" },
          page: { type: "integer", description: "Page number" },
          limit: { type: "integer", description: "Limit items" },
          downloadPdf: { type: "boolean", description: "Extract PDF text" },
        },
        required: [],
      },
    },
  },
  arxiv: {
    actorType: "arxiv",
    name: "arxiv",
    title: "arXiv Research Paper & Metadata Extractor",
    category: "API",
    version: "1.0.0",
    description:
      "Queries arXiv Export API (Atom 1.0) for scientific preprints, extracts metadata, abstracts, and optional PDF text.",
    author: "Protokol-7",
    tags: ["arxiv", "preprints", "academic", "papers", "research", "pdf", "llm-data"],
    inputSchema: {
      type: "object",
      title: "arXiv Query Options",
      description: "Parameters for querying arXiv Export API",
      properties: {
        searchQuery: {
          name: "searchQuery",
          type: "string",
          title: "Search Query",
          description:
            "arXiv search query expression (e.g. 'cat:cs.AI AND ti:transformer', 'au:lecun').",
          editor: "textfield",
        },
        idList: {
          name: "idList",
          type: "array",
          title: "arXiv ID List",
          description: "List of arXiv IDs to query (e.g. ['2301.07067', '1706.03762']).",
          editor: "json",
        },
        start: {
          name: "start",
          type: "integer",
          title: "Start Index",
          description: "Zero-based offset for pagination.",
          default: 0,
          editor: "number",
        },
        maxResults: {
          name: "maxResults",
          type: "integer",
          title: "Max Results",
          description: "Maximum number of papers to retrieve (default 10).",
          default: 10,
          editor: "number",
        },
        sortBy: {
          name: "sortBy",
          type: "string",
          title: "Sort By",
          description: "Sorting criteria.",
          default: "relevance",
          enum: ["relevance", "lastUpdatedDate", "submittedDate"],
          editor: "select",
        },
        sortOrder: {
          name: "sortOrder",
          type: "string",
          title: "Sort Order",
          description: "Order of sorted results.",
          default: "descending",
          enum: ["ascending", "descending"],
          editor: "select",
        },
        downloadPdf: {
          name: "downloadPdf",
          type: "boolean",
          title: "Download & Extract PDF Text",
          description: "If true, downloads preprint PDFs and extracts full text using unpdf.",
          default: false,
          editor: "checkbox",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalResults: {
          type: "number",
          description: "Total matching results count in arXiv index",
        },
        papers: { type: "array", description: "Extracted arXiv paper items" },
        queryUrl: { type: "string", description: "Constructed arXiv API query URL" },
      },
    },
    exampleInput: {
      searchQuery: "cat:cs.AI AND ti:diffusion",
      maxResults: 5,
      downloadPdf: false,
    },
    readme: `# arXiv Paper Extractor\n\nQueries arXiv.org Export Query API for academic preprints, parses Atom XML, and extracts paper metadata, authors, abstracts, and optional PDF text streams.`,
    mcpTool: {
      name: "arxiv_query",
      description:
        "Query arXiv.org Export API for scientific papers, authors, abstracts, and metadata.",
      inputSchema: {
        type: "object",
        properties: {
          searchQuery: {
            type: "string",
            description: "Search query expression (e.g. 'cat:cs.AI AND ti:transformer')",
          },
          idList: { type: "array", description: "Array of arXiv IDs" },
          maxResults: { type: "integer", description: "Max results to return (default 10)" },
          downloadPdf: {
            type: "boolean",
            description: "Whether to download PDF and extract full text",
          },
        },
        required: [],
      },
    },
  },
  wikimedia: {
    actorType: "wikimedia",
    name: "wikimedia",
    title: "Wikimedia REST Extractor",
    category: "API",
    version: "1.0.0",
    description:
      "Queries official Wikimedia REST API v1 for clean encyclopedic summaries, full articles as GFM markdown, and page search.",
    author: "protokol-7",
    tags: ["wikipedia", "wikimedia", "encyclopedic", "llm-data", "markdown"],
    inputSchema: {
      type: "object",
      title: "Wikimedia Extractor Input",
      description: "Wikimedia REST API query parameters",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "Page Title",
          description: "Canonical title of the Wikipedia page.",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description: "Two-letter language code (e.g. 'en', 'tr', 'de'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: summary, article (HTML-to-markdown), or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword search expression for page discovery.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search results to return.",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed action" },
        items: { type: "array", description: "Extracted article and summary items" },
        queryUrl: { type: "string", description: "Constructed Wikimedia endpoint URL" },
      },
    },
    exampleInput: {
      title: "Alan Turing",
      lang: "en",
      action: "summary",
    },
    readme: `# Wikimedia REST Extractor\n\nRetrieves factual, peer-reviewed encyclopedic knowledge from official Wikimedia REST API endpoints. Supports clean summary extracts, full Parsoid HTML converted to GFM markdown, and search discovery across all language editions.`,
    mcpTool: {
      name: "wikimedia_query",
      description:
        "Query Wikipedia/Wikimedia REST API for factual summaries, articles as markdown, or page search.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Page title (e.g. 'Alan Turing')" },
          lang: { type: "string", description: "Language code (e.g. 'en', 'tr')" },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Action type",
          },
          query: { type: "string", description: "Search query for discovery" },
          limit: { type: "integer", description: "Max results count" },
        },
        required: [],
      },
    },
  },
  openalex: {
    actorType: "openalex",
    name: "openalex",
    title: "OpenAlex Scholarly Knowledge Extractor",
    category: "API",
    version: "1.0.0",
    description:
      "Queries official OpenAlex API for scholarly works, reconstructs abstracts from inverted indexes, and extracts citation metrics.",
    author: "protokol-7",
    tags: ["openalex", "academic", "papers", "science", "llm-data"],
    inputSchema: {
      type: "object",
      title: "OpenAlex Extractor Input",
      description: "OpenAlex REST API query parameters",
      properties: {
        searchQuery: {
          name: "searchQuery",
          type: "string",
          title: "Search Query",
          description: "Keyword search expression across titles and abstracts.",
          editor: "textfield",
        },
        doi: {
          name: "doi",
          type: "string",
          title: "DOI",
          description: "Digital Object Identifier for direct lookup.",
          editor: "textfield",
        },
        minCitations: {
          name: "minCitations",
          type: "integer",
          title: "Minimum Citations",
          description: "Quality threshold: filter works cited at least this many times.",
          editor: "number",
        },
        isOpenAccess: {
          name: "isOpenAccess",
          type: "boolean",
          title: "Open Access Only",
          description: "Filter works with freely accessible full texts.",
          editor: "checkbox",
        },
        publicationYear: {
          name: "publicationYear",
          type: "integer",
          title: "Publication Year",
          description: "Filter by exact publication year.",
          editor: "number",
        },
        perPage: {
          name: "perPage",
          type: "integer",
          title: "Results Per Page",
          description: "Number of works to return (1-200, default 10).",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalResults: { type: "number", description: "Total matching works count" },
        works: { type: "array", description: "Extracted scholarly works" },
        queryUrl: { type: "string", description: "Constructed OpenAlex endpoint URL" },
      },
    },
    exampleInput: {
      searchQuery: "transformer attention mechanism",
      minCitations: 10,
      perPage: 5,
    },
    readme: `# OpenAlex Scholarly Knowledge Extractor\n\nQueries OpenAlex global scientific catalog (250M+ works). Reconstructs full abstracts from inverted indexes, filters by citation impact, and extracts author affiliations and open-access links.`,
    mcpTool: {
      name: "openalex_query",
      description:
        "Query OpenAlex API for scholarly papers, abstracts reconstructed from inverted index, and citation metrics.",
      inputSchema: {
        type: "object",
        properties: {
          searchQuery: { type: "string", description: "Search query" },
          doi: { type: "string", description: "Digital Object Identifier" },
          minCitations: { type: "integer", description: "Minimum citation count" },
          isOpenAccess: { type: "boolean", description: "Filter for open access works" },
          perPage: { type: "integer", description: "Results per page" },
        },
        required: [],
      },
    },
  },
  "stack-exchange": {
    actorType: "stack-exchange",
    name: "stack-exchange",
    title: "Stack Exchange Reasoning Extractor",
    category: "API",
    version: "1.0.0",
    description:
      "Queries official Stack Exchange API v2.3 for verified algorithmic and technical Q&A pairs, filtered by score and acceptance.",
    author: "protokol-7",
    tags: ["stack-exchange", "stackoverflow", "instruction-tuning", "reasoning", "llm-data"],
    inputSchema: {
      type: "object",
      title: "Stack Exchange Extractor Input",
      description: "Stack Exchange API query parameters",
      properties: {
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search keywords or problem description.",
          editor: "textfield",
        },
        site: {
          name: "site",
          type: "string",
          title: "Network Site",
          description:
            "Target site: stackoverflow, math, physics, serverfault, askubuntu, cs, stats.",
          default: "stackoverflow",
          editor: "textfield",
        },
        tagged: {
          name: "tagged",
          type: "string",
          title: "Tags",
          description: "Semicolon-delimited tag filter (e.g. 'python;algorithms').",
          editor: "textfield",
        },
        minScore: {
          name: "minScore",
          type: "integer",
          title: "Minimum Score",
          description: "Quality threshold: minimum question vote score.",
          default: 3,
          editor: "number",
        },
        acceptedOnly: {
          name: "acceptedOnly",
          type: "boolean",
          title: "Accepted Answer Only",
          description: "Filter questions that have a solution accepted by the author.",
          default: true,
          editor: "checkbox",
        },
        pageSize: {
          name: "pageSize",
          type: "integer",
          title: "Page Size",
          description: "Number of questions to return (default 10).",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        site: { type: "string", description: "Target Stack Exchange site" },
        totalItems: { type: "number", description: "Retrieved question items count" },
        questions: {
          type: "array",
          description: "Extracted question items with answers and instruction pairs",
        },
        queryUrl: { type: "string", description: "Constructed API query URL" },
      },
    },
    exampleInput: {
      query: "quicksort",
      site: "stackoverflow",
      minScore: 5,
      acceptedOnly: true,
    },
    readme: `# Stack Exchange Reasoning Extractor\n\nQueries Stack Exchange network API v2.3 for community-verified technical and algorithmic Q&A pairs. Formats results as instruction-tuning (prompt, completion) pairs with score thresholds.`,
    mcpTool: {
      name: "stack_exchange_query",
      description:
        "Query Stack Exchange API v2.3 for community-verified technical and algorithmic Q&A pairs.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Problem or search query" },
          site: {
            type: "string",
            description: "Target network site (e.g. 'stackoverflow', 'math')",
          },
          tagged: { type: "string", description: "Tag filter" },
          minScore: { type: "integer", description: "Minimum score filter" },
          acceptedOnly: { type: "boolean", description: "Filter for accepted answers" },
          pageSize: { type: "integer", description: "Number of results" },
        },
        required: [],
      },
    },
  },
  gutenberg: {
    actorType: "gutenberg",
    name: "gutenberg",
    title: "Project Gutenberg Classic Literature Extractor",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries Gutendex API for 70,000+ public domain classic books, downloads UTF-8 plain text, and strips Gutenberg licensing boilerplates.",
    author: "protokol-7",
    tags: ["gutenberg", "books", "literature", "philosophy", "llm-data"],
    inputSchema: {
      type: "object",
      title: "Gutenberg Extractor Input",
      description: "Project Gutenberg catalog search and text extraction parameters",
      properties: {
        searchQuery: {
          name: "searchQuery",
          type: "string",
          title: "Search Query",
          description: "Search keywords matching book titles or authors.",
          editor: "textfield",
        },
        topic: {
          name: "topic",
          type: "string",
          title: "Topic / Subject",
          description: "Subject category (e.g. 'philosophy', 'science', 'history').",
          editor: "textfield",
        },
        bookId: {
          name: "bookId",
          type: "integer",
          title: "Book ID",
          description: "Direct Project Gutenberg book identifier.",
          editor: "number",
        },
        downloadText: {
          name: "downloadText",
          type: "boolean",
          title: "Download Full Text",
          description: "If true, downloads and strips license headers from plain text.",
          default: false,
          editor: "checkbox",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalCount: { type: "number", description: "Total matching books count" },
        books: { type: "array", description: "Extracted book items" },
        queryUrl: { type: "string", description: "Constructed API query URL" },
      },
    },
    exampleInput: {
      searchQuery: "pride and prejudice",
      downloadText: false,
    },
    readme: `# Project Gutenberg Extractor\n\nQueries Gutendex catalog of 70,000+ classic public domain books. When downloadText is true, retrieves raw UTF-8 streams and automatically strips Project Gutenberg boilerplate licensing headers and footers.`,
    mcpTool: {
      name: "gutenberg_query",
      description:
        "Query Project Gutenberg catalog for public domain classic books and unadulterated text streams.",
      inputSchema: {
        type: "object",
        properties: {
          searchQuery: { type: "string", description: "Search query" },
          topic: { type: "string", description: "Subject or topic" },
          bookId: { type: "integer", description: "Direct book ID" },
          downloadText: { type: "boolean", description: "Whether to download and clean full text" },
        },
        required: [],
      },
    },
  },
  "europe-pmc": {
    actorType: "europe-pmc",
    name: "europe-pmc",
    title: "Europe PMC Biomedical Literature Extractor",
    category: "API",
    version: "1.0.0",
    description:
      "Queries Europe PMC and PubMed Central REST API for peer-reviewed biomedical literature, abstracts, and open access full-text links.",
    author: "protokol-7",
    tags: ["europe-pmc", "pubmed", "biomedical", "medicine", "llm-data"],
    inputSchema: {
      type: "object",
      title: "Europe PMC Extractor Input",
      description: "Europe PMC REST search parameters",
      properties: {
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Biomedical search expression (e.g. 'CRISPR Cas9').",
          editor: "textfield",
        },
        openAccessOnly: {
          name: "openAccessOnly",
          type: "boolean",
          title: "Open Access Only",
          description: "Filter articles with freely accessible full texts.",
          default: false,
          editor: "checkbox",
        },
        pageSize: {
          name: "pageSize",
          type: "integer",
          title: "Page Size",
          description: "Number of articles to return (default 10).",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        hitCount: { type: "number", description: "Total matching articles count" },
        articles: { type: "array", description: "Extracted article items" },
        queryUrl: { type: "string", description: "Constructed API query URL" },
      },
    },
    exampleInput: {
      query: "cancer immunotherapy",
      openAccessOnly: true,
      pageSize: 5,
    },
    readme: `# Europe PMC Biomedical Literature Extractor\n\nQueries Europe PMC's 45M+ biomedical and life sciences research records, retrieving normalized abstracts, publication metrics, and PubMed Central open-access full-text URLs.`,
    mcpTool: {
      name: "europe_pmc_query",
      description:
        "Query Europe PMC REST API for peer-reviewed biomedical research, abstracts, and open access links.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          openAccessOnly: { type: "boolean", description: "Filter for open access articles" },
          pageSize: { type: "integer", description: "Results count" },
        },
        required: [],
      },
    },
  },
  "ietf-rfc": {
    actorType: "ietf-rfc",
    name: "ietf-rfc",
    title: "IETF RFC Internet Standards Extractor",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries IETF RFC Editor and Datatracker for official Internet standards, extracts metadata, and cleans plain text RFC streams.",
    author: "protokol-7",
    tags: ["ietf", "rfc", "networking", "protocols", "standards", "llm-data"],
    inputSchema: {
      type: "object",
      title: "IETF RFC Extractor Input",
      description: "IETF RFC and Datatracker query parameters",
      properties: {
        rfcNumber: {
          name: "rfcNumber",
          type: "integer",
          title: "RFC Number",
          description: "Direct RFC number to fetch (e.g. 7540 for HTTP/2, 8446 for TLS 1.3).",
          editor: "number",
        },
        query: {
          name: "query",
          type: "string",
          title: "Title / Keyword Query",
          description: "Search expression matching Datatracker document titles.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search results to return.",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalResults: { type: "number", description: "Total returned RFC items count" },
        rfcs: { type: "array", description: "Extracted RFC items with cleaned text" },
        queryUrl: { type: "string", description: "Constructed API query URL" },
      },
    },
    exampleInput: {
      rfcNumber: 7540,
    },
    readme: `# IETF RFC Internet Standards Extractor\n\nRetrieves official RFC documents defining Internet protocols and cryptography. Automatically cleans form-feed page markers and running page headers to produce clean sequential technical text.`,
    mcpTool: {
      name: "ietf_rfc_query",
      description:
        "Query IETF RFC standards and retrieve clean text specifications without page headers.",
      inputSchema: {
        type: "object",
        properties: {
          rfcNumber: { type: "integer", description: "RFC number (e.g. 7540)" },
          query: { type: "string", description: "Keyword search expression" },
          limit: { type: "integer", description: "Max results count" },
        },
        required: [],
      },
    },
  },
  "ktb-ekitap": {
    actorType: "ktb-ekitap",
    name: "ktb-ekitap",
    title: "Kultur ve Turizm Bakanligi E-Kitap Extractor",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Scrapes Turkish Ministry of Culture and Tourism e-book portal (ekitap.ktb.gov.tr) for public e-books across literary, historical, and cultural categories with LLM text sanitization.",
    author: "protokol-7",
    tags: ["culture", "ebooks", "government", "pdf", "turkey", "llm-data"],
    inputSchema: {
      type: "object",
      title: "KTB E-Kitap Input",
      description: "KTB e-book query and extraction parameters",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Operation type: 'list', 'detail', or 'extract'.",
          default: "list",
          enum: ["list", "detail", "extract"],
          editor: "select",
        },
        category: {
          name: "category",
          type: "string",
          title: "Category",
          description: "Target e-book category.",
          default: "son-eklenen",
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
          editor: "select",
        },
        bookId: {
          name: "bookId",
          type: "integer",
          title: "Book ID",
          description: "Target book numeric identifier.",
          editor: "number",
        },
        detailUrl: {
          name: "detailUrl",
          type: "string",
          title: "Detail URL",
          description: "Target book detail URL.",
          editor: "textfield",
        },
        page: {
          name: "page",
          type: "integer",
          title: "Page Number",
          description: "Pagination page index.",
          default: 1,
          editor: "number",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Maximum books to return.",
          default: 20,
          editor: "number",
        },
        downloadPdf: {
          name: "downloadPdf",
          type: "boolean",
          title: "Download PDF",
          description: "Whether to download and distill PDF text.",
          default: false,
          editor: "checkbox",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalItems: { type: "number", description: "Returned items count" },
        action: { type: "string", description: "Executed action" },
        items: { type: "array", description: "Book items" },
        queryUrl: { type: "string", description: "Queried URL" },
      },
    },
    exampleInput: {
      action: "list",
      category: "edebiyat",
      limit: 10,
    },
    readme: `# Kultur ve Turizm Bakanligi E-Kitap Extractor\n\nScrapes ekitap.ktb.gov.tr for literary, cultural, and historical public domain e-books. Handles anti-hotlinking Referer headers and strips page headers/footers to produce clean LLM-ready markdown.`,
    mcpTool: {
      name: "ktb_ekitap",
      description:
        "Scrape Turkish Ministry of Culture and Tourism e-book portal for books and literature.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "detail", "extract"],
            description: "Action to perform",
          },
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
            description: "Category",
          },
          bookId: { type: "integer", description: "Book ID" },
          detailUrl: { type: "string", description: "Book detail URL" },
          page: { type: "integer", description: "Page number" },
          limit: { type: "integer", description: "Limit items" },
          downloadPdf: { type: "boolean", description: "Extract PDF text" },
        },
        required: [],
      },
    },
  },
  "document-extractor": {
    actorType: "document-extractor",
    name: "document-extractor",
    title: "Office Document & Tabular Extractor",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Extracts structured text, tables, records, and metadata from DOCX, XLSX, CSV, TSV, and plain text formats with zero external dependencies.",
    author: "protokol-7",
    tags: ["docx", "xlsx", "csv", "tsv", "excel", "word", "tables", "documents"],
    inputSchema: {
      type: "object",
      title: "Document Extractor Input",
      description: "Parameters for extracting office documents and tabular datasets",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Remote document URL (HTTP/HTTPS)",
          editor: "textfield",
        },
        documentBase64: {
          name: "documentBase64",
          type: "string",
          title: "Document Base64",
          description: "Base64-encoded document binary payload",
          editor: "textarea",
        },
        format: {
          name: "format",
          type: "string",
          title: "Document Format",
          description: "Explicit document format (docx, xlsx, csv, tsv, txt, json, yaml)",
          enum: ["docx", "xlsx", "csv", "tsv", "txt", "json", "yaml"],
          editor: "select",
        },
        maxRows: {
          name: "maxRows",
          type: "integer",
          title: "Max Rows",
          description: "Maximum number of rows to extract from spreadsheets or CSVs",
          editor: "number",
        },
        delimiter: {
          name: "delimiter",
          type: "string",
          title: "Delimiter",
          description: "Custom delimiter for tabular files (e.g. ',', ';', '\\t', '|')",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        format: { type: "string", description: "Resolved document format" },
        fullText: { type: "string", description: "Extracted document text or Markdown table" },
        totalCharacters: { type: "integer", description: "Total character count" },
        records: { type: "array", description: "Extracted tabular records as objects" },
        sheets: { type: "array", description: "Parsed spreadsheet sheets" },
        metadata: { type: "object", description: "Document metadata" },
      },
    },
    exampleInput: {
      targetUrl: "https://example.com/data/report.docx",
      format: "docx",
    },
    readme: `# Office Document & Tabular Extractor\n\nExtracts clean text, paragraphs, spreadsheets, and tables from Word (.docx), Excel (.xlsx), CSV, and TSV files. Converts tabular datasets to structured JSON records and GFM Markdown tables with zero external dependencies.`,
    mcpTool: {
      name: "extract_document",
      description:
        "Extract text, tables, and records from DOCX, XLSX, CSV, TSV, or plain text files.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Remote document URL" },
          documentBase64: { type: "string", description: "Base64 document binary" },
          format: {
            type: "string",
            enum: ["docx", "xlsx", "csv", "tsv", "txt", "json", "yaml"],
            description: "Explicit document format",
          },
          maxRows: { type: "integer", description: "Max rows for tabular extraction" },
          delimiter: { type: "string", description: "Custom CSV delimiter" },
        },
        required: [],
      },
    },
  },
  "archive-extractor": {
    actorType: "archive-extractor",
    name: "archive-extractor",
    title: "Compressed Archive Extractor",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Extracts and inspects compressed archives (ZIP, TAR, GZ, RAR) with strict Zip Slip path traversal and Zip Bomb volumetric guards.",
    author: "protokol-7",
    tags: ["archive", "zip", "tar", "gzip", "rar", "compression", "security"],
    inputSchema: {
      type: "object",
      title: "Archive Extractor Input",
      description: "Parameters for extracting and inspecting compressed archives",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Remote archive URL (HTTP/HTTPS)",
          editor: "textfield",
        },
        archiveBase64: {
          name: "archiveBase64",
          type: "string",
          title: "Archive Base64",
          description: "Base64-encoded compressed archive binary payload",
          editor: "textarea",
        },
        format: {
          name: "format",
          type: "string",
          title: "Archive Format",
          description: "Explicit archive format (zip, tar, tar.gz, gz, rar)",
          enum: ["zip", "tar", "tar.gz", "gz", "rar"],
          editor: "select",
        },
        maxFiles: {
          name: "maxFiles",
          type: "integer",
          title: "Max Files",
          description: "Maximum number of files allowed in archive before aborting",
          editor: "number",
        },
        maxTotalBytes: {
          name: "maxTotalBytes",
          type: "integer",
          title: "Max Total Bytes",
          description: "Maximum uncompressed total byte threshold (Zip Bomb defense)",
          editor: "number",
        },
        extractTextPreviews: {
          name: "extractTextPreviews",
          type: "boolean",
          title: "Extract Text Previews",
          description: "Whether to extract text preview snippets for textual entries",
          editor: "checkbox",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        format: { type: "string", description: "Resolved archive format" },
        totalFiles: { type: "integer", description: "Total extracted file count" },
        totalUncompressedBytes: {
          type: "integer",
          description: "Total uncompressed size in bytes",
        },
        entries: { type: "array", description: "List of extracted file entries and hashes" },
        securityCheckPassed: { type: "boolean", description: "Whether security barriers passed" },
      },
    },
    exampleInput: {
      targetUrl: "https://example.com/dataset.zip",
      extractTextPreviews: true,
    },
    readme: `# Compressed Archive Extractor\n\nSafely extracts ZIP, TAR, GZ, and TGZ archives with strict defenses against Zip Slip path traversal and decompression bomb exploits.`,
    mcpTool: {
      name: "extract_archive",
      description:
        "Inspect and extract compressed archives (ZIP, TAR, GZ, RAR) with Zip Slip and Zip Bomb security barriers.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Remote archive URL" },
          archiveBase64: { type: "string", description: "Base64 archive binary" },
          format: {
            type: "string",
            enum: ["zip", "tar", "tar.gz", "gz", "rar"],
            description: "Explicit archive format",
          },
          maxFiles: { type: "integer", description: "Maximum files limit" },
          maxTotalBytes: { type: "integer", description: "Maximum uncompressed size limit" },
          extractTextPreviews: { type: "boolean", description: "Generate text previews" },
        },
        required: [],
      },
    },
  },
};
