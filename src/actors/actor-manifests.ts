/**
 * Actor manifests, schemas, and metadata definitions for Protokol-7 Store.
 */

import type { ActorType } from "../api/types";

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
  properties?: Record<string, unknown>;
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
    version: "1.2.0",
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
        multiColumnOptions: {
          name: "multiColumnOptions",
          type: "object",
          title: "Cok Sutun Secenekleri",
          description:
            "Etkinlestirildiginde metin ogelerini koordinat tabanli sutun siralamasiyla yeniden duzenler ve tekrarlayan ustbilgi/altbilgileri sizer.",
          properties: {
            enabled: {
              type: "boolean",
              description: "Cok sutun cozucuyu etkinlestirir.",
              default: false,
            },
            minColumnGap: {
              type: "number",
              description: "Sutun arasi minimum bosluk (PDF koordinat birimi).",
              default: 20,
            },
            expectedColumns: {
              type: "integer",
              description:
                "Beklenen sutun sayisi (1, 2 veya 3). Belirtilmezse otomatik tespit edilir.",
            },
          },
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
          multiColumnOptions: {
            type: "object",
            description: "Cok sutun cozucu secenekleri.",
            properties: {
              enabled: { type: "boolean", description: "Cok sutun cozucuyu etkinlestirir." },
              minColumnGap: { type: "number", description: "Sutun oluğu minimum genisligi (pt)." },
              expectedColumns: {
                type: "integer",
                description: "Beklenen sutun sayisi (2 veya 3).",
              },
            },
          },
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
  wikipedia: {
    actorType: "wikipedia",
    name: "wikipedia",
    title: "Wikipedia REST Extractor",
    category: "API",
    version: "1.0.0",
    description:
      "Queries official Wikimedia REST API v1 for clean encyclopedic summaries, full articles as GFM markdown, and page search.",
    author: "protokol-7",
    tags: ["wikipedia", "wikimedia", "encyclopedic", "llm-data", "markdown"],
    inputSchema: {
      type: "object",
      title: "Wikipedia Extractor Input",
      description: "Wikipedia REST API query parameters",
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
    readme: `# Wikipedia REST Extractor\n\nRetrieves factual, peer-reviewed encyclopedic knowledge from official Wikimedia REST API endpoints. Supports clean summary extracts, full Parsoid HTML converted to GFM markdown, and search discovery across all language editions.`,
    mcpTool: {
      name: "wikipedia_query",
      description:
        "Query Wikipedia / Wikimedia REST API for factual summaries, articles as markdown, or page search.",
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

  "epub-extractor": {
    actorType: "epub-extractor",
    name: "epub-extractor",
    title: "EPUB E-Book & Publication Extractor",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "EPUB 2 ve EPUB 3 e-kitap ve süreli yayın arşivlerini sıfır bağımlılıkla açar, OPF Dublin Core metadatalarını çözer, hiyerarşik içindekiler tablosunu oluşturur ve bölümleri GFM Markdown formatına dönüştürür.",
    author: "protokol-7",
    tags: ["epub", "ebook", "publication", "periodical", "markdown", "book"],
    inputSchema: {
      type: "object",
      title: "EPUB Extractor Input",
      description: "EPUB ayrıştırma girdisi",
      properties: {
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "EPUB URL",
          description: "İndirilecek uzaktaki EPUB dosyasının doğrudan web adresi",
          editor: "textfield",
        },
        epubBase64: {
          name: "epubBase64",
          type: "string",
          title: "EPUB Base64",
          description: "Base64 kodlanmış EPUB ikili verisi",
          editor: "textarea",
        },
        includeTableOfContents: {
          name: "includeTableOfContents",
          type: "boolean",
          title: "İçindekiler Ağacını Ekle",
          description: "Hiyerarşik içindekiler tablosunu (TOC) ayrıştırıp sonuca dahil et",
          default: true,
          editor: "checkbox",
        },
        maxChapters: {
          name: "maxChapters",
          type: "integer",
          title: "Maksimum Bölüm Adedi",
          description: "Ayıklanacak en fazla bölüm sayısı",
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        metadata: { type: "object", description: "Yayın ve kitap üstverileri (Dublin Core)" },
        tableOfContents: { type: "array", description: "Hiyerarşik içindekiler tablosu" },
        chapters: { type: "array", description: "Sıralı GFM Markdown bölümleri" },
        fullText: { type: "string", description: "Tüm bölümlerin birleştirilmiş tam metni" },
        totalChapters: { type: "integer", description: "Ayrıştırılan toplam bölüm sayısı" },
        totalWords: { type: "integer", description: "Toplam kelime sayısı" },
        totalCharacters: { type: "integer", description: "Toplam karakter sayısı" },
      },
    },
    exampleInput: {
      targetUrl: "https://example.com/sample-book.epub",
      includeTableOfContents: true,
    },
    readme: `# EPUB E-Book & Publication Extractor\n\nEPUB 2 ve EPUB 3 e-kitaplarını açarak Dublin Core metadatalarını, içindekiler ağacını ve bölümleri kronolojik sırada temiz Markdown'a dönüştürür.`,
    mcpTool: {
      name: "extract_epub",
      description:
        "Extract e-books and periodicals from EPUB 2/3 archives with Dublin Core metadata, hierarchical TOC, and spine-ordered GFM Markdown.",
      inputSchema: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "Remote EPUB URL" },
          epubBase64: { type: "string", description: "Base64-encoded EPUB binary" },
          includeTableOfContents: {
            type: "boolean",
            description: "Whether to extract hierarchical table of contents",
          },
          maxChapters: { type: "integer", description: "Maximum chapters to extract" },
        },
        required: [],
      },
    },
  },

  dergipark: {
    actorType: "dergipark",
    name: "dergipark",
    title: "DergiPark Academic Journal Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "DergiPark OAI-PMH 2.0 uzerinden Turkiye akademik hakemli dergilerinden Dublin Core metadata, yazar, ozet, anahtar kelime ve PDF baglantisi cekan aktor.",
    author: "protokol-7",
    tags: ["oai-pmh", "dergipark", "academic", "periodical", "xml", "turkey"],
    inputSchema: {
      type: "object",
      title: "DergiPark Harvester Input",
      description: "DergiPark OAI-PMH sorgu parametreleri",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Eylem",
          description: "'search' (ListRecords), 'record' (GetRecord), 'list-sets' (SetList).",
          enum: ["search", "record", "list-sets"],
          default: "search",
          editor: "select",
        },
        identifier: {
          name: "identifier",
          type: "string",
          title: "OAI Tanımlayıcı",
          description: "Tek kayit cekmek icin OAI-PMH identifier (action='record').",
          editor: "textfield",
        },
        set: {
          name: "set",
          type: "string",
          title: "Set Tanımlayıcı",
          description: "OAI-PMH set kodu, ornegin 'tbd:dergi:1234'.",
          editor: "textfield",
        },
        keyword: {
          name: "keyword",
          type: "string",
          title: "Anahtar Kelime",
          description: "Baslik ve ozet uzerinde istemci tarafli kelime filtresi.",
          editor: "textfield",
        },
        maxRecords: {
          name: "maxRecords",
          type: "integer",
          title: "Maksimum Kayit",
          description: "Dondurecek maksimum makale sayisi.",
          default: 20,
          editor: "number",
        },
        resumptionToken: {
          name: "resumptionToken",
          type: "string",
          title: "Devam Jetonu",
          description: "OAI-PMH sayfalama icin bir onceki yanittaki resumptionToken.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Gerceklestirilen eylem" },
        totalItems: { type: "number", description: "Dondurdulen kayit sayisi" },
        articles: { type: "array", description: "Makale metadata dizisi" },
        resumptionToken: { type: "string", description: "Sonraki sayfa icin devam jetonu" },
      },
    },
    exampleInput: {
      action: "search",
      keyword: "makine ogrenimi",
      maxRecords: 10,
    },
    readme: `# DergiPark Academic Journal Harvester\n\nDergiPark OAI-PMH servisi uzerinden Turkiye akademik dergilerine erisir.`,
    mcpTool: {
      name: "query_dergipark",
      description:
        "Harvests article metadata from DergiPark Turkish academic journals via OAI-PMH 2.0 Dublin Core.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["search", "record", "list-sets"],
            description: "OAI-PMH verb: search=ListRecords, record=GetRecord, list-sets=ListSets.",
          },
          identifier: { type: "string", description: "OAI-PMH record identifier (action=record)." },
          set: { type: "string", description: "OAI-PMH set specifier (e.g. tbd:dergi:1234)." },
          keyword: { type: "string", description: "Client-side keyword filter on title/abstract." },
          maxRecords: { type: "integer", description: "Maximum records to return (default 20)." },
          resumptionToken: {
            type: "string",
            description: "Pagination cursor from previous response.",
          },
        },
        required: [],
      },
    },
  },

  "internet-archive": {
    actorType: "internet-archive",
    name: "internet-archive",
    title: "Internet Archive Item Fetcher",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "archive.org uzerindeki kamuya acik kitap ve dergi koleksiyonlarina item metadata JSON API, gelismis arama ve DjVuTXT / Abbyy GZ OCR metin akisi erisimi saglayan aktor.",
    author: "protokol-7",
    tags: ["internet-archive", "archive.org", "oai", "book", "djvu", "ocr", "public-domain"],
    inputSchema: {
      type: "object",
      title: "Internet Archive Input",
      description: "archive.org sorgu parametreleri",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Eylem",
          description: "'metadata' (item JSON), 'search' (Scraping API), 'text' (OCR metin).",
          enum: ["metadata", "search", "text"],
          default: "metadata",
          editor: "select",
        },
        identifier: {
          name: "identifier",
          type: "string",
          title: "Item Tanımlayıcı",
          description: "archive.org item identifier, ornegin 'gutenberg99'.",
          editor: "textfield",
          prefill: "encyclopediabritan28chisrich",
        },
        searchQuery: {
          name: "searchQuery",
          type: "string",
          title: "Arama Terimi",
          description: "Tam metin arama sorgusu (action='search').",
          editor: "textfield",
        },
        mediaType: {
          name: "mediaType",
          type: "string",
          title: "Medya Tipi",
          description: "Arama filtresi: 'texts', 'audio', 'movies' vb. (varsayilan: texts).",
          default: "texts",
          editor: "textfield",
        },
        maxResults: {
          name: "maxResults",
          type: "integer",
          title: "Maksimum Sonuc",
          description: "Arama sonuc limiti (varsayilan: 20).",
          default: 20,
          editor: "number",
        },
        maxTextChars: {
          name: "maxTextChars",
          type: "integer",
          title: "Maksimum Karakter",
          description: "action='text' icin OCR metin cikisi maksimum karakter sayisi.",
          default: 100000,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Gerceklestirilen eylem" },
        totalItems: { type: "number", description: "Dondurdulen item sayisi" },
        items: { type: "array", description: "Archive item listesi" },
        extractedText: { type: "string", description: "OCR metin cikisi (action=text)" },
      },
    },
    exampleInput: {
      action: "metadata",
      identifier: "encyclopediabritan28chisrich",
    },
    readme: `# Internet Archive Item Fetcher\n\narchive.org kamuya acik koleksiyonlardan metadata, arama ve OCR metin erisimi saglar.`,
    mcpTool: {
      name: "query_internet_archive",
      description:
        "Fetches item metadata, search results, or OCR text streams from the Internet Archive (archive.org).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["metadata", "search", "text"],
            description:
              "Action: metadata=item JSON, search=full-text search, text=OCR extraction.",
          },
          identifier: {
            type: "string",
            description: "Archive.org item identifier (required for metadata/text).",
          },
          searchQuery: { type: "string", description: "Search terms (action=search)." },
          mediaType: {
            type: "string",
            description: "Media type filter for search: texts, audio, movies (default: texts).",
          },
          maxResults: { type: "integer", description: "Max search results (default 20)." },
          maxTextChars: {
            type: "integer",
            description: "Max characters from OCR text stream (default 100000).",
          },
        },
        required: [],
      },
    },
  },
  "clinical-trials": {
    actorType: "clinical-trials",
    name: "clinical-trials",
    title: "ClinicalTrials.gov Protocol Harvester",
    category: "HEALTHCARE",
    version: "1.0.0",
    description:
      "Queries ClinicalTrials.gov API v2 for trial protocols, eligibility criteria, interventions, and outcomes.",
    author: "Protokol-7 Team",
    tags: ["clinical-trials", "nih", "medicine", "protocols", "biomedical"],
    inputSchema: {
      type: "object",
      title: "ClinicalTrials.gov Input Schema",
      description: "Search filters and pagination for clinical trial protocols",
      properties: {
        query: {
          name: "query",
          type: "string",
          title: "Search Term",
          description: "General keyword or query term.",
          editor: "textfield",
        },
        condition: {
          name: "condition",
          type: "string",
          title: "Condition",
          description: "Disease or condition filter (e.g. 'Melanoma', 'Diabetes').",
          editor: "textfield",
        },
        intervention: {
          name: "intervention",
          type: "string",
          title: "Intervention",
          description: "Drug or intervention filter (e.g. 'Pembrolizumab').",
          editor: "textfield",
        },
        status: {
          name: "status",
          type: "string",
          title: "Recruitment Status",
          description: "Status filter: RECRUITING, COMPLETED, ACTIVE_NOT_RECRUITING.",
          editor: "textfield",
        },
        nctId: {
          name: "nctId",
          type: "string",
          title: "NCT Identifier",
          description: "Direct lookup by NCT ID (e.g. 'NCT04567890').",
          editor: "textfield",
        },
        pageSize: {
          name: "pageSize",
          type: "integer",
          title: "Page Size",
          description: "Number of studies per page (default 10, max 50).",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalCount: { type: "number", description: "Total matching clinical studies" },
        nextPageToken: { type: "string", description: "Cursor token for subsequent page" },
        studies: { type: "array", description: "Normalized clinical study objects" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      query: "melanoma immunotherapy",
      status: "RECRUITING",
      pageSize: 10,
    },
    readme: `# ClinicalTrials.gov Harvester\n\nOfficial NIH/NLM registry of 480k+ studies for clinical trials, protocols, and eligibility criteria.`,
    mcpTool: {
      name: "query_clinical_trials",
      description:
        "Queries ClinicalTrials.gov API v2 for trial protocols, eligibility criteria, and interventions.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "General keyword or topic search term." },
          condition: { type: "string", description: "Disease or medical condition name." },
          intervention: { type: "string", description: "Drug or treatment intervention name." },
          status: { type: "string", description: "Status filter (e.g. RECRUITING, COMPLETED)." },
          nctId: { type: "string", description: "Direct NCT identifier (e.g. NCT04567890)." },
          pageSize: { type: "integer", description: "Number of studies (1-50, default 10)." },
          pageToken: { type: "string", description: "Pagination cursor token." },
        },
        required: [],
      },
    },
  },
  "open-fda": {
    actorType: "open-fda",
    name: "open-fda",
    title: "openFDA Dataset Harvester",
    category: "HEALTHCARE",
    version: "1.0.0",
    description:
      "Queries official openFDA API for FDA drug labels, adverse events, and medical device clearances.",
    author: "Protokol-7 Team",
    tags: ["fda", "pharmacology", "drugs", "adverse-events", "medical-devices"],
    inputSchema: {
      type: "object",
      title: "openFDA Input Schema",
      description: "Endpoint and search criteria for openFDA datasets",
      properties: {
        endpoint: {
          name: "endpoint",
          type: "string",
          title: "Dataset Endpoint",
          description: "Target endpoint: drug/label, drug/event, device/510k, food/enforcement.",
          default: "drug/label",
          enum: ["drug/label", "drug/event", "device/510k", "food/enforcement"],
          editor: "select",
        },
        search: {
          name: "search",
          type: "string",
          title: "Search Query",
          description: "Search term or openFDA search expression (e.g. 'ibuprofen').",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Record Limit",
          description: "Number of records to retrieve (default 10, max 50).",
          default: 10,
          editor: "number",
        },
        skip: {
          name: "skip",
          type: "integer",
          title: "Skip Offset",
          description: "Number of records to skip for pagination.",
          default: 0,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        total: { type: "number", description: "Total matching records" },
        endpoint: { type: "string", description: "Queried dataset endpoint" },
        results: { type: "array", description: "Matching openFDA record objects" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      endpoint: "drug/label",
      search: "ibuprofen",
      limit: 10,
    },
    readme: `# openFDA Harvester\n\nOfficial FDA public dataset queries for drug labels, indications, warnings, and device clearances.`,
    mcpTool: {
      name: "query_open_fda",
      description:
        "Queries official openFDA API for drug labels, indications, warnings, adverse events, and device clearances.",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: {
            type: "string",
            enum: ["drug/label", "drug/event", "device/510k", "food/enforcement"],
            description: "Dataset endpoint (default: drug/label).",
          },
          search: { type: "string", description: "Search query or drug/device name." },
          limit: { type: "integer", description: "Max records to return (1-50, default 10)." },
          skip: { type: "integer", description: "Pagination skip offset." },
        },
        required: [],
      },
    },
  },
  "sec-edgar": {
    actorType: "sec-edgar",
    name: "sec-edgar",
    title: "SEC EDGAR Financial Filings Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries SEC EDGAR Submissions API for corporate CIK, company filings (10-K, 10-Q, 8-K), and accession documents.",
    author: "Protokol-7 Team",
    tags: ["sec", "edgar", "finance", "10-k", "10-q", "corporate-filings"],
    inputSchema: {
      type: "object",
      title: "SEC EDGAR Input Schema",
      description: "Company identifier and filing filter options",
      properties: {
        ticker: {
          name: "ticker",
          type: "string",
          title: "Stock Ticker",
          description: "Stock ticker symbol (e.g. AAPL, MSFT, GOOGL).",
          editor: "textfield",
        },
        cik: {
          name: "cik",
          type: "string",
          title: "Central Index Key (CIK)",
          description: "SEC Central Index Key (10 digits or unpadded integer).",
          editor: "textfield",
        },
        formType: {
          name: "formType",
          type: "string",
          title: "Form Type Filter",
          description: "SEC form type filter (e.g. 10-K, 10-Q, 8-K).",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Filing Limit",
          description: "Maximum number of filings to return (default: 10, max: 100).",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        cik: { type: "string", description: "Standardized 10-digit CIK" },
        entityName: { type: "string", description: "Company legal name" },
        ticker: { type: "string", description: "Associated ticker symbol" },
        sic: { type: "string", description: "Standard Industrial Classification code" },
        sicDescription: { type: "string", description: "SIC industry description" },
        filings: { type: "array", description: "List of matched corporate filings" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      ticker: "AAPL",
      formType: "10-K",
      limit: 5,
    },
    readme: `# SEC EDGAR Harvester\n\nOfficial SEC EDGAR filings for public corporations, including annual 10-K, quarterly 10-Q, and current 8-K reports.`,
    mcpTool: {
      name: "query_sec_edgar",
      description:
        "Queries SEC EDGAR API for public company disclosures, 10-K/10-Q filings, CIK info, and accession metadata.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker symbol (e.g. AAPL, NVDA)." },
          cik: { type: "string", description: "SEC Central Index Key (CIK)." },
          formType: {
            type: "string",
            description: "Filing form type filter (e.g. 10-K, 10-Q, 8-K).",
          },
          limit: { type: "integer", description: "Max filings to return (default 10, max 100)." },
        },
        required: [],
      },
    },
  },
  "court-listener": {
    actorType: "court-listener",
    name: "court-listener",
    title: "CourtListener Legal Opinions Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries CourtListener Free Law Project v4 API for US federal and state case law, court opinions, and legal precedents.",
    author: "Protokol-7 Team",
    tags: ["legal", "courtlistener", "case-law", "precedents", "judges", "opinions"],
    inputSchema: {
      type: "object",
      title: "CourtListener Input Schema",
      description: "Search query, court jurisdiction, and judicial filters",
      properties: {
        query: {
          name: "query",
          type: "string",
          title: "Legal Search Query",
          description: "Legal keywords, statute references, or party names.",
          editor: "textfield",
        },
        court: {
          name: "court",
          type: "string",
          title: "Court Jurisdiction",
          description: "Court jurisdiction identifier (e.g. scotus, ca9, cadc, nysd).",
          editor: "textfield",
        },
        judge: {
          name: "judge",
          type: "string",
          title: "Judge Name",
          description: "Authoring or presiding judge name.",
          editor: "textfield",
        },
        opinionId: {
          name: "opinionId",
          type: "integer",
          title: "Opinion Record ID",
          description: "Direct opinion record ID for full text retrieval.",
          editor: "number",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Result Limit",
          description: "Number of legal opinions to return (default: 10, max: 50).",
          default: 10,
          editor: "number",
        },
        page: {
          name: "page",
          type: "integer",
          title: "Page Number",
          description: "Pagination page number.",
          default: 1,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        total: { type: "number", description: "Total matching opinions" },
        page: { type: "number", description: "Current page" },
        documents: { type: "array", description: "Legal opinion records" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      query: "copyright fair use artificial intelligence",
      limit: 5,
    },
    readme: `# CourtListener Case Law Harvester\n\nAccess US federal and state case law, judge opinions, and legal precedence via Free Law Project's CourtListener API.`,
    mcpTool: {
      name: "query_court_listener",
      description:
        "Queries CourtListener API for US federal and state legal opinions, judge decisions, case citations, and precedents.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Legal search query or party names." },
          court: { type: "string", description: "Court identifier (e.g. scotus, ca9)." },
          judge: { type: "string", description: "Judge name." },
          opinionId: { type: "integer", description: "Direct opinion record ID." },
          limit: { type: "integer", description: "Max records to return (1-50, default 10)." },
          page: { type: "integer", description: "Page number (default 1)." },
        },
        required: [],
      },
    },
  },
  "software-heritage": {
    actorType: "software-heritage",
    name: "software-heritage",
    title: "Software Heritage Universal Code Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries Software Heritage Universal Source Code Archive for persistent SWHIDs (swh:1:cnt, swh:1:dir, swh:1:rev) and origin snapshot visits.",
    author: "Protokol-7 Team",
    tags: ["software-heritage", "swhid", "source-code", "open-source", "git", "archive"],
    inputSchema: {
      type: "object",
      title: "Software Heritage Input Schema",
      description: "SWHID identifier or VCS repository origin URL",
      properties: {
        swhid: {
          name: "swhid",
          type: "string",
          title: "SWHID Identifier",
          description:
            "Software Heritage persistent identifier (e.g. swh:1:cnt:..., swh:1:dir:...).",
          editor: "textfield",
        },
        originUrl: {
          name: "originUrl",
          type: "string",
          title: "Repository Origin URL",
          description: "Public VCS repository URL (e.g. https://github.com/torvalds/linux).",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action Type",
          description:
            "Target action: content (code file), directory (file tree), origin (snapshot), revision (commit).",
          enum: ["content", "directory", "origin", "revision"],
          editor: "select",
        },
        rawTextMaxChars: {
          name: "rawTextMaxChars",
          type: "integer",
          title: "Max Code Length",
          description: "Maximum characters to extract for code blobs (default: 100000).",
          default: 100000,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        swhid: { type: "string", description: "Resolved persistent SWHID" },
        action: { type: "string", description: "Executed archive action" },
        url: { type: "string", description: "API request URL" },
        data: { type: "object", description: "Extracted code, directory tree, or origin visit" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      swhid: "swh:1:cnt:94a9ed024d3859793618152ea559a168bbcbb5e2",
    },
    readme: `# Software Heritage Harvester\n\nAccess 18B+ source code files, persistent SWHIDs, and git snapshots preserved in the Software Heritage Universal Archive.`,
    mcpTool: {
      name: "query_software_heritage",
      description:
        "Queries Software Heritage Archive for persistent SWHID code blobs, directory trees, revisions, and origin visits.",
      inputSchema: {
        type: "object",
        properties: {
          swhid: {
            type: "string",
            description: "SWHID identifier (e.g. swh:1:cnt:... or swh:1:dir:...).",
          },
          originUrl: {
            type: "string",
            description: "Repository origin URL (e.g. https://github.com/...).",
          },
          action: {
            type: "string",
            enum: ["content", "directory", "origin", "revision"],
            description: "Archive query type.",
          },
          rawTextMaxChars: {
            type: "integer",
            description: "Max code characters (default: 100000).",
          },
        },
        required: [],
      },
    },
  },
  "eur-lex": {
    actorType: "eur-lex",
    name: "eur-lex",
    title: "EUR-Lex European Union Law Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries EUR-Lex and European Publications Office CELLAR for EU directives, regulations, decisions, and CJEU case law.",
    author: "Protokol-7 Team",
    tags: ["eur-lex", "eu-law", "celex", "regulations", "directives", "cjeu", "legal"],
    inputSchema: {
      type: "object",
      title: "EUR-Lex Input Schema",
      description: "CELEX identifier, search query, and language preference",
      properties: {
        celex: {
          name: "celex",
          type: "string",
          title: "CELEX Number",
          description: "EU CELEX identifier (e.g. 32016R0679 for GDPR, 32024R1689 for AI Act).",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Legal keyword or subject search term.",
          editor: "textfield",
        },
        language: {
          name: "language",
          type: "string",
          title: "Official Language Code",
          description: "Two-letter EU language code (e.g. en, fr, de, es, it). Default: en.",
          default: "en",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Document Limit",
          description: "Maximum documents to return (default: 10, max: 50).",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        celex: { type: "string", description: "Primary CELEX identifier" },
        query: { type: "string", description: "Search query" },
        language: { type: "string", description: "Language of the extracted document" },
        totalCount: { type: "number", description: "Total matching documents" },
        documents: { type: "array", description: "List of legal document items" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      celex: "32016R0679",
      language: "en",
    },
    readme: `# EUR-Lex Harvester\n\nOfficial repository of European Union law, regulations, directives, international agreements, and CJEU case law.`,
    mcpTool: {
      name: "query_eur_lex",
      description:
        "Queries EUR-Lex and EU CELLAR repository for EU directives, regulations, decisions, and Court of Justice case law.",
      inputSchema: {
        type: "object",
        properties: {
          celex: {
            type: "string",
            description: "CELEX identifier (e.g. 32016R0679 for GDPR, 32024R1689 for AI Act).",
          },
          query: { type: "string", description: "Search query for EU legal acts." },
          language: { type: "string", description: "EU official language code (default: en)." },
          limit: { type: "integer", description: "Max results to return (1-50, default 10)." },
        },
        required: [],
      },
    },
  },

  openstax: {
    actorType: "openstax",
    name: "openstax",
    title: "OpenStax Textbook & Curriculum Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries OpenStax for openly licensed peer-reviewed college and AP textbooks, curriculums, and chapter content.",
    author: "Protokol-7 Team",
    tags: ["openstax", "textbooks", "education", "curriculum", "oer", "stem", "college"],
    inputSchema: {
      type: "object",
      title: "OpenStax Input Schema",
      description: "Search query, book ID, slug, or chapter URL",
      properties: {
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Subject, keyword, or book title (e.g. calculus, physics, biology).",
          editor: "textfield",
        },
        bookId: {
          name: "bookId",
          type: "string",
          title: "Book ID",
          description: "OpenStax CMS book ID (e.g. 38, 867).",
          editor: "textfield",
        },
        slug: {
          name: "slug",
          type: "string",
          title: "Book Slug",
          description: "OpenStax book slug (e.g. algebra-and-trigonometry, college-physics-2e).",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action Type",
          description: "Operation type: catalog, search, detail, or chapter.",
          default: "catalog",
          enum: ["catalog", "search", "detail", "chapter"],
          editor: "select",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Maximum textbooks to return (default: 20, max: 100).",
          default: 20,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        query: { type: "string", description: "Search query" },
        action: { type: "string", description: "Action performed" },
        totalCount: { type: "number", description: "Total matching textbooks" },
        books: { type: "array", description: "List of textbook metadata items" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      query: "physics",
      limit: 10,
    },
    readme: `# OpenStax Harvester\n\nAccess peer-reviewed, openly licensed textbooks from OpenStax (Rice University).`,
    mcpTool: {
      name: "query_openstax",
      description:
        "Queries OpenStax for openly licensed peer-reviewed college textbooks, curriculums, and chapter content.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for textbooks (e.g. calculus, biology).",
          },
          bookId: { type: "string", description: "OpenStax CMS book ID." },
          slug: { type: "string", description: "Book slug (e.g. algebra-and-trigonometry)." },
          action: {
            type: "string",
            enum: ["catalog", "search", "detail", "chapter"],
            description: "Action type (catalog, search, detail, chapter).",
          },
          limit: { type: "integer", description: "Max results to return (1-100, default 20)." },
        },
        required: [],
      },
    },
  },

  "mit-ocw": {
    actorType: "mit-ocw",
    name: "mit-ocw",
    title: "MIT OpenCourseWare Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Queries MIT OpenCourseWare for university curriculum materials, syllabi, lecture metadata, and course resources.",
    author: "Protokol-7 Team",
    tags: ["mit", "ocw", "opencourseware", "syllabus", "lectures", "curriculum", "university"],
    inputSchema: {
      type: "object",
      title: "MIT OCW Input Schema",
      description: "Search query or course slug for MIT courses",
      properties: {
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description:
            "Course topic, department, number, or keyword (e.g. linear algebra, quantum mechanics, 18.06).",
          editor: "textfield",
        },
        courseSlug: {
          name: "courseSlug",
          type: "string",
          title: "Course Slug",
          description: "Full course slug (e.g. 18-06-linear-algebra-spring-2010).",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action Type",
          description: "Operation type: search or course.",
          default: "search",
          enum: ["search", "course"],
          editor: "select",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Maximum courses to return (default: 10, max: 50).",
          default: 10,
          editor: "number",
        },
        offset: {
          name: "offset",
          type: "integer",
          title: "Offset",
          description: "Pagination offset index (default: 0).",
          default: 0,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        query: { type: "string", description: "Search query" },
        courseSlug: { type: "string", description: "Course slug if detail query" },
        action: { type: "string", description: "Action performed" },
        totalCount: { type: "number", description: "Total matching courses" },
        courses: { type: "array", description: "List of university course items" },
        markdown: { type: "string", description: "LLM-ready structured Markdown distillation" },
      },
    },
    exampleInput: {
      query: "linear algebra",
      limit: 5,
    },
    readme: `# MIT OpenCourseWare Harvester\n\nAccess undergraduate and graduate courses, lecture syllabi, and resources from MIT OpenCourseWare.`,
    mcpTool: {
      name: "query_mit_ocw",
      description:
        "Queries MIT OpenCourseWare for university curriculum materials, syllabi, lecture metadata, and course resources.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (e.g. linear algebra, quantum mechanics, computer science).",
          },
          courseSlug: {
            type: "string",
            description: "Course slug for syllabus detail (e.g. 18-06-linear-algebra-spring-2010).",
          },
          action: {
            type: "string",
            enum: ["search", "course"],
            description: "Action type (search or course).",
          },
          limit: { type: "integer", description: "Max courses to return (1-50, default 10)." },
          offset: { type: "integer", description: "Pagination offset (default 0)." },
        },
        required: [],
      },
    },
  },
  "resmi-gazete": {
    actorType: "resmi-gazete",
    name: "resmi-gazete",
    title: "T.C. Resmî Gazete Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests T.C. Resmî Gazete daily bulletins, laws, presidential decrees, regulations, and announcements with full metadata.",
    author: "Protokol-7 Architecture Team",
    tags: ["turkey", "law", "legislation", "government", "official-gazette", "legal-corpus"],
    inputSchema: {
      type: "object",
      title: "ResmiGazeteInput",
      description: "Input parameters for T.C. Resmî Gazete extraction actor.",
      properties: {
        date: {
          name: "date",
          type: "string",
          title: "Publication Date",
          description: "Target publication date (YYYY-MM-DD or YYYYMMDD, e.g. 2024-03-15).",
          editor: "textfield",
        },
        issueNumber: {
          name: "issueNumber",
          type: "integer",
          title: "Issue Number",
          description: "Official gazette issue number (e.g. 32490).",
          editor: "number",
        },
        category: {
          name: "category",
          type: "string",
          title: "Legislation Category",
          description:
            "Category filter (all, kanun, cumhurbaskanligi, yonetmelik, teblig, kurul-karari, ilanlar).",
          default: "all",
          enum: [
            "all",
            "kanun",
            "cumhurbaskanligi",
            "yonetmelik",
            "teblig",
            "kurul-karari",
            "ilanlar",
          ],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword filter for legislation titles or content.",
          editor: "textfield",
        },
        format: {
          name: "format",
          type: "string",
          title: "Output Format",
          description: "Response format: markdown or json.",
          default: "markdown",
          enum: ["markdown", "json"],
          editor: "select",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Maximum items to return (default: 50).",
          default: 50,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct URL to specific Resmî Gazete bulletin or document.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        date: { type: "string", description: "Bulletin publication date (YYYY-MM-DD)" },
        issueNumber: { type: "number", description: "Official gazette issue number" },
        isRepeated: { type: "boolean", description: "True if repeated (mükerrer) issue" },
        totalItems: { type: "number", description: "Total extracted legislation items" },
        items: { type: "array", description: "Structured legislation documents and metadata" },
        queryUrl: { type: "string", description: "Source URL resolved" },
        markdown: {
          type: "string",
          description: "LLM-ready Markdown table of contents and summaries",
        },
      },
    },
    exampleInput: {
      date: "2024-03-15",
      category: "all",
      limit: 10,
    },
    readme:
      "# T.C. Resmî Gazete Harvester\n\nExtracts daily legislative bulletins, acts, decrees, and regulations from the official portal of the Presidency of the Republic of Turkey.",
    mcpTool: {
      name: "query_resmi_gazete",
      description:
        "Queries T.C. Resmî Gazete for daily legislative bulletins, laws, presidential decrees, regulations, and announcements.",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD or YYYYMMDD format (e.g. 2024-03-15).",
          },
          issueNumber: {
            type: "integer",
            description: "Official gazette issue number (e.g. 32490).",
          },
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
            description: "Legislation category filter.",
          },
          query: {
            type: "string",
            description: "Keyword search filter in legislation titles.",
          },
          limit: { type: "integer", description: "Maximum items to extract (default 50)." },
          targetUrl: {
            type: "string",
            description: "Direct link to a specific Resmî Gazete page.",
          },
        },
        required: [],
      },
    },
  },

  yargitay: {
    actorType: "yargitay",
    name: "yargitay",
    title: "Yargıtay ve Danıştay İçtihat Derleyici",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Yargıtay ve Danıştay emsal içtihat kararlarını, gerekçeli metinleri ve hukuk/ceza dairesi kararlarını ayıklayan aktör.",
    author: "protokol-7",
    tags: ["legal", "court", "yargitay", "danistay", "precedent", "turkey"],
    inputSchema: {
      type: "object",
      title: "Yargıtay/Danıştay Sorgu Parametreleri",
      description: "Emsal karar arama kriterleri",
      properties: {
        court: {
          name: "court",
          type: "string",
          title: "Mahkeme",
          description: "Yargıtay veya Danıştay seçimi.",
          default: "yargitay",
          enum: ["yargitay", "danistay"],
          editor: "select",
        },
        chamber: {
          name: "chamber",
          type: "string",
          title: "Daire",
          description: "Hukuk veya Ceza dairesi (ör. 1. Hukuk Dairesi, Ceza Genel Kurulu).",
          editor: "textfield",
        },
        caseNumber: {
          name: "caseNumber",
          type: "string",
          title: "Esas Numarası",
          description: "Dava esas numarası (ör. 2021/1234).",
          editor: "textfield",
        },
        decisionNumber: {
          name: "decisionNumber",
          type: "string",
          title: "Karar Numarası",
          description: "Dava karar numarası (ör. 2022/567).",
          editor: "textfield",
        },
        year: {
          name: "year",
          type: "integer",
          title: "Yıl",
          description: "Karar yılı (ör. 2023).",
          editor: "number",
        },
        legalArea: {
          name: "legalArea",
          type: "string",
          title: "Hukuk Alanı",
          description: "Hukuk veya Ceza ayrımı.",
          default: "all",
          enum: ["all", "hukuk", "ceza", "idari", "vergi"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Arama Terimi",
          description: "Karar özeti veya gerekçesinde aranacak anahtar kelime.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Döndürülecek maksimum karar adedi.",
          default: 20,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalCount: { type: "number", description: "Toplam karar adedi" },
        court: { type: "string", description: "Mahkeme adı (Yargıtay / Danıştay)" },
        decisions: { type: "array", description: "Yapılandırılmış emsal karar listesi" },
        queryUrl: { type: "string", description: "Çözümlenen kaynak URL" },
        markdown: { type: "string", description: "LLM için hazır Markdown özeti" },
      },
    },
    exampleInput: {
      court: "yargitay",
      chamber: "1. Hukuk Dairesi",
      query: "tapu iptali ve tescil",
      limit: 10,
    },
    readme:
      "# Yargıtay & Danıştay Emsal Karar Derleyici\\n\\nYargıtay ve Danıştay kararlarını, daire kararlarını ve gerekçelerini yapılandırılmış biçimde ayıklar.",
    mcpTool: {
      name: "query_yargitay",
      description:
        "Queries Turkish Supreme Court of Appeals (Yargıtay) and Council of State (Danıştay) for precedent decisions, chamber rulings, and case jurisprudence.",
      inputSchema: {
        type: "object",
        properties: {
          court: {
            type: "string",
            enum: ["yargitay", "danistay"],
            description: "Target supreme court (default: yargitay).",
          },
          chamber: {
            type: "string",
            description: "Chamber name (e.g. '1. Hukuk Dairesi', 'Ceza Genel Kurulu').",
          },
          caseNumber: {
            type: "string",
            description: "Case number / Esas No (e.g. '2021/1234').",
          },
          decisionNumber: {
            type: "string",
            description: "Decision number / Karar No (e.g. '2022/567').",
          },
          year: {
            type: "integer",
            description: "Decision year (e.g. 2023).",
          },
          legalArea: {
            type: "string",
            enum: ["all", "Hukuk", "Ceza"],
            description: "Legal area filter.",
          },
          query: {
            type: "string",
            description: "Keyword search in decisions.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of decisions to return (default 20).",
          },
          targetUrl: {
            type: "string",
            description: "Direct URL to a decision page or query endpoint.",
          },
        },
        required: [],
      },
    },
  },

  kap: {
    actorType: "kap",
    name: "kap",
    title: "Kamuoyu Aydınlatma Platformu (KAP) Bildirim Aktörü",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "BIST şirketlerinin KAP özel durum açıklamalarını, finansal raporlarını ve resmi bildirimlerini ayıklayan aktör.",
    author: "protokol-7",
    tags: ["finance", "bist", "kap", "disclosures", "turkey", "corporate"],
    inputSchema: {
      type: "object",
      title: "KAP Sorgu Parametreleri",
      description: "KAP bildirim ve şirket sorgu kriterleri",
      properties: {
        companyTicker: {
          name: "companyTicker",
          type: "string",
          title: "Hisse / Şirket Kodu",
          description: "BIST hisse kodu (ör. THYAO, ASELS, GARAN, KCHOL).",
          editor: "textfield",
        },
        disclosureType: {
          name: "disclosureType",
          type: "string",
          title: "Bildirim Türü",
          description: "Özel Durum Açıklaması, Finansal Rapor, Genel Kurul vb.",
          default: "all",
          enum: ["all", "oda", "fr", "dg", "gk"],
          editor: "select",
        },
        fromDate: {
          name: "fromDate",
          type: "string",
          title: "Başlangıç Tarihi",
          description: "YYYY-MM-DD formatında başlangıç tarihi.",
          editor: "textfield",
        },
        toDate: {
          name: "toDate",
          type: "string",
          title: "Bitiş Tarihi",
          description: "YYYY-MM-DD formatında bitiş tarihi.",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Arama Terimi",
          description: "Bildirim başlığı veya özetinde aranacak kelime.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Maksimum bildirim sayısı (varsayılan: 20).",
          default: 20,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalCount: { type: "number", description: "Toplam bildirim sayısı" },
        companyTicker: { type: "string", description: "Sorgulanan hisse kodu" },
        disclosures: { type: "array", description: "Yapılandırılmış bildirim kayıtları" },
        queryUrl: { type: "string", description: "Çözümlenen kaynak URL" },
        markdown: { type: "string", description: "LLM için hazır Markdown özeti" },
      },
    },
    exampleInput: {
      companyTicker: "THYAO",
      limit: 10,
    },
    readme:
      "# Kamuoyu Aydınlatma Platformu (KAP) Bildirim Aktörü\\n\\nBorsa İstanbul (BIST) şirketlerinin özel durum açıklamalarını, finansal raporlarını ve kurumsal duyurularını yapılandırılmış biçimde ayıklar.",
    mcpTool: {
      name: "query_kap",
      description:
        "Queries Turkish Public Disclosure Platform (KAP) for Borsa Istanbul (BIST) company disclosures, financial reports, board decisions, and regulatory filings.",
      inputSchema: {
        type: "object",
        properties: {
          companyTicker: {
            type: "string",
            description:
              "BIST company stock ticker symbol (e.g. 'THYAO', 'ASELS', 'GARAN', 'KCHOL').",
          },
          disclosureType: {
            type: "string",
            enum: ["all", "oda", "fr", "dg", "gk"],
            description:
              "Disclosure type filter ('oda': special disclosure, 'fr': financial report, 'gk': general assembly).",
          },
          fromDate: {
            type: "string",
            description: "Start date (YYYY-MM-DD).",
          },
          toDate: {
            type: "string",
            description: "End date (YYYY-MM-DD).",
          },
          query: {
            type: "string",
            description: "Search keyword in disclosure summary or subject.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of disclosures to return (default 20).",
          },
          targetUrl: {
            type: "string",
            description: "Direct URL to a specific KAP disclosure or endpoint.",
          },
        },
        required: [],
      },
    },
  },

  github: {
    actorType: "github",
    name: "github",
    title: "GitHub Repository & Code Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "GitHub ambar metaverilerini, README belgelerini, issue ve PR tartışmalarını, sürümleri ve kaynak ağacını ayıklayan aktör.",
    author: "protokol-7",
    tags: ["github", "code", "git", "issues", "pull-requests", "readme", "releases"],
    inputSchema: {
      type: "object",
      title: "GitHub Sorgu Parametreleri",
      description: "GitHub ambarı veya veri arama parametreleri",
      properties: {
        owner: {
          name: "owner",
          type: "string",
          title: "Ambar Sahibi (Owner)",
          description: "GitHub kullanıcı adı veya organizasyon adı (ör. facebook, vercel).",
          editor: "textfield",
        },
        repo: {
          name: "repo",
          type: "string",
          title: "Ambar Adı (Repository)",
          description: "GitHub ambar adı (ör. react, next.js).",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "İşlem Türü",
          description: "repo, readme, issues, pulls, releases veya tree.",
          default: "repo",
          enum: ["repo", "readme", "issues", "pulls", "releases", "tree"],
          editor: "select",
        },
        state: {
          name: "state",
          type: "string",
          title: "Durum",
          description: "open, closed veya all (issues ve pulls için).",
          default: "open",
          enum: ["open", "closed", "all"],
          editor: "select",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Limit",
          description: "Döndürülecek maksimum kayıt adedi.",
          default: 30,
          editor: "number",
        },
        token: {
          name: "token",
          type: "string",
          title: "GitHub Kişisel Erişim Jetonu (PAT)",
          description: "Yüksek API kotası (5000/saat) için isteğe bağlı erişim belirteci.",
          editor: "textfield",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description: "Doğrudan ambar veya API adresi (ör. https://github.com/owner/repo).",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        owner: { type: "string", description: "Ambar sahibi" },
        repo: { type: "string", description: "Ambar adı" },
        action: { type: "string", description: "Yürütülen işlem türü" },
        data: { type: "object", description: "Yapılandırılmış ambar verileri" },
        queryUrl: { type: "string", description: "Çağrılan GitHub REST API adresi" },
        markdown: { type: "string", description: "LLM için hazır Markdown çıktısı" },
      },
    },
    exampleInput: {
      owner: "torvalds",
      repo: "linux",
      action: "repo",
    },
    readme:
      "# GitHub Harvester\\n\\nGitHub açık kaynak ambarlarının metaverilerini, README belgelerini, hata kayıtlarını ve sürüm notlarını yapılandırılmış biçimde ayıklar.",
    mcpTool: {
      name: "query_github",
      description:
        "Queries GitHub REST API to extract repository metadata, README documentation, issues, pull requests, releases, and source trees.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "GitHub repository owner/organization (e.g. 'torvalds', 'facebook').",
          },
          repo: {
            type: "string",
            description: "GitHub repository name (e.g. 'linux', 'react').",
          },
          action: {
            type: "string",
            enum: ["repo", "readme", "issues", "pulls", "releases", "tree"],
            description: "Extraction target type (default: 'repo').",
          },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter state for issues and pulls (default: 'open').",
          },
          limit: {
            type: "integer",
            description: "Maximum items to return (default 30).",
          },
          token: {
            type: "string",
            description: "Optional GitHub personal access token for higher rate limits.",
          },
          targetUrl: {
            type: "string",
            description:
              "Direct GitHub repository or API URL (e.g. 'https://github.com/owner/repo').",
          },
        },
        required: [],
      },
    },
  },

  openreview: {
    actorType: "openreview",
    name: "openreview",
    title: "OpenReview Academic Submissions & Peer Reviews Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "OpenReview konferans makalelerini, hakem değerlendirmelerini, yazar yanıtlarını (rebuttal) ve kabul kararlarını ayıklayan aktör.",
    author: "protokol-7",
    tags: ["openreview", "academic", "peer-review", "iclr", "neurips", "icml", "rebuttal"],
    inputSchema: {
      type: "object",
      title: "OpenReview Sorgu Parametreleri",
      description: "OpenReview arama veya makale forumu parametreleri",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "İşlem Türü",
          description:
            "Çıkarma türü: submissions (bildiriler), forum (tartışma/hakemlik ağacı), note (tekil kayıt).",
          enum: ["submissions", "forum", "note"],
          editor: "select",
          prefill: "submissions",
        },
        venue: {
          name: "venue",
          type: "string",
          title: "Konferans / Venue Tanımlayıcısı",
          description:
            "Hedef konferans ID (ör. ICLR.cc/2024/Conference, NeurIPS.cc/2023/Conference).",
          editor: "textfield",
        },
        forumId: {
          name: "forumId",
          type: "string",
          title: "Forum / Makale ID",
          description: "Tüm hakemlik sürecini ve yazar yanıtlarını getirecek bildiri ID'si.",
          editor: "textfield",
        },
        noteId: {
          name: "noteId",
          type: "string",
          title: "Not ID",
          description: "Tekil not veya inceleme ID'si.",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Arama Terimi",
          description: "Bildiri başlığı veya özetinde aranacak kelime.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "number",
          title: "Maksimum Kayıt",
          description: "Döndürülecek maksimum bildiri sayısı (varsayılan: 25).",
          editor: "number",
          prefill: "25",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description:
            "Doğrudan OpenReview forum veya API adresi (ör. https://openreview.net/forum?id=xxx).",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Çalıştırılan eylem" },
        venue: { type: "string", description: "Konferans tanımlayıcısı" },
        forumId: { type: "string", description: "Forum ID" },
        totalCount: { type: "number", description: "Toplam not sayısı" },
        notes: {
          type: "array",
          description: "Ayrıştırılmış makale, hakemlik ve yanıt notları",
        },
        queryUrl: { type: "string", description: "Sorgulanan OpenReview API URL" },
        markdown: {
          type: "string",
          description: "LLM için yapılandırılmış GFM Markdown",
        },
      },
    },
    exampleInput: {
      action: "submissions",
      venue: "ICLR.cc/2024/Conference",
      limit: 10,
    },
    readme:
      "# OpenReview Harvester\\n\\nOpenReview platformundaki akademik yayınları, hakem incelemelerini, güven puanlarını ve yazar yanıtlarını LLM eğitimine uygun diyalektik biçimde ayıklar.",
    mcpTool: {
      name: "query_openreview",
      description:
        "Queries OpenReview API to extract academic paper submissions, peer reviews, author rebuttals, meta-reviews, and decisions (ICLR, NeurIPS, ICML).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["submissions", "forum", "note"],
            description:
              "Target action: 'submissions' (list papers), 'forum' (full review/rebuttal thread), 'note' (single note).",
          },
          venue: {
            type: "string",
            description:
              "Conference venue ID (e.g. 'ICLR.cc/2024/Conference', 'NeurIPS.cc/2023/Conference').",
          },
          forumId: {
            type: "string",
            description:
              "Paper forum ID to fetch all peer reviews, comments, and author rebuttals.",
          },
          noteId: {
            type: "string",
            description: "Specific note ID.",
          },
          query: {
            type: "string",
            description: "Search keyword in papers.",
          },
          limit: {
            type: "integer",
            description: "Maximum notes/papers to return (default: 25).",
          },
          targetUrl: {
            type: "string",
            description:
              "Direct OpenReview forum URL (e.g. 'https://openreview.net/forum?id=xxx').",
          },
        },
        required: [],
      },
    },
  },

  "hacker-news": {
    actorType: "hacker-news",
    name: "hacker-news",
    title: "Hacker News Discussions & Architecture Post-Mortems Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Y Combinator Hacker News mühendislik tartışmalarını, mimari incelemelerini ve iç içe geçmiş yorum ağaçlarını çeken aktör.",
    author: "protokol-7",
    tags: [
      "hackernews",
      "ycombinator",
      "engineering",
      "postmortem",
      "architecture",
      "discussions",
      "reasoning",
    ],
    inputSchema: {
      type: "object",
      title: "Hacker News Sorgu Parametreleri",
      description: "Hacker News tartışma ve yorum ağacı çıkarma parametreleri",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "İşlem Türü",
          description:
            "Çıkarma türü: top (öne çıkanlar), best (en iyiler), new (en yeniler), ask (Ask HN), show (Show HN), story (tekil başlık ve yorum ağacı), search (arama).",
          enum: ["top", "best", "new", "ask", "show", "story", "search"],
          editor: "select",
          prefill: "top",
        },
        storyId: {
          name: "storyId",
          type: "number",
          title: "Başlık ID",
          description: "Yorum ağacıyla birlikte çekilecek tekil Hacker News başlık/tartışma ID'si.",
          editor: "number",
        },
        query: {
          name: "query",
          type: "string",
          title: "Arama Terimi",
          description: "Mühendislik tartışmalarında aranacak anahtar kelime veya konu.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "number",
          title: "Maksimum Başlık",
          description: "Döndürülecek maksimum başlık sayısı (varsayılan: 20).",
          editor: "number",
          prefill: "20",
        },
        maxComments: {
          name: "maxComments",
          type: "number",
          title: "Maksimum Yorum",
          description:
            "Tekil başlık için ayıklanacak maksimum iç içe yorum adedi (varsayılan: 50).",
          editor: "number",
          prefill: "50",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description:
            "Doğrudan Hacker News başlık adresi (ör. https://news.ycombinator.com/item?id=38870197) veya Algolia API URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Çalıştırılan eylem" },
        totalStories: { type: "number", description: "Toplam başlık sayısı" },
        stories: {
          type: "array",
          description: "Ayrıştırılmış başlıklar ve iç içe yorum ağaçları",
        },
        queryUrl: { type: "string", description: "Sorgulanan Hacker News / Algolia API URL" },
        markdown: {
          type: "string",
          description: "LLM için biçimlendirilmiş GFM Markdown metni",
        },
      },
    },
    exampleInput: {
      action: "top",
      limit: 10,
    },
    readme:
      "# Hacker News Harvester\\n\\nY Combinator Hacker News platformundaki mühendislik tartışmalarını, mimari incelemelerini ve iç içe geçmiş yorum ağaçlarını temiz GFM Markdown olarak ayıklar.",
    mcpTool: {
      name: "query_hacker_news",
      description:
        "Queries Hacker News (via Algolia and Firebase APIs) to extract engineering discussions, architecture post-mortems, and nested comment trees.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["top", "best", "new", "ask", "show", "story", "search"],
            description:
              "Target action: 'top', 'best', 'new', 'ask', 'show', 'story', or 'search'.",
          },
          storyId: {
            type: "integer",
            description: "Hacker News story ID to fetch complete nested comment tree.",
          },
          query: {
            type: "string",
            description: "Search keyword query across Hacker News stories.",
          },
          limit: {
            type: "integer",
            description: "Maximum stories to return (default: 20).",
          },
          maxComments: {
            type: "integer",
            description: "Maximum nested comments to parse for a single story (default: 50).",
          },
          targetUrl: {
            type: "string",
            description:
              "Direct Hacker News item or API URL (e.g. 'https://news.ycombinator.com/item?id=12345').",
          },
        },
        required: [],
      },
    },
  },
  "huggingface-datasets": {
    actorType: "huggingface-datasets",
    name: "huggingface-datasets",
    title: "Hugging Face Datasets Server Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Streams structured dataset rows, split configurations, and schema features from the Hugging Face Serverless Datasets API.",
    author: "protokol-7",
    tags: ["huggingface", "datasets", "machine-learning", "fine-tuning", "cot", "llm-training"],
    inputSchema: {
      type: "object",
      title: "Hugging Face Datasets Girdi Parametreleri",
      description: "Hugging Face Datasets Server API parametreleri",
      properties: {
        dataset: {
          name: "dataset",
          type: "string",
          title: "Veri Kümesi Adı",
          description:
            "Hugging Face veri kümesi tanımlayıcısı (ör. 'openai/gsm8k' veya 'tatsu-lab/alpaca').",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Eylem",
          description:
            "Çalıştırılacak eylem türü: 'rows' (satırlar), 'splits' (dilimler), 'info' (bilgi), 'size' (boyut).",
          default: "rows",
          enum: ["rows", "splits", "info", "size"],
          editor: "select",
        },
        config: {
          name: "config",
          type: "string",
          title: "Konfigürasyon",
          description: "Veri kümesi konfigürasyonu/alt kümesi (varsayılan: 'default').",
          editor: "textfield",
        },
        split: {
          name: "split",
          type: "string",
          title: "Dilim (Split)",
          description:
            "Veri kümesi dilimi (ör. 'train', 'test', 'validation'). Varsayılan: 'train'.",
          editor: "textfield",
        },
        offset: {
          name: "offset",
          type: "number",
          title: "Satır Başlangıç Ofseti",
          description: "Akıtılacak satırların başlangıç indeksi (varsayılan: 0).",
          editor: "number",
          prefill: "0",
        },
        limit: {
          name: "limit",
          type: "number",
          title: "Maksimum Satır Sayısı",
          description: "Döndürülecek maksimum satır adedi (1-100 arası, varsayılan: 20).",
          editor: "number",
          prefill: "20",
        },
        hfToken: {
          name: "hfToken",
          type: "string",
          title: "Hugging Face API Anahtarı",
          description:
            "Özel veya kapalı veri setleri için opsiyonel Hugging Face User Access Token.",
          editor: "textfield",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description: "Doğrudan Hugging Face veri kümesi URL'i veya Datasets Server uç noktası.",
          editor: "textfield",
        },
      },
      required: ["dataset"],
    },
    outputSchema: {
      type: "object",
      fields: {
        dataset: { type: "string", description: "Sorgulanan veri kümesi" },
        action: { type: "string", description: "Çalıştırılan eylem" },
        config: { type: "string", description: "Veri kümesi konfigürasyonu" },
        split: { type: "string", description: "Veri kümesi dilimi" },
        totalRows: { type: "number", description: "Dilimdeki toplam kayıt sayısı" },
        features: { type: "array", description: "Sütun ve özellik şeması" },
        splits: { type: "array", description: "Mevcut dilim listesi" },
        rows: { type: "array", description: "Ayıklanan yapılandırılmış veri satırları" },
        info: { type: "object", description: "Veri kümesi meta-bilgileri ve lisans" },
        queryUrl: { type: "string", description: "Sorgulanan Datasets Server API URL" },
        markdown: {
          type: "string",
          description: "LLM için biçimlendirilmiş GFM Markdown tablosu",
        },
      },
    },
    exampleInput: {
      dataset: "openai/gsm8k",
      config: "main",
      split: "train",
      limit: 10,
    },
    readme:
      "# Hugging Face Datasets Server Harvester\\n\\nHugging Face üzerindeki açık kaynaklı yapay zeka eğitim ve değerlendirme veri setlerini (CoT, kod tamamlama, talimat çiftleri) datasets-server API'si üzerinden akıtarak yapılandırılmış JSON ve GFM Markdown tablosuna dönüştürür.",
    mcpTool: {
      name: "query_huggingface_datasets",
      description:
        "Queries Hugging Face Datasets Serverless API to stream rows, inspect schema features, and list splits for any public or gated dataset.",
      inputSchema: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            description:
              "Hugging Face dataset identifier (e.g. 'openai/gsm8k' or 'tatsu-lab/alpaca').",
          },
          action: {
            type: "string",
            enum: ["rows", "splits", "info", "size"],
            description: "Target action: 'rows', 'splits', 'info', or 'size'.",
          },
          config: {
            type: "string",
            description: "Dataset configuration or subset name (default: 'default').",
          },
          split: {
            type: "string",
            description: "Dataset split (e.g. 'train', 'test', 'validation'). Default: 'train'.",
          },
          offset: {
            type: "integer",
            description: "Row offset to start streaming from (default: 0).",
          },
          limit: {
            type: "integer",
            description: "Maximum number of rows to fetch (1-100, default: 20).",
          },
          hfToken: {
            type: "string",
            description: "Optional Hugging Face user access token for gated datasets.",
          },
          targetUrl: {
            type: "string",
            description: "Direct Hugging Face dataset URL or datasets-server endpoint.",
          },
        },
        required: ["dataset"],
      },
    },
  },
  "math-reasoning": {
    actorType: "math-reasoning",
    name: "math-reasoning",
    title: "Mathematical Reasoning & CoT Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Extracts mathematical problem solving and Chain-of-Thought (CoT) reasoning pairs (GSM8K, Hendrycks MATH, SVAMP) for LLM fine-tuning and evaluation.",
    author: "protokol-7",
    tags: [
      "math",
      "reasoning",
      "cot",
      "chain-of-thought",
      "gsm8k",
      "hendrycks-math",
      "svamp",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "Matematiksel Muhakeme Girdi Parametreleri",
      description: "Matematiksel problem ve düşünce zinciri ayıklama parametreleri",
      properties: {
        benchmark: {
          name: "benchmark",
          type: "string",
          title: "Benchmark / Veri Kümesi",
          description:
            "Hedef matematik kıyaslama kümesi: 'gsm8k', 'math' (Hendrycks), 'svamp', veya 'olympiadbench'. Varsayılan: 'gsm8k'.",
          default: "gsm8k",
          enum: ["gsm8k", "math", "svamp", "olympiadbench"],
          editor: "select",
        },
        subject: {
          name: "subject",
          type: "string",
          title: "Alt Konu / Branş",
          description:
            "Hendrycks MATH için alt dal (ör. 'algebra', 'geometry', 'number_theory', 'precalculus').",
          editor: "textfield",
        },
        split: {
          name: "split",
          type: "string",
          title: "Dilim (Split)",
          description: "Veri kümesi dilimi: 'train' veya 'test'. Varsayılan: 'train'.",
          default: "train",
          enum: ["train", "test"],
          editor: "select",
        },
        offset: {
          name: "offset",
          type: "number",
          title: "Başlangıç İndeksi",
          description: "Akıtılacak problemlerin başlangıç ofseti (varsayılan: 0).",
          editor: "number",
          prefill: "0",
        },
        limit: {
          name: "limit",
          type: "number",
          title: "Maksimum Problem Sayısı",
          description: "Döndürülecek maksimum problem sayısı (1-100 arası, varsayılan: 20).",
          editor: "number",
          prefill: "20",
        },
        hfToken: {
          name: "hfToken",
          type: "string",
          title: "Hugging Face Token",
          description: "Hız sınırlarını genişletmek için opsiyonel Hugging Face User Access Token.",
          editor: "textfield",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description: "Doğrudan test uç noktası veya API URL'i.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        benchmark: { type: "string", description: "Sorgulanan matematik benchmark kümesi" },
        totalProblems: { type: "number", description: "Ayıklanan problem adedi" },
        problems: {
          type: "array",
          description: "Yapılandırılmış problem, düşünce zinciri ve cevap nesneleri",
        },
        queryUrl: { type: "string", description: "Sorgulanan Datasets API uç noktası" },
        markdown: {
          type: "string",
          description: "LLM CoT eğitimi için biçimlendirilmiş GFM Markdown metni",
        },
      },
    },
    exampleInput: {
      benchmark: "gsm8k",
      split: "train",
      limit: 10,
    },
    readme:
      "# Mathematical Reasoning & CoT Harvester\\n\\nGSM8K, Hendrycks MATH ve SVAMP gibi temel matematiksel akıl yürütme veri setlerinden soru, adım adım düşünme süreci (CoT), LaTeX formülleri ve nihai cevabı ayıklayarak LLM SFT ve muhakeme eğitimine uygun biçimde sunar.",
    mcpTool: {
      name: "query_math_reasoning",
      description:
        "Queries mathematical reasoning datasets (GSM8K, Hendrycks MATH, SVAMP) to extract multi-step Chain-of-Thought (CoT) problem-solution pairs.",
      inputSchema: {
        type: "object",
        properties: {
          benchmark: {
            type: "string",
            enum: ["gsm8k", "math", "svamp", "olympiadbench"],
            description:
              "Mathematical benchmark name: 'gsm8k', 'math', 'svamp', or 'olympiadbench' (default: 'gsm8k').",
          },
          subject: {
            type: "string",
            description:
              "Subject domain for Hendrycks MATH (e.g. 'algebra', 'geometry', 'number_theory').",
          },
          split: {
            type: "string",
            enum: ["train", "test"],
            description: "Dataset split: 'train' or 'test' (default: 'train').",
          },
          offset: {
            type: "integer",
            description: "Row offset to start streaming from (default: 0).",
          },
          limit: {
            type: "integer",
            description: "Maximum problems to return (1-100, default: 20).",
          },
          hfToken: {
            type: "string",
            description: "Optional Hugging Face access token.",
          },
          targetUrl: {
            type: "string",
            description: "Direct API URL or mock endpoint.",
          },
        },
        required: [],
      },
    },
  },
  "code-eval": {
    actorType: "code-eval",
    name: "code-eval",
    title: "Code Generation & Evaluation Benchmark Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Extracts standard coding evaluation benchmark tasks (HumanEval, MBPP, SWE-bench) with prompts, canonical solutions, and verification tests for LLM coding evaluation.",
    author: "protokol-7",
    tags: [
      "code",
      "coding",
      "humaneval",
      "mbpp",
      "swe-bench",
      "benchmark",
      "evaluation",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "Kod Değerlendirme Girdi Parametreleri",
      description: "Kodlama benchmark ve test süiti ayıklama parametreleri",
      properties: {
        benchmark: {
          name: "benchmark",
          type: "string",
          title: "Benchmark / Kıyaslama Kümesi",
          description:
            "Hedef kod kıyaslama kümesi: 'humaneval', 'mbpp', veya 'swe-bench'. Varsayılan: 'humaneval'.",
          default: "humaneval",
          enum: ["humaneval", "mbpp", "swe-bench"],
          editor: "select",
        },
        split: {
          name: "split",
          type: "string",
          title: "Dilim (Split)",
          description: "Veri kümesi dilimi (ör. 'test' veya 'train'). Varsayılan: 'test'.",
          default: "test",
          editor: "textfield",
        },
        offset: {
          name: "offset",
          type: "number",
          title: "Başlangıç İndeksi",
          description: "Akıtılacak görevlerin başlangıç ofseti (varsayılan: 0).",
          editor: "number",
          prefill: "0",
        },
        limit: {
          name: "limit",
          type: "number",
          title: "Maksimum Görev Sayısı",
          description: "Döndürülecek maksimum kodlama görevi sayısı (1-100 arası, varsayılan: 20).",
          editor: "number",
          prefill: "20",
        },
        hfToken: {
          name: "hfToken",
          type: "string",
          title: "Hugging Face Token",
          description: "Hız sınırlarını genişletmek için opsiyonel Hugging Face User Access Token.",
          editor: "textfield",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description: "Doğrudan test uç noktası veya API URL'i.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        benchmark: { type: "string", description: "Sorgulanan kodlama benchmark kümesi" },
        split: { type: "string", description: "Veri kümesi dilimi" },
        totalTasks: { type: "number", description: "Ayıklanan kodlama görevi sayısı" },
        tasks: {
          type: "array",
          description: "Yapılandırılmış prompt, kanonik çözüm ve test süiti nesneleri",
        },
        queryUrl: { type: "string", description: "Sorgulanan Datasets API uç noktası" },
        markdown: {
          type: "string",
          description: "LLM kodlama eğitimi için biçimlendirilmiş GFM Markdown metni",
        },
      },
    },
    exampleInput: {
      benchmark: "humaneval",
      split: "test",
      limit: 10,
    },
    readme:
      "# Code Generation & Evaluation Benchmark Harvester\\n\\nHumanEval, MBPP ve SWE-bench gibi standart kodlama kıyaslama kümelerinden problem tanımı, giriş noktası, kanonik çözüm ve birim testlerini ayıklayarak LLM kodlama değerlendirmesi ve SFT için sunar.",
    mcpTool: {
      name: "query_code_eval",
      description:
        "Queries code generation and evaluation benchmarks (HumanEval, MBPP, SWE-bench) to extract programming tasks, canonical solutions, and verification unit tests.",
      inputSchema: {
        type: "object",
        properties: {
          benchmark: {
            type: "string",
            enum: ["humaneval", "mbpp", "swe-bench"],
            description:
              "Coding benchmark name: 'humaneval', 'mbpp', or 'swe-bench' (default: 'humaneval').",
          },
          split: {
            type: "string",
            description: "Dataset split: 'test' or 'train' (default: 'test').",
          },
          offset: {
            type: "integer",
            description: "Task offset to start streaming from (default: 0).",
          },
          limit: {
            type: "integer",
            description: "Maximum tasks to return (1-100, default: 20).",
          },
          hfToken: {
            type: "string",
            description: "Optional Hugging Face access token.",
          },
          targetUrl: {
            type: "string",
            description: "Direct API URL or mock endpoint.",
          },
        },
        required: [],
      },
    },
  },
  proofwiki: {
    actorType: "proofwiki",
    name: "proofwiki",
    title: "ProofWiki Mathematical Theorems & Proofs Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests mathematical theorems, axioms, definitions, and step-by-step proof chains from ProofWiki MediaWiki API for LLM reasoning and mathematical proof training.",
    author: "protokol-7",
    tags: [
      "math",
      "mathematics",
      "theorems",
      "proofs",
      "axioms",
      "definitions",
      "proofwiki",
      "formal-logic",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "ProofWiki Girdi Parametreleri",
      description: "ProofWiki teorem, ispat ve tanım ayıklama parametreleri",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Eylem Modu",
          description:
            "Sorgulama modu: 'theorem' (tekil sayfa), 'search' (anahtar kelime), 'random' (rastgele teoremler), 'category' (kategori üyeleri).",
          default: "theorem",
          enum: ["theorem", "search", "random", "category"],
          editor: "select",
        },
        title: {
          name: "title",
          type: "string",
          title: "Teorem / Sayfa Başlığı",
          description: "Çekilecek teorem veya sayfa başlığı (ör. 'Pythagorean Theorem').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Arama Terimi",
          description: "ProofWiki genel arama sorgusu.",
          editor: "textfield",
        },
        category: {
          name: "category",
          type: "string",
          title: "Kategori Adı",
          description: "Listelenecek kategori adı (ör. 'Theorems', 'Definitions', 'Axioms').",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "number",
          title: "Maksimum Sonuç Sayısı",
          description: "Döndürülecek maksimum sonuç adedi (1-50 arası, varsayılan: 10).",
          editor: "number",
          prefill: "10",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Hedef URL",
          description: "Doğrudan ProofWiki sayfa URL'i veya test uç noktası.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Çalıştırılan eylem modu" },
        totalResults: { type: "number", description: "Döndürülen sonuç adedi" },
        items: {
          type: "array",
          description: "Yapılandırılmış teorem, ispat ve kaynak nesneleri",
        },
        queryUrl: { type: "string", description: "Sorgulanan ProofWiki MediaWiki API uç noktası" },
        markdown: {
          type: "string",
          description: "Matematiksel muhakeme eğitimi için biçimlendirilmiş GFM Markdown metni",
        },
      },
    },
    exampleInput: {
      action: "theorem",
      title: "Pythagorean Theorem",
    },
    readme:
      "# ProofWiki Mathematical Theorems & Proofs Harvester\\n\\nProofWiki üzerinden aksiyomlar, tanımlar, teoremler ve adım adım matematiksel ispat zincirlerini çekerek LLM matematiksel akıl yürütme (Chain-of-Thought) ve sembolik muhakeme eğitimine uygun biçimde sunar.",
    mcpTool: {
      name: "query_proofwiki",
      description:
        "Queries ProofWiki to extract mathematical theorems, axioms, definitions, and step-by-step formal and informal proofs.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["theorem", "search", "random", "category"],
            description:
              "Query mode: 'theorem' (single page), 'search' (keyword), 'random' (random articles), 'category' (category members).",
          },
          title: {
            type: "string",
            description: "Theorem or page title (e.g. 'Pythagorean Theorem', 'Euclid\\'s Lemma').",
          },
          query: {
            type: "string",
            description: "Keyword search query.",
          },
          category: {
            type: "string",
            description: "Category name (e.g. 'Theorems', 'Abstract Algebra').",
          },
          limit: {
            type: "integer",
            description: "Maximum results to return (1-50, default: 10).",
          },
          targetUrl: {
            type: "string",
            description: "Direct ProofWiki page URL or mock endpoint.",
          },
        },
        required: [],
      },
    },
  },
  "lean-mathlib": {
    actorType: "lean-mathlib",
    name: "lean-mathlib",
    title: "Lean 4 & Mathlib Computer-Verified Formal Proofs Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests computer-verified formal theorems, lemmas, definitions, and proof tactic steps from Lean 4 and Mathlib4 repositories for symbolic logic and formal verification LLM training.",
    author: "protokol-7",
    tags: [
      "math",
      "formal-verification",
      "lean4",
      "mathlib",
      "theorems",
      "lemmas",
      "tactics",
      "proofs",
      "symbolic-ai",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "Lean 4 & Mathlib Girdi Parametreleri",
      description: "Lean 4 ve Mathlib dosya, teorem ve taktik çıkarma parametreleri",
      properties: {
        action: {
          name: "action",
          title: "Çıkarma Kipi",
          type: "string",
          description:
            "Çıkarma kipi: file (dosya analizi), theorem (spesifik teorem), search (arama) veya random.",
          required: false,
          enum: ["file", "theorem", "search", "random"],
          default: "file",
        },
        repo: {
          name: "repo",
          title: "Lean Ambarı",
          type: "string",
          description: "GitHub ambarı (varsayılan: leanprover-community/mathlib4).",
          required: false,
          default: "leanprover-community/mathlib4",
        },
        path: {
          name: "path",
          title: "Lean Dosya Yolu",
          type: "string",
          description: "Ambar içi .lean dosya yolu (ör. Mathlib/Data/Nat/Basic.lean).",
          required: false,
          default: "Mathlib/Data/Nat/Basic.lean",
        },
        theorem: {
          name: "theorem",
          title: "Teorem / Lemma Adı",
          type: "string",
          description: "Spesifik teorem veya lemma adı (ör. succ_le_succ).",
          required: false,
        },
        query: {
          name: "query",
          title: "Arama Sorgusu",
          type: "string",
          description: "Kod arama anahtar sözcüğü.",
          required: false,
        },
        limit: {
          name: "limit",
          title: "Maksimum Tanım Sayısı",
          type: "number",
          description: "Çıkarılacak maksimum teorem/tanım sayısı (1-100, varsayılan: 20).",
          required: false,
          default: 20,
        },
        githubToken: {
          name: "githubToken",
          title: "GitHub API Belirteci",
          type: "string",
          description: "İsteğe bağlı GitHub Personal Access Token.",
          required: false,
        },
        targetUrl: {
          name: "targetUrl",
          title: "Doğrudan URL",
          type: "string",
          description: "Doğrudan GitHub raw veya mock test URL'si.",
          required: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Çalıştırılan eylem modu" },
        repo: { type: "string", description: "Kaynak ambar" },
        totalDeclarations: { type: "number", description: "Döndürülen tanım adedi" },
        items: {
          type: "array",
          description: "Yapılandırılmış teorem, lemma, tanım ve taktik nesneleri",
        },
        queryUrl: { type: "string", description: "Sorgulanan GitHub veya raw uç noktası" },
        markdown: {
          type: "string",
          description: "Sembolik muhakeme eğitimi için biçimlendirilmiş GFM Markdown metni",
        },
      },
    },
    exampleInput: {
      action: "file",
      repo: "leanprover-community/mathlib4",
      path: "Mathlib/Data/Nat/Basic.lean",
      limit: 20,
    },
    readme:
      "# Lean 4 & Mathlib Computer-Verified Formal Proofs Harvester\\n\\nLean 4 ve Mathlib4 ambarlarından biçimsel olarak doğrulanabilir teorem ifadeleri, lemma tanımları, tip imzaları ve taktik adımlarını (`rw`, `simp`, `exact`, `apply`) çekerek sembolik muhakeme ve formel kanıtlama eğitimine uygun veri çiftleri üretir.",
    mcpTool: {
      name: "query_lean_mathlib",
      description:
        "Queries Lean 4 and Mathlib4 repositories to extract computer-verified formal theorems, lemmas, definitions, and proof tactic steps.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["file", "theorem", "search", "random"],
            description: "Query mode: 'file', 'theorem', 'search', or 'random'.",
          },
          repo: {
            type: "string",
            description: "GitHub repository (default: 'leanprover-community/mathlib4').",
          },
          path: {
            type: "string",
            description: "Path to .lean file (e.g. 'Mathlib/Data/Nat/Basic.lean').",
          },
          theorem: {
            type: "string",
            description: "Specific theorem or lemma name to extract.",
          },
          query: {
            type: "string",
            description: "Keyword search query.",
          },
          limit: {
            type: "integer",
            description: "Maximum declarations to return (1-100, default: 20).",
          },
          githubToken: {
            type: "string",
            description: "Optional GitHub personal access token.",
          },
          targetUrl: {
            type: "string",
            description: "Direct GitHub raw URL or mock endpoint.",
          },
        },
        required: [],
      },
    },
  },
  lesswrong: {
    actorType: "lesswrong",
    name: "lesswrong",
    title: "LessWrong & Alignment Forum Epistemic Rationality Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests epistemic rationality, Bayesian epistemology, AI alignment essays, and dialectic comment trees from LessWrong and Alignment Forum GraphQL APIs for reasoning and philosophical alignment LLM training.",
    author: "protokol-7",
    tags: [
      "rationality",
      "epistemology",
      "alignment",
      "lesswrong",
      "decision-theory",
      "bayes",
      "philosophy",
      "ai-safety",
      "dialectic",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "LessWrong & Alignment Forum Girdi Parametreleri",
      description: "LessWrong ve Alignment Forum yazı ve yorum çıkarma parametreleri",
      properties: {
        action: {
          name: "action",
          title: "Çıkarma Kipi",
          type: "string",
          description:
            "Çıkarma kipi: posts (yazı listesi), post (tek yazı), comments (yorumlar) veya search.",
          required: false,
          enum: ["posts", "post", "comments", "search"],
          default: "posts",
        },
        platform: {
          name: "platform",
          title: "Platform",
          type: "string",
          description: "Hedef platform: lesswrong veya alignmentforum.",
          required: false,
          enum: ["lesswrong", "alignmentforum"],
          default: "lesswrong",
        },
        postId: {
          name: "postId",
          title: "Yazı Kimliği (ID)",
          type: "string",
          description: "Spesifik gönderi kimliği.",
          required: false,
        },
        slug: {
          name: "slug",
          title: "Yazı Başlık Kısaltması (Slug)",
          type: "string",
          description: "Gönderi URL slug'ı.",
          required: false,
        },
        query: {
          name: "query",
          title: "Arama Sorgusu",
          type: "string",
          description: "Yazı veya tartışma arama anahtar sözcüğü.",
          required: false,
        },
        view: {
          name: "view",
          title: "Sıralama Görünümü",
          type: "string",
          description: "Yazı görünümü: curated (küratör onaylı), top veya new.",
          required: false,
          enum: ["curated", "top", "new"],
          default: "curated",
        },
        limit: {
          name: "limit",
          title: "Maksimum Yazı Sayısı",
          type: "number",
          description: "Çıkarılacak maksimum yazı sayısı (1-50, varsayılan: 10).",
          required: false,
          default: 10,
        },
        includeComments: {
          name: "includeComments",
          title: "Yorumları Dahil Et",
          type: "boolean",
          description: "Tek yazı modunda diyalektik yorumları dahil et.",
          required: false,
          default: true,
        },
        maxComments: {
          name: "maxComments",
          title: "Maksimum Yorum Sayısı",
          type: "number",
          description: "Çıkarılacak maksimum yorum sayısı (1-50, varsayılan: 10).",
          required: false,
          default: 10,
        },
        targetUrl: {
          name: "targetUrl",
          title: "Doğrudan URL",
          type: "string",
          description: "Doğrudan LessWrong/AlignmentForum sayfa veya mock test URL'si.",
          required: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Çalıştırılan eylem modu" },
        platform: { type: "string", description: "Kaynak platform (lesswrong / alignmentforum)" },
        totalResults: { type: "number", description: "Döndürülen sonuç adedi" },
        posts: {
          type: "array",
          description: "Yapılandırılmış rasyonalite ve yapay zeka güvenliği makaleleri",
        },
        comments: {
          type: "array",
          description: "Diyalektik yorumlar ve argümantasyon zincirleri",
        },
        queryUrl: { type: "string", description: "Sorgulanan GraphQL uç noktası" },
        markdown: {
          type: "string",
          description: "Epistemik muhakeme eğitimi için biçimlendirilmiş GFM Markdown metni",
        },
      },
    },
    exampleInput: {
      action: "posts",
      platform: "lesswrong",
      view: "curated",
      limit: 10,
    },
    readme:
      "# LessWrong & Alignment Forum Epistemic Rationality Harvester\\n\\nLessWrong ve Alignment Forum GraphQL API üzerinden Bayesyen epistemoloji, karar teorisi, bilişsel önyargılar ve yapay zeka güvenliği/hizalama (alignment) makaleleri ve diyalektik argümantasyon ağaçlarını çıkarır.",
    mcpTool: {
      name: "query_lesswrong",
      description:
        "Queries LessWrong and Alignment Forum GraphQL APIs to extract epistemic rationality, Bayesian reasoning, and AI alignment essays and dialectic comment trees.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["posts", "post", "comments", "search"],
            description:
              "Query mode: 'posts' (list), 'post' (single post), 'comments', or 'search'.",
          },
          platform: {
            type: "string",
            enum: ["lesswrong", "alignmentforum"],
            description: "Target platform: 'lesswrong' or 'alignmentforum'.",
          },
          postId: {
            type: "string",
            description: "Post ID.",
          },
          slug: {
            type: "string",
            description: "Post slug.",
          },
          query: {
            type: "string",
            description: "Search keyword query.",
          },
          view: {
            type: "string",
            enum: ["curated", "top", "new"],
            description: "Posts sorting view: 'curated', 'top', or 'new'.",
          },
          limit: {
            type: "integer",
            description: "Maximum posts to return (1-50, default: 10).",
          },
          includeComments: {
            type: "boolean",
            description: "Whether to include top dialectic comments for single post.",
          },
          maxComments: {
            type: "integer",
            description: "Maximum comments to return (1-50, default: 10).",
          },
          targetUrl: {
            type: "string",
            description: "Direct LessWrong/AlignmentForum URL or mock endpoint.",
          },
        },
        required: [],
      },
    },
  },
  "youtube-transcripts": {
    actorType: "youtube-transcripts",
    name: "youtube-transcripts",
    title: "YouTube Transcripts & Captions Harvester",
    category: "SCRAPING",
    version: "1.0.0",
    description:
      "Extracts captions, transcripts, and metadata from YouTube videos and Shorts with LLM cleaning and multi-format export.",
    author: "Protokol-7",
    tags: ["youtube", "transcripts", "captions", "subtitles", "video", "llm-dataset", "audio-text"],
    inputSchema: {
      type: "object",
      title: "YouTube Transcripts Input Schema",
      description:
        "Configuration parameters for extracting YouTube transcripts and video metadata.",
      properties: {
        urls: {
          name: "urls",
          type: "array",
          title: "YouTube Video URLs or IDs",
          description:
            "List of YouTube video links (watch, youtu.be, shorts, embed) or 11-char video IDs.",
          required: false,
        },
        videoId: {
          name: "videoId",
          type: "string",
          title: "Video ID",
          description: "Single YouTube 11-character video ID.",
          required: false,
        },
        outputFormat: {
          name: "outputFormat",
          type: "string",
          title: "Output Format",
          description:
            "Format of extracted captions: 'captions' (array of strings), 'textWithTimestamps' (segment objects), 'singleStringText' (plain cohesive paragraph), 'xmlWithoutTimestamps', or 'xmlWithTimestamps'.",
          enum: [
            "captions",
            "textWithTimestamps",
            "xmlWithoutTimestamps",
            "xmlWithTimestamps",
            "singleStringText",
          ],
          default: "captions",
        },
        languageCode: {
          name: "languageCode",
          type: "string",
          title: "Preferred Language Code",
          description: "Preferred caption language code (e.g. 'en', 'tr', 'es').",
          default: "en",
        },
        cleanText: {
          name: "cleanText",
          type: "boolean",
          title: "Clean LLM Text",
          description:
            "Strips acoustic cues ([Music], [Applause], [Laughter]), speaker markers, and unescapes HTML entities.",
          default: true,
        },
        channelNameBoolean: {
          name: "channelNameBoolean",
          type: "boolean",
          title: "Include Channel Name",
          description: "Whether to extract publishing channel name.",
          default: false,
        },
        channelIDBoolean: {
          name: "channelIDBoolean",
          type: "boolean",
          title: "Include Channel ID",
          description: "Whether to extract publishing channel stable ID.",
          default: false,
        },
        datePublishedBoolean: {
          name: "datePublishedBoolean",
          type: "boolean",
          title: "Include Publish Date",
          description: "Whether to extract ISO 8601 publish date.",
          default: false,
        },
        dateTextBoolean: {
          name: "dateTextBoolean",
          type: "boolean",
          title: "Include Date Text",
          description: "Whether to extract formatted human-readable date.",
          default: false,
        },
        viewCountBoolean: {
          name: "viewCountBoolean",
          type: "boolean",
          title: "Include View Count",
          description: "Whether to extract video view count.",
          default: false,
        },
        keywordsBoolean: {
          name: "keywordsBoolean",
          type: "boolean",
          title: "Include Keywords / Tags",
          description: "Whether to extract video tags/keywords.",
          default: false,
        },
        thumbnailBoolean: {
          name: "thumbnailBoolean",
          type: "boolean",
          title: "Include Thumbnail URL",
          description: "Whether to extract video thumbnail URL.",
          default: false,
        },
        descriptionBoolean: {
          name: "descriptionBoolean",
          type: "boolean",
          title: "Include Description",
          description: "Whether to extract video description text.",
          default: false,
        },
        preferBrowser: {
          name: "preferBrowser",
          type: "boolean",
          title: "Force Headless Browser Engine",
          description: "Forces Playwright Chromium engine instead of lightweight HTTP.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalProcessed: {
          type: "number",
          description: "Total number of video URLs processed.",
        },
        successfulCount: {
          type: "number",
          description: "Number of successfully harvested video transcripts.",
        },
        failedCount: {
          type: "number",
          description: "Number of failed or captionless videos.",
        },
        records: {
          type: "array",
          description: "List of processed video records containing captions and metadata.",
        },
        markdown: {
          type: "string",
          description: "Consolidated GFM Markdown report.",
        },
      },
    },
    exampleInput: {
      urls: ["https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
      outputFormat: "captions",
      cleanText: true,
      channelNameBoolean: true,
      datePublishedBoolean: true,
    },
    readme:
      "# YouTube Transcripts & Captions Harvester\\n\\nExtracts captions, timestamped transcripts, and video metadata from YouTube videos and Shorts with LLM text cleaning, dual-engine HTTP/Playwright execution, and multi-format export.",
    mcpTool: {
      name: "query_youtube_transcripts",
      description:
        "Harvests transcripts, captions, and metadata from YouTube videos and Shorts with LLM noise cleaning and multi-format export.",
      inputSchema: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "List of YouTube video URLs (watch, youtu.be, shorts) or video IDs.",
          },
          videoId: {
            type: "string",
            description: "Single YouTube 11-character video ID.",
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
            description:
              "Transcript format: 'captions' (array of lines), 'textWithTimestamps', 'singleStringText', or 'xml'.",
          },
          languageCode: {
            type: "string",
            description: "Preferred language code (e.g. 'en', 'tr'). Default: 'en'.",
          },
          cleanText: {
            type: "boolean",
            description:
              "Whether to strip auditory markers ([Music], [Applause]) and speaker tags for clean LLM datasets.",
          },
          channelNameBoolean: {
            type: "boolean",
            description: "Whether to include publishing channel name.",
          },
          channelIDBoolean: {
            type: "boolean",
            description: "Whether to include publishing channel ID.",
          },
          datePublishedBoolean: {
            type: "boolean",
            description: "Whether to include publication date (ISO 8601).",
          },
          viewCountBoolean: {
            type: "boolean",
            description: "Whether to include view count text.",
          },
          keywordsBoolean: {
            type: "boolean",
            description: "Whether to include video tags and keywords.",
          },
          descriptionBoolean: {
            type: "boolean",
            description: "Whether to include video description.",
          },
          preferBrowser: {
            type: "boolean",
            description: "Whether to force Playwright Chromium engine.",
          },
          targetUrl: {
            type: "string",
            description: "Direct YouTube URL or mock endpoint.",
          },
        },
        required: [],
      },
    },
  },
  wikisource: {
    actorType: "wikisource",
    name: "wikisource",
    title: "Wikisource Historical & Literary Texts Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests verified primary literary, historical, legal, and philosophical texts, speeches, and treaties across all 85+ language editions from official Wikisource REST and Action APIs.",
    author: "Protokol-7",
    tags: [
      "wikisource",
      "wikimedia",
      "literature",
      "history",
      "primary-sources",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikisource Harvester Input",
      description: "Wikisource REST and Action API parameters across 85+ languages.",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "Work or Chapter Title",
          description: "Canonical title of the Wikisource page, book, poem, or speech.",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description:
            "Language code (e.g. 'en', 'tr', 'la', 'sa', 'ang', 'de', 'fr', 'zh', 'ru', 'mul'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description:
            "Extraction mode: summary, article (Parsoid HTML-to-GFM markdown), or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search expression for discovering primary works and authors.",
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
        fetchFullArticles: {
          name: "fetchFullArticles",
          type: "boolean",
          title: "Fetch Full Articles",
          description:
            "When performing a search, fetch and convert full Parsoid HTML markdown for each result.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted works, extracts, and full markdown texts",
        },
        queryUrl: { type: "string", description: "Constructed Wikisource API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      title: "De bello Gallico",
      lang: "la",
      action: "summary",
    },
    readme: `# Wikisource Harvester\n\nHarvests verified primary literary, historical, legal, and philosophical texts, speeches, and treaties across all 85+ language editions from official Wikisource REST and Action APIs.`,
    mcpTool: {
      name: "query_wikisource",
      description:
        "Query official Wikimedia Wikisource REST APIs for historical documents, philosophical essays, speeches, and literary classics converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Work or chapter title (e.g. 'De bello Gallico', 'Nutuk')",
          },
          lang: {
            type: "string",
            description: "Language code (e.g. 'la', 'tr', 'en', 'sa', 'ang', 'mul')",
          },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Extraction mode: summary, article, or search",
          },
          query: {
            type: "string",
            description: "Search keyword for finding historical works",
          },
          limit: { type: "number", description: "Maximum search items to return" },
          fetchFullArticles: {
            type: "boolean",
            description: "Fetch full article markdown for search hits",
          },
          targetUrl: { type: "string", description: "Direct Wikisource URL" },
        },
        required: [],
      },
    },
  },
  wiktionary: {
    actorType: "wiktionary",
    name: "wiktionary",
    title: "Wiktionary Multi-Language Lexical Extractor",
    category: "API",
    version: "1.0.0",
    description:
      "Queries official Wikimedia Wiktionary REST and Action APIs across 198+ languages for lexical definitions, etymology, parts of speech, and translations.",
    author: "Protokol-7",
    tags: [
      "wiktionary",
      "wikimedia",
      "dictionary",
      "lexicon",
      "etymology",
      "nlp",
      "llm-dataset",
      "translations",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "WiktionaryActorOptions",
      description: "Options for querying Wikimedia Wiktionary lexical API",
      properties: {
        word: {
          name: "word",
          type: "string",
          title: "Word / Lemma",
          description: "Target word, term, or idiom (e.g. 'algorithm', 'kitap', 'lingua')",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description: "Wiktionary language edition code (e.g. 'en', 'tr', 'la', 'fr', 'de')",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description: "Extraction mode: definition, entry, search, or random",
          default: "definition",
          enum: ["definition", "entry", "search", "random"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search keyword for finding dictionary words",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "number",
          title: "Result Limit",
          description: "Maximum search or random items to return",
          default: 10,
          editor: "number",
        },
        extractMarkdown: {
          name: "extractMarkdown",
          type: "boolean",
          title: "Extract Markdown",
          description: "Convert HTML definitions and entries to clean GFM Markdown",
          default: true,
          editor: "checkbox",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct Wiktionary URL to parse",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted lexical entries, parts of speech, and definitions",
        },
        queryUrl: { type: "string", description: "Constructed Wiktionary API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      word: "algorithm",
      lang: "en",
      action: "definition",
    },
    readme: `# Wiktionary Lexical Extractor\n\nHarvests dictionary definitions, parts of speech, examples, and etymology across 198+ language editions from official Wikimedia Wiktionary REST and Action APIs.`,
    mcpTool: {
      name: "query_wiktionary",
      description:
        "Query official Wikimedia Wiktionary REST APIs for dictionary definitions, etymologies, parts of speech, and translations converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          word: {
            type: "string",
            description: "Word or phrase to define (e.g. 'algorithm', 'kitap')",
          },
          lang: {
            type: "string",
            description: "Language edition code (e.g. 'en', 'tr', 'la', 'fr', 'de')",
          },
          action: {
            type: "string",
            enum: ["definition", "entry", "search", "random"],
            description: "Extraction mode: definition, entry, search, or random",
          },
          query: {
            type: "string",
            description: "Search keyword for finding dictionary words",
          },
          limit: { type: "number", description: "Maximum items to return" },
          extractMarkdown: {
            type: "boolean",
            description: "Convert HTML to clean GFM markdown",
          },
          targetUrl: { type: "string", description: "Direct Wiktionary URL" },
        },
        required: [],
      },
    },
  },
  wikiquote: {
    actorType: "wikiquote",
    name: "wikiquote",
    title: "Wikiquote Quotations & Aphorisms Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests verified quotations, speeches, aphorisms, and literary dialogue across 90+ language editions from official Wikiquote REST and Action APIs.",
    author: "Protokol-7",
    tags: [
      "wikiquote",
      "wikimedia",
      "quotes",
      "aphorisms",
      "proverbs",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikiquote Harvester Input",
      description: "Wikiquote REST and Action API parameters across 90+ languages.",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "Author or Topic Title",
          description: "Canonical title of the Wikiquote page, author, or topic.",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description: "Language code (e.g. 'en', 'tr', 'de', 'fr', 'it'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: summary, article, or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search expression for discovering quotes and authors.",
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
        fetchFullArticles: {
          name: "fetchFullArticles",
          type: "boolean",
          title: "Fetch Full Articles",
          description:
            "When performing a search, fetch and convert full Parsoid HTML markdown for each result.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted quotes, extracts, and full markdown texts",
        },
        queryUrl: { type: "string", description: "Constructed Wikiquote API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      title: "Albert Einstein",
      lang: "en",
      action: "summary",
    },
    readme: `# Wikiquote Harvester\n\nHarvests verified quotations, speeches, aphorisms, and literary dialogue across 90+ language editions from official Wikiquote REST and Action APIs.`,
    mcpTool: {
      name: "query_wikiquote",
      description:
        "Query official Wikimedia Wikiquote REST APIs for verified quotations, speeches, and aphorisms converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Author, work, or topic title (e.g. 'Albert Einstein', 'Adalet')",
          },
          lang: {
            type: "string",
            description: "Language code (e.g. 'en', 'tr', 'de', 'fr')",
          },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Extraction mode: summary, article, or search",
          },
          query: {
            type: "string",
            description: "Search query for quote discovery",
          },
          limit: { type: "number", description: "Maximum search results" },
          fetchFullArticles: {
            type: "boolean",
            description: "Fetch full article markdown for search hits",
          },
          targetUrl: { type: "string", description: "Direct Wikiquote URL" },
        },
        required: [],
      },
    },
  },
  wikibooks: {
    actorType: "wikibooks",
    name: "wikibooks",
    title: "Wikibooks Open Textbooks Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests open-access textbooks, pedagogical modules, and technical manuals across 120+ language editions from official Wikibooks REST and Action APIs.",
    author: "Protokol-7",
    tags: [
      "wikibooks",
      "wikimedia",
      "textbooks",
      "stem",
      "manuals",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikibooks Harvester Input",
      description: "Wikibooks REST and Action API parameters across 120+ languages.",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "Textbook or Chapter Title",
          description: "Canonical title of the Wikibooks textbook or chapter.",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description: "Language code (e.g. 'en', 'tr', 'de', 'fr'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: summary, article, or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search expression for discovering textbooks.",
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
        fetchFullArticles: {
          name: "fetchFullArticles",
          type: "boolean",
          title: "Fetch Full Articles",
          description:
            "When performing a search, fetch and convert full Parsoid HTML markdown for each result.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted textbooks, extracts, and full markdown texts",
        },
        queryUrl: { type: "string", description: "Constructed Wikibooks API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      title: "Python Programming",
      lang: "en",
      action: "summary",
    },
    readme: `# Wikibooks Harvester\n\nHarvests open-access textbooks, pedagogical modules, and technical manuals across 120+ language editions from official Wikibooks REST and Action APIs.`,
    mcpTool: {
      name: "query_wikibooks",
      description:
        "Query official Wikimedia Wikibooks REST APIs for open textbooks, academic guides, and technical manuals converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Textbook or chapter title (e.g. 'Python Programming')",
          },
          lang: {
            type: "string",
            description: "Language code (e.g. 'en', 'tr', 'de', 'fr')",
          },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Extraction mode: summary, article, or search",
          },
          query: {
            type: "string",
            description: "Search query for textbook discovery",
          },
          limit: { type: "number", description: "Maximum search results" },
          fetchFullArticles: {
            type: "boolean",
            description: "Fetch full article markdown for search hits",
          },
          targetUrl: { type: "string", description: "Direct Wikibooks URL" },
        },
        required: [],
      },
    },
  },
  wikiversity: {
    actorType: "wikiversity",
    name: "wikiversity",
    title: "Wikiversity Academic Courses Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests university course modules, academic study guides, and research outlines across 17+ language editions from official Wikiversity REST and Action APIs.",
    author: "Protokol-7",
    tags: [
      "wikiversity",
      "wikimedia",
      "courses",
      "university",
      "curricula",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikiversity Harvester Input",
      description: "Wikiversity REST and Action API parameters across 17+ languages.",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "Course or Module Title",
          description: "Canonical title of the Wikiversity course, lesson, or study guide.",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description:
            "Language code (e.g. 'en', 'de', 'fr', 'it', 'es', 'pt', 'cs'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: summary, article, or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search expression for discovering course modules.",
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
        fetchFullArticles: {
          name: "fetchFullArticles",
          type: "boolean",
          title: "Fetch Full Articles",
          description:
            "When performing a search, fetch and convert full Parsoid HTML markdown for each result.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted course modules, extracts, and full markdown texts",
        },
        queryUrl: { type: "string", description: "Constructed Wikiversity API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      title: "Introduction to Computer Science",
      lang: "en",
      action: "summary",
    },
    readme: `# Wikiversity Harvester\n\nHarvests university course modules, academic study guides, and research outlines across 17+ language editions from official Wikiversity REST and Action APIs.`,
    mcpTool: {
      name: "query_wikiversity",
      description:
        "Query official Wikimedia Wikiversity REST APIs for university course modules, lecture notes, and study guides converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Course or module title (e.g. 'Introduction to Computer Science')",
          },
          lang: {
            type: "string",
            description: "Language code (e.g. 'en', 'de', 'fr')",
          },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Extraction mode: summary, article, or search",
          },
          query: {
            type: "string",
            description: "Search query for course discovery",
          },
          limit: { type: "number", description: "Maximum search results" },
          fetchFullArticles: {
            type: "boolean",
            description: "Fetch full article markdown for search hits",
          },
          targetUrl: { type: "string", description: "Direct Wikiversity URL" },
        },
        required: [],
      },
    },
  },
  wikivoyage: {
    actorType: "wikivoyage",
    name: "wikivoyage",
    title: "Wikivoyage Travel & Geographic Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests comprehensive geographic guides, city profiles, cultural landmarks, and travel itineraries across 30+ language editions from official Wikivoyage REST and Action APIs.",
    author: "Protokol-7",
    tags: [
      "wikivoyage",
      "wikimedia",
      "travel",
      "geography",
      "culture",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikivoyage Harvester Input",
      description: "Wikivoyage REST and Action API parameters across 30+ languages.",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "Destination or Guide Title",
          description: "Canonical title of the Wikivoyage destination, city, or route.",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description: "Language code (e.g. 'en', 'tr', 'de', 'fr', 'it', 'es'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: summary, article, or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search expression for discovering destinations.",
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
        fetchFullArticles: {
          name: "fetchFullArticles",
          type: "boolean",
          title: "Fetch Full Articles",
          description:
            "When performing a search, fetch and convert full Parsoid HTML markdown for each result.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted destinations, guides, and full markdown texts",
        },
        queryUrl: { type: "string", description: "Constructed Wikivoyage API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      title: "Istanbul",
      lang: "en",
      action: "summary",
    },
    readme: `# Wikivoyage Harvester\n\nHarvests comprehensive geographic guides, city profiles, cultural landmarks, and travel itineraries across 30+ language editions from official Wikivoyage REST and Action APIs.`,
    mcpTool: {
      name: "query_wikivoyage",
      description:
        "Query official Wikimedia Wikivoyage REST APIs for destination profiles, travel guides, and cultural landmarks converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Destination or guide title (e.g. 'Istanbul', 'Tokyo', 'Rome')",
          },
          lang: {
            type: "string",
            description: "Language code (e.g. 'en', 'tr', 'de', 'fr')",
          },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Extraction mode: summary, article, or search",
          },
          query: {
            type: "string",
            description: "Search query for destination discovery",
          },
          limit: { type: "number", description: "Maximum search results" },
          fetchFullArticles: {
            type: "boolean",
            description: "Fetch full article markdown for search hits",
          },
          targetUrl: { type: "string", description: "Direct Wikivoyage URL" },
        },
        required: [],
      },
    },
  },
  wikinews: {
    actorType: "wikinews",
    name: "wikinews",
    title: "Wikinews Journalism & News Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests collaborative journalism, news articles, historical dispatches, and event timelines across 35+ language editions from official Wikinews REST and Action APIs.",
    author: "Protokol-7",
    tags: [
      "wikinews",
      "wikimedia",
      "journalism",
      "news",
      "events",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikinews Harvester Input",
      description: "Wikinews REST and Action API parameters across 35+ languages.",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "News Article Title",
          description: "Canonical title of the Wikinews article or dispatch.",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description:
            "Language code (e.g. 'en', 'tr', 'de', 'fr', 'es', 'ru', 'pt'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: summary, article, or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search expression for discovering news dispatches.",
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
        fetchFullArticles: {
          name: "fetchFullArticles",
          type: "boolean",
          title: "Fetch Full Articles",
          description:
            "When performing a search, fetch and convert full Parsoid HTML markdown for each result.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        lang: { type: "string", description: "Target language code" },
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted news dispatches, extracts, and full markdown texts",
        },
        queryUrl: { type: "string", description: "Constructed Wikinews API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      title: "James Webb Space Telescope",
      lang: "en",
      action: "summary",
    },
    readme: `# Wikinews Harvester\n\nHarvests collaborative journalism, news articles, historical dispatches, and event timelines across 35+ language editions from official Wikinews REST and Action APIs.`,
    mcpTool: {
      name: "query_wikinews",
      description:
        "Query official Wikimedia Wikinews REST APIs for collaborative journalism dispatches and event timelines converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "News article or dispatch title",
          },
          lang: {
            type: "string",
            description: "Language code (e.g. 'en', 'tr', 'de', 'fr')",
          },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Extraction mode: summary, article, or search",
          },
          query: {
            type: "string",
            description: "Search query for news dispatch discovery",
          },
          limit: { type: "number", description: "Maximum search results" },
          fetchFullArticles: {
            type: "boolean",
            description: "Fetch full article markdown for search hits",
          },
          targetUrl: { type: "string", description: "Direct Wikinews URL" },
        },
        required: [],
      },
    },
  },
  wikispecies: {
    actorType: "wikispecies",
    name: "wikispecies",
    title: "Wikispecies Taxonomic Nomenclature Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests biological classifications, phylogenetic clades, synonyms, and taxonomic nomenclature from official Wikimedia Wikispecies APIs on species.wikimedia.org.",
    author: "Protokol-7",
    tags: [
      "wikispecies",
      "wikimedia",
      "taxonomy",
      "biology",
      "clades",
      "species",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikispecies Harvester Input",
      description: "Wikispecies REST and Action API parameters on species.wikimedia.org.",
      properties: {
        title: {
          name: "title",
          type: "string",
          title: "Taxon or Scientific Name",
          description: "Canonical scientific name or taxon (e.g. 'Panthera leo', 'Homo sapiens').",
          editor: "textfield",
        },
        taxon: {
          name: "taxon",
          type: "string",
          title: "Taxon Alias",
          description: "Alias for taxon or scientific name.",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: summary, article, or search.",
          default: "summary",
          enum: ["summary", "article", "search"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search expression for discovering species and taxa.",
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
        fetchFullArticles: {
          name: "fetchFullArticles",
          type: "boolean",
          title: "Fetch Full Articles",
          description:
            "When performing a search, fetch and convert full Parsoid HTML markdown for each result.",
          default: false,
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted taxa, classifications, and full markdown profiles",
        },
        queryUrl: { type: "string", description: "Constructed Wikispecies API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      taxon: "Panthera leo",
      action: "summary",
    },
    readme: `# Wikispecies Harvester\n\nHarvests biological classifications, phylogenetic clades, synonyms, and taxonomic nomenclature from official Wikimedia Wikispecies APIs on species.wikimedia.org.`,
    mcpTool: {
      name: "query_wikispecies",
      description:
        "Query official Wikimedia Wikispecies REST APIs on species.wikimedia.org for biological taxonomy, species clades, and nomenclature converted to clean GFM markdown.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Taxon or scientific name (e.g. 'Panthera leo', 'Homo sapiens')",
          },
          taxon: {
            type: "string",
            description: "Taxon name alias",
          },
          action: {
            type: "string",
            enum: ["summary", "article", "search"],
            description: "Extraction mode: summary, article, or search",
          },
          query: {
            type: "string",
            description: "Search query for taxonomic discovery",
          },
          limit: { type: "number", description: "Maximum search results" },
          fetchFullArticles: {
            type: "boolean",
            description: "Fetch full article markdown for search hits",
          },
          targetUrl: { type: "string", description: "Direct Wikispecies URL" },
        },
        required: [],
      },
    },
  },
  wikidata: {
    actorType: "wikidata",
    name: "wikidata",
    title: "Wikidata Structured Knowledge Graph Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests structured knowledge graph entities, Q-IDs, P-IDs, claims, statements, and executes SPARQL queries against official Wikidata APIs.",
    author: "Protokol-7",
    tags: [
      "wikidata",
      "wikimedia",
      "knowledge-graph",
      "sparql",
      "entities",
      "triples",
      "llm-dataset",
      "corpus",
      "markdown",
    ],
    inputSchema: {
      type: "object",
      title: "Wikidata Harvester Input",
      description: "Wikidata Action API, EntityData, and SPARQL query parameters.",
      properties: {
        entityId: {
          name: "entityId",
          type: "string",
          title: "Entity ID (QID/PID)",
          description: "Wikidata identifier (e.g. 'Q42', 'Q5', 'P31').",
          editor: "textfield",
        },
        action: {
          name: "action",
          type: "string",
          title: "Action",
          description: "Extraction mode: entity, search, sparql, or claims.",
          default: "entity",
          enum: ["entity", "search", "sparql", "claims"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search keyword for finding entities via wbsearchentities.",
          editor: "textfield",
        },
        sparql: {
          name: "sparql",
          type: "string",
          title: "SPARQL Query",
          description: "SPARQL query string for query.wikidata.org.",
          editor: "textarea",
        },
        propertyId: {
          name: "propertyId",
          type: "string",
          title: "Property ID Filter",
          description: "Filter specific claims property (e.g. 'P31', 'P279').",
          editor: "textfield",
        },
        lang: {
          name: "lang",
          type: "string",
          title: "Language Code",
          description:
            "Language code for entity labels and descriptions (e.g. 'en', 'tr'). Defaults to 'en'.",
          default: "en",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search or query results to return.",
          default: 10,
          editor: "number",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed extraction mode" },
        items: {
          type: "array",
          description: "Array of extracted entities, labels, descriptions, and claims",
        },
        sparqlResults: {
          type: "object",
          description: "SPARQL JSON query result bindings",
        },
        queryUrl: { type: "string", description: "Constructed Wikidata API URL" },
        markdown: { type: "string", description: "GFM markdown formatted summary report" },
      },
    },
    exampleInput: {
      entityId: "Q42",
      lang: "en",
      action: "entity",
    },
    readme: `# Wikidata Harvester\n\nHarvests structured knowledge graph entities, Q-IDs, P-IDs, claims, statements, and executes SPARQL queries against official Wikidata APIs.`,
    mcpTool: {
      name: "query_wikidata",
      description:
        "Query official Wikimedia Wikidata APIs and SPARQL endpoint for structured knowledge graph entities, claims, labels, and semantic triples.",
      inputSchema: {
        type: "object",
        properties: {
          entityId: {
            type: "string",
            description: "Wikidata entity or property ID (e.g. 'Q42', 'P31')",
          },
          action: {
            type: "string",
            enum: ["entity", "search", "sparql", "claims"],
            description: "Extraction mode: entity, search, sparql, or claims",
          },
          query: {
            type: "string",
            description: "Entity search query for wbsearchentities",
          },
          sparql: {
            type: "string",
            description: "SPARQL query string for semantic graph traversal",
          },
          propertyId: {
            type: "string",
            description: "Optional property filter (e.g. 'P31' for instance of)",
          },
          lang: {
            type: "string",
            description: "Language code for labels (e.g. 'en', 'tr')",
          },
          limit: { type: "number", description: "Maximum items to return" },
          targetUrl: { type: "string", description: "Direct Wikidata URL" },
        },
        required: [],
      },
    },
  },
  "stanford-phil": {
    name: "stanford-phil",
    actorType: "stanford-phil",
    title: "Stanford Encyclopedia of Philosophy (SEP) Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests peer-reviewed philosophical entries, bibliographies, conceptual argumentation outlines, and related topics from the Stanford Encyclopedia of Philosophy (SEP).",
    author: "protokol-7",
    tags: [
      "philosophy",
      "logic",
      "epistemology",
      "ethics",
      "metaphysics",
      "sep",
      "stanford",
      "reasoning",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "Stanford Encyclopedia of Philosophy Input Parameters",
      description: "Parameters for harvesting SEP articles and bibliographies",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Extraction mode: 'entry' (default article), 'search' (keyword search), 'contents' (alphabetical index).",
          default: "entry",
          enum: ["entry", "search", "contents"],
          editor: "select",
        },
        slug: {
          name: "slug",
          type: "string",
          title: "Entry Slug",
          description:
            "SEP entry slug (e.g. 'goedel-incompleteness', 'logic-modal', 'epistemology').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword search query for SEP entries.",
          editor: "textfield",
        },
        letter: {
          name: "letter",
          type: "string",
          title: "Index Letter",
          description: "Alphabetical index letter for browsing entries (e.g. 'a', 'g').",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search or content results to return (1-100).",
          default: 20,
          editor: "number",
        },
        includeBibliography: {
          name: "includeBibliography",
          type: "boolean",
          title: "Include Bibliography",
          description: "Whether to extract academic citations and bibliography.",
          default: true,
          editor: "checkbox",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct SEP entry or search URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed extraction mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        entry: {
          type: "object",
          description: "Extracted article, authors, outline, sections, and bibliography",
        },
        searchResults: { type: "array", description: "Search result listings" },
        markdown: { type: "string", description: "GFM markdown formatted treatise" },
      },
    },
    exampleInput: {
      slug: "goedel-incompleteness",
      action: "entry",
    },
    readme:
      "# Stanford Encyclopedia of Philosophy Harvester\n\nHarvests peer-reviewed philosophical entries, bibliographies, conceptual argumentation outlines, and related topics from the Stanford Encyclopedia of Philosophy (SEP) for advanced LLM reasoning, epistemology, and logic datasets.",
    mcpTool: {
      name: "query_stanford_phil",
      description:
        "Queries Stanford Encyclopedia of Philosophy (SEP) for peer-reviewed philosophical entries, outlines, bibliographies, and concepts.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "SEP entry slug (e.g. 'goedel-incompleteness', 'logic-modal')",
          },
          action: {
            type: "string",
            enum: ["entry", "search", "contents"],
            description: "Extraction mode: entry, search, or contents",
          },
          query: {
            type: "string",
            description: "Search keyword query",
          },
          limit: { type: "number", description: "Maximum search items to return" },
          targetUrl: { type: "string", description: "Direct SEP URL" },
        },
        required: [],
      },
    },
  },
  "internet-phil": {
    name: "internet-phil",
    actorType: "internet-phil",
    title: "Internet Encyclopedia of Philosophy (IEP) Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests peer-reviewed academic philosophy articles, conceptual outlines, author attributions, and references from the Internet Encyclopedia of Philosophy (IEP).",
    author: "protokol-7",
    tags: [
      "philosophy",
      "logic",
      "iep",
      "ethics",
      "epistemology",
      "science-philosophy",
      "reasoning",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "Internet Encyclopedia of Philosophy Input Parameters",
      description: "Parameters for harvesting IEP articles and references",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description: "Extraction mode: 'entry' (default article), 'search' (keyword search).",
          default: "entry",
          enum: ["entry", "search"],
          editor: "select",
        },
        slug: {
          name: "slug",
          type: "string",
          title: "Article Slug",
          description: "IEP article slug (e.g. 'goedel', 'prop-log', 'ethics').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword search query for IEP articles.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search results to return.",
          default: 20,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct IEP article or search URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed extraction mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        entry: {
          type: "object",
          description: "Extracted article, author, outline, sections, and references",
        },
        searchResults: { type: "array", description: "Search result listings" },
        markdown: { type: "string", description: "GFM markdown formatted article" },
      },
    },
    exampleInput: {
      slug: "goedel",
      action: "entry",
    },
    readme:
      "# Internet Encyclopedia of Philosophy Harvester\n\nHarvests peer-reviewed academic philosophy articles, conceptual outlines, author attributions, and references from the Internet Encyclopedia of Philosophy (IEP).",
    mcpTool: {
      name: "query_internet_phil",
      description:
        "Queries Internet Encyclopedia of Philosophy (IEP) for peer-reviewed articles, conceptual outlines, author attributions, and references.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "IEP article slug (e.g. 'goedel', 'prop-log')",
          },
          action: {
            type: "string",
            enum: ["entry", "search"],
            description: "Extraction mode: entry or search",
          },
          query: {
            type: "string",
            description: "Search keyword query",
          },
          limit: { type: "number", description: "Maximum search items to return" },
          targetUrl: { type: "string", description: "Direct IEP URL" },
        },
        required: [],
      },
    },
  },
  metamath: {
    name: "metamath",
    actorType: "metamath",
    title: "Metamath Formal Proof Explorer Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests formal mathematical proofs, axioms, hypotheses, and step-by-step verification chains from the Metamath Proof Explorer databases (set.mm, iset.mm, ql.mm).",
    author: "protokol-7",
    tags: [
      "math",
      "formal-logic",
      "metamath",
      "proof-verification",
      "zfc",
      "axioms",
      "theorems",
      "chain-of-thought",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "Metamath Proof Explorer Input Parameters",
      description: "Parameters for harvesting formal mathematical proofs and theorems",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description: "Extraction mode: 'theorem' (default), 'search' (find theorems), 'axiom'.",
          default: "theorem",
          enum: ["theorem", "search", "axiom"],
          editor: "select",
        },
        theorem: {
          name: "theorem",
          type: "string",
          title: "Theorem Symbol",
          description: "Metamath theorem name (e.g. 'mpc2', 'dtru', 'pythag').",
          editor: "textfield",
        },
        axiom: {
          name: "axiom",
          type: "string",
          title: "Axiom Symbol",
          description: "Metamath axiom name (e.g. 'ax-1', 'ax-mp').",
          editor: "textfield",
        },
        database: {
          name: "database",
          type: "string",
          title: "Database Explorer",
          description:
            "Metamath database: 'set.mm' (ZFC classical), 'iset.mm' (intuitionistic), 'ql.mm' (quantum logic).",
          default: "set.mm",
          enum: ["set.mm", "iset.mm", "ql.mm"],
          editor: "select",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search theorem names or symbols.",
          editor: "textfield",
        },
        includeProofSteps: {
          name: "includeProofSteps",
          type: "boolean",
          title: "Include Proof Steps",
          description: "Whether to extract step-by-step formal verification table.",
          default: true,
          editor: "checkbox",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search items to return.",
          default: 20,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct Metamath theorem HTML URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed extraction mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        theorem: {
          type: "object",
          description:
            "Extracted theorem, hypotheses, assertion, proof steps, and cross-references",
        },
        searchResults: { type: "array", description: "Search result listings" },
        markdown: { type: "string", description: "GFM markdown formal proof report" },
      },
    },
    exampleInput: {
      theorem: "mpc2",
      database: "set.mm",
      action: "theorem",
    },
    readme:
      "# Metamath Proof Explorer Harvester\n\nHarvests formal mathematical proofs, axioms, hypotheses, and step-by-step verification chains from the Metamath Proof Explorer databases (set.mm, iset.mm, ql.mm) for formal theorem proving and symbolic reasoning datasets.",
    mcpTool: {
      name: "query_metamath",
      description:
        "Queries Metamath Proof Explorer for formal mathematical proofs, axioms, hypotheses, and step-by-step verification chains.",
      inputSchema: {
        type: "object",
        properties: {
          theorem: {
            type: "string",
            description: "Metamath theorem symbol (e.g. 'mpc2', 'pythag')",
          },
          action: {
            type: "string",
            enum: ["theorem", "search", "axiom"],
            description: "Extraction mode: theorem, search, or axiom",
          },
          database: {
            type: "string",
            enum: ["set.mm", "iset.mm", "ql.mm"],
            description: "Database explorer: set.mm, iset.mm, or ql.mm",
          },
          query: {
            type: "string",
            description: "Search query for theorems",
          },
          includeProofSteps: {
            type: "boolean",
            description: "Whether to include step-by-step formal proof table",
          },
          limit: { type: "number", description: "Maximum search items to return" },
          targetUrl: { type: "string", description: "Direct Metamath theorem URL" },
        },
        required: [],
      },
    },
  },
  philpapers: {
    name: "philpapers",
    actorType: "philpapers",
    title: "PhilPapers Philosophical Research Archive Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests academic philosophy citations, abstracts, publication metadata, and category taxonomies from the PhilPapers Archive (2.5M+ publications).",
    author: "protokol-7",
    tags: [
      "philosophy",
      "citations",
      "abstracts",
      "bibliography",
      "philpapers",
      "taxonomy",
      "academic-papers",
      "llm-training",
    ],
    inputSchema: {
      type: "object",
      title: "PhilPapers Archive Input Parameters",
      description:
        "Parameters for harvesting PhilPapers records, search results, and category trees",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Extraction mode: 'record' (default publication metadata), 'search' (keyword search), 'category' (browse category).",
          default: "record",
          enum: ["record", "search", "category"],
          editor: "select",
        },
        id: {
          name: "id",
          type: "string",
          title: "Record ID",
          description: "PhilPapers record identifier (e.g. 'CHADCO').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword search query for philosophical publications.",
          editor: "textfield",
        },
        category: {
          name: "category",
          type: "string",
          title: "Category Slug",
          description: "PhilPapers taxonomy category (e.g. 'epistemology', 'philosophy-of-mind').",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search or category results to return.",
          default: 20,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct PhilPapers record or search URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed extraction mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        record: {
          type: "object",
          description: "Extracted publication record, authors, abstract, and categories",
        },
        searchResults: { type: "array", description: "Search result listings" },
        categoryDetails: {
          type: "object",
          description: "Category taxonomy details and subcategories",
        },
        markdown: { type: "string", description: "GFM markdown formatted report" },
      },
    },
    exampleInput: {
      id: "CHADCO",
      action: "record",
    },
    readme:
      "# PhilPapers Archive Harvester\n\nHarvests academic philosophy citations, abstracts, publication metadata, and category taxonomies from the PhilPapers Archive (over 2.5 million publications) for academic reasoning and philosophical research datasets.",
    mcpTool: {
      name: "query_philpapers",
      description:
        "Queries PhilPapers Archive for philosophical research publications, abstracts, citations, and taxonomy categories.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "PhilPapers record ID (e.g. 'CHADCO')",
          },
          action: {
            type: "string",
            enum: ["record", "search", "category"],
            description: "Extraction mode: record, search, or category",
          },
          query: {
            type: "string",
            description: "Search keyword query",
          },
          category: {
            type: "string",
            description: "Category slug (e.g. 'epistemology')",
          },
          limit: { type: "number", description: "Maximum items to return" },
          targetUrl: { type: "string", description: "Direct PhilPapers URL" },
        },
        required: [],
      },
    },
  },
  devdocs: {
    name: "devdocs",
    actorType: "devdocs",
    title: "DevDocs Developer Documentation Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Harvests official developer documentation, API references, guides, and docset indexes across 100+ technologies from DevDocs.",
    author: "protokol-7",
    tags: [
      "devdocs",
      "documentation",
      "api-reference",
      "programming",
      "developer-knowledge",
      "llm-pretraining",
      "code-docs",
    ],
    inputSchema: {
      type: "object",
      title: "DevDocs Harvester Input Parameters",
      description:
        "Parameters for querying DevDocs docsets, search indexes, and documentation entries",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Extraction mode: 'list_docs' (directory of docsets), 'search' (keyword search in docset), 'entry' (full doc page).",
          default: "list_docs",
          enum: ["list_docs", "search", "entry"],
          editor: "select",
        },
        doc: {
          name: "doc",
          type: "string",
          title: "Docset Slug",
          description:
            "Target docset slug (e.g. 'rust', 'python~3.12', 'javascript', 'go', 'cpp').",
          editor: "textfield",
        },
        path: {
          name: "path",
          type: "string",
          title: "Entry Path",
          description:
            "Relative path to entry within docset (e.g. 'book/ch01-00-getting-started', 'std/collections/struct.hashmap').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search keyword within the selected docset or documentation catalog.",
          editor: "textfield",
        },
        category: {
          name: "category",
          type: "string",
          title: "Category Filter",
          description: "Filter docsets by technology category/type.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum entries or docsets to return.",
          default: 20,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description:
            "Direct DevDocs URL (e.g. 'https://devdocs.io/rust/std/collections/struct.hashmap').",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed action mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        doc: { type: "string", description: "Target docset" },
        path: { type: "string", description: "Doc entry path" },
        title: { type: "string", description: "Documentation entry title" },
        docs: { type: "array", description: "List of available docsets" },
        entries: { type: "array", description: "Search result entries" },
        markdown: { type: "string", description: "GFM markdown documentation output" },
      },
    },
    exampleInput: {
      action: "entry",
      doc: "rust",
      path: "book/ch01-00-getting-started",
    },
    readme:
      "# DevDocs Harvester\n\nHarvests official developer documentation, API references, guides, and docset indexes across 100+ technologies from DevDocs in clean GFM Markdown format.",
    mcpTool: {
      name: "query_devdocs",
      description:
        "Queries DevDocs for official developer documentation, API references, guides, and docset search indexes across 100+ technologies.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list_docs", "search", "entry"],
            description: "Action: list_docs, search, or entry",
          },
          doc: {
            type: "string",
            description: "Docset slug (e.g. 'rust', 'python~3.12', 'javascript', 'go')",
          },
          path: {
            type: "string",
            description: "Entry subpath within docset (e.g. 'book/ch01-00-getting-started')",
          },
          query: {
            type: "string",
            description: "Keyword search query",
          },
          category: {
            type: "string",
            description: "Docset category filter",
          },
          limit: { type: "number", description: "Maximum entries to return" },
          targetUrl: { type: "string", description: "Direct DevDocs URL" },
        },
        required: [],
      },
    },
  },
  "rosetta-code": {
    name: "rosetta-code",
    actorType: "rosetta-code",
    title: "Rosetta Code Multi-Language Algorithm Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests multi-language algorithm implementations, code comparisons, and programming tasks across 800+ languages from Rosetta Code.",
    author: "protokol-7",
    tags: [
      "rosetta-code",
      "algorithms",
      "multi-language",
      "code-comparison",
      "programming",
      "cross-language",
      "llm-pretraining",
      "reasoning",
    ],
    inputSchema: {
      type: "object",
      title: "Rosetta Code Harvester Input Parameters",
      description:
        "Parameters for harvesting programming tasks, algorithms, and multi-language implementations",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Extraction mode: 'task' (harvest task implementations), 'search' (search tasks), 'random' (random task), 'languages' (list languages).",
          default: "task",
          enum: ["task", "search", "random", "languages"],
          editor: "select",
        },
        task: {
          name: "task",
          type: "string",
          title: "Task Name",
          description:
            "Name of the programming task (e.g. '100 doors', 'Fibonacci sequence', 'A* search algorithm').",
          editor: "textfield",
        },
        language: {
          name: "language",
          type: "string",
          title: "Programming Language",
          description:
            "Specific programming language to extract (e.g. 'Python', 'Rust', 'C++', 'Haskell').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword query to search across Rosetta Code tasks.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum languages or search items to return.",
          default: 10,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description:
            "Direct Rosetta Code wiki URL (e.g. 'https://rosettacode.org/wiki/100_doors#Python').",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed action mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        taskDetails: { type: "object", description: "Task description and implementations" },
        searchResults: { type: "array", description: "Search result listings" },
        languages: { type: "array", description: "List of available languages" },
        markdown: { type: "string", description: "GFM markdown formatted code report" },
      },
    },
    exampleInput: {
      action: "task",
      task: "100 doors",
      language: "Python",
    },
    readme:
      "# Rosetta Code Harvester\n\nHarvests programming tasks and multi-language algorithm implementations from Rosetta Code across 800+ languages.",
    mcpTool: {
      name: "query_rosetta_code",
      description:
        "Queries Rosetta Code for multi-language algorithm implementations, code comparisons, and programming task solutions across 800+ programming languages.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["task", "search", "random", "languages"],
            description: "Action: task, search, random, or languages",
          },
          task: {
            type: "string",
            description: "Task name (e.g. '100 doors', 'Fibonacci sequence')",
          },
          language: {
            type: "string",
            description: "Specific language (e.g. 'Python', 'Rust', 'C++')",
          },
          query: {
            type: "string",
            description: "Search keyword query",
          },
          limit: { type: "number", description: "Maximum implementations or search items" },
          targetUrl: { type: "string", description: "Direct Rosetta Code URL" },
        },
        required: [],
      },
    },
  },
  "papers-with-code": {
    name: "papers-with-code",
    actorType: "papers-with-code",
    title: "Papers With Code & Hugging Face Papers Harvester",
    category: "GENERAL",
    version: "1.0.0",
    description:
      "Harvests machine learning papers, official GitHub code repositories, arXiv abstracts, and benchmark tasks from Papers With Code & Hugging Face Papers.",
    author: "protokol-7",
    tags: [
      "papers-with-code",
      "huggingface-papers",
      "machine-learning",
      "arxiv",
      "deep-learning",
      "code-repositories",
      "benchmarks",
      "ai-research",
    ],
    inputSchema: {
      type: "object",
      title: "Papers With Code Input Parameters",
      description:
        "Parameters for harvesting ML research papers, GitHub implementations, and trending benchmarks",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Extraction mode: 'paper' (retrieve paper metadata and GitHub repos), 'trending' (daily trending ML papers), 'search' (keyword search).",
          default: "paper",
          enum: ["paper", "trending", "daily", "search"],
          editor: "select",
        },
        paper: {
          name: "paper",
          type: "string",
          title: "Paper Slug or Title",
          description:
            "Paper title, slug, or arXiv ID (e.g. 'attention-is-all-you-need', '1706.03762').",
          editor: "textfield",
        },
        arxivId: {
          name: "arxivId",
          type: "string",
          title: "arXiv ID",
          description: "arXiv identifier (e.g. '1706.03762').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword query for searching machine learning papers.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum paper records to return.",
          default: 10,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct Papers With Code or Hugging Face Papers URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed action mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        paper: {
          type: "object",
          description: "Detailed paper record, authors, abstract, and code repos",
        },
        papers: { type: "array", description: "List of trending paper records" },
        searchResults: { type: "array", description: "Search result listings" },
        markdown: { type: "string", description: "GFM markdown formatted paper report" },
      },
    },
    exampleInput: {
      action: "paper",
      arxivId: "1706.03762",
    },
    readme:
      "# Papers With Code Harvester\n\nHarvests machine learning papers, official GitHub code repositories, arXiv abstracts, and benchmark tasks from Papers With Code & Hugging Face Papers.",
    mcpTool: {
      name: "query_papers_with_code",
      description:
        "Queries Papers With Code and Hugging Face Papers for machine learning papers, arXiv abstracts, official GitHub code repositories, and trending research benchmarks.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["paper", "trending", "daily", "search"],
            description: "Action: paper, trending, daily, or search",
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
          limit: { type: "number", description: "Maximum papers to return" },
          targetUrl: { type: "string", description: "Direct paper URL" },
        },
        required: [],
      },
    },
  },
  libretexts: {
    name: "libretexts",
    actorType: "libretexts",
    title: "LibreTexts STEM & Engineering Textbook Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Harvests open-access STEM and engineering textbooks, course chapters, and formulas from LibreTexts discipline libraries.",
    author: "protokol-7",
    tags: [
      "libretexts",
      "stem",
      "textbook",
      "chemistry",
      "physics",
      "math",
      "engineering",
      "llm-data",
    ],
    inputSchema: {
      type: "object",
      title: "LibreTexts Input Parameters",
      description: "Parameters for extracting LibreTexts open STEM textbooks and course chapters",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Action mode: 'page' (fetch page/chapter content), 'search' (keyword search), 'subpages' or 'toc' (table of contents).",
          default: "page",
          enum: ["page", "search", "subpages", "toc"],
          editor: "select",
        },
        library: {
          name: "library",
          type: "string",
          title: "Discipline Library",
          description:
            "Discipline library subdomain (e.g. 'chem', 'phys', 'math', 'bio', 'eng', 'med', 'stats', 'geo', 'socialsci', 'human', 'biz', 'espanol').",
          default: "chem",
          editor: "textfield",
        },
        pageId: {
          name: "pageId",
          type: "string",
          title: "Page ID",
          description: "Numerical page identifier or path in LibreTexts Deki API.",
          editor: "textfield",
        },
        path: {
          name: "path",
          type: "string",
          title: "Page Path",
          description: "Relative path in library (e.g. 'Bookshelves/General_Chemistry/...').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Search keyword query across the selected discipline library.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum search results or subpages to return.",
          default: 20,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct LibreTexts page or chapter URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed action mode" },
        library: { type: "string", description: "Target discipline library" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        page: { type: "object", description: "Extracted chapter text, breadcrumbs, and formulas" },
        pages: { type: "array", description: "List of search result items" },
        subpages: { type: "array", description: "Table of contents subpages" },
        markdown: { type: "string", description: "GFM markdown formatted chapter or catalog" },
      },
    },
    exampleInput: {
      action: "search",
      library: "phys",
      query: "quantum mechanics",
    },
    readme:
      "# LibreTexts Harvester\n\nHarvests open-access STEM and engineering textbooks, course chapters, and formulas from LibreTexts discipline libraries.",
    mcpTool: {
      name: "query_libretexts",
      description:
        "Harvests open-access STEM and engineering textbooks, course chapters, hierarchical table of contents, and formulas from LibreTexts discipline libraries (chem, phys, math, bio, eng, etc.).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["page", "search", "subpages", "toc"],
            description: "Action: page, search, subpages, or toc",
          },
          library: {
            type: "string",
            description: "Discipline library (e.g. 'chem', 'phys', 'math', 'bio', 'eng')",
          },
          pageId: { type: "string", description: "Page ID or numeric identifier" },
          path: { type: "string", description: "Relative page path" },
          query: { type: "string", description: "Search keyword query" },
          limit: { type: "number", description: "Maximum results to return" },
          targetUrl: { type: "string", description: "Direct LibreTexts URL" },
        },
        required: [],
      },
    },
  },
  "open-textbook": {
    name: "open-textbook",
    actorType: "open-textbook",
    title: "Open Textbook Library (UMN) Harvester",
    category: "DOCUMENT",
    version: "1.0.0",
    description:
      "Harvests peer-reviewed open textbooks, curricular reviews, and downloadable formats from Open Textbook Library (UMN).",
    author: "protokol-7",
    tags: ["open-textbook", "textbook", "university", "curriculum", "peer-reviewed", "llm-data"],
    inputSchema: {
      type: "object",
      title: "Open Textbook Library Input Parameters",
      description:
        "Parameters for extracting peer-reviewed open textbooks from Open Textbook Library",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Action mode: 'book' (fetch book details, TOC, formats, and peer reviews), 'search' (keyword/subject search), 'subjects' (list academic subjects).",
          default: "book",
          enum: ["book", "search", "subjects"],
          editor: "select",
        },
        bookId: {
          name: "bookId",
          type: "string",
          title: "Book ID or Slug",
          description: "Textbook identifier or slug (e.g. 'calculus-volume-1' or '45').",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Keyword search expression for open textbooks.",
          editor: "textfield",
        },
        subject: {
          name: "subject",
          type: "string",
          title: "Academic Subject",
          description: "Subject category slug (e.g. 'mathematics', 'computer-science').",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum textbooks to return.",
          default: 20,
          editor: "number",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct Open Textbook Library URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed action mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        book: {
          type: "object",
          description: "Extracted book details, download links, TOC, and peer reviews",
        },
        books: { type: "array", description: "List of search result textbooks" },
        subjects: { type: "array", description: "List of academic subjects" },
        markdown: { type: "string", description: "GFM markdown formatted book report" },
      },
    },
    exampleInput: {
      action: "search",
      query: "calculus",
    },
    readme:
      "# Open Textbook Library Harvester\n\nHarvests peer-reviewed open textbooks, multi-format download links (PDF, EPUB, Online), table of contents, academic peer reviews, and curricular subject categories from Open Textbook Library (UMN).",
    mcpTool: {
      name: "query_open_textbook",
      description:
        "Harvests peer-reviewed open textbooks, multi-format download links (PDF, EPUB, Online), table of contents, academic peer reviews, and curricular subject categories from Open Textbook Library (UMN).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["book", "search", "subjects"],
            description: "Action: book, search, or subjects",
          },
          bookId: { type: "string", description: "Book ID or slug" },
          query: { type: "string", description: "Search keyword query" },
          subject: { type: "string", description: "Subject category slug" },
          limit: { type: "number", description: "Maximum results to return" },
          targetUrl: { type: "string", description: "Direct Open Textbook URL" },
        },
        required: [],
      },
    },
  },
  "semantic-scholar": {
    name: "semantic-scholar",
    actorType: "semantic-scholar",
    title: "Semantic Scholar Academic Knowledge Graph Harvester",
    category: "API",
    version: "1.0.0",
    description:
      "Queries scientific literature, citations, TLDR summaries, and paper graphs from Semantic Scholar Graph API.",
    author: "protokol-7",
    tags: ["semantic-scholar", "academic", "papers", "citations", "s2ag", "tldr", "llm-data"],
    inputSchema: {
      type: "object",
      title: "Semantic Scholar Input Parameters",
      description: "Parameters for querying Semantic Scholar Graph API (S2AG)",
      properties: {
        action: {
          name: "action",
          type: "string",
          title: "Action Mode",
          description:
            "Action mode: 'paper' (retrieve paper by S2 ID, DOI, arXiv, or URL), 'search' (paper search), 'author' (author profile), 'author_search' (search authors), 'citations', 'references'.",
          default: "paper",
          enum: ["paper", "search", "author", "author_search", "citations", "references"],
          editor: "select",
        },
        paperId: {
          name: "paperId",
          type: "string",
          title: "Paper ID or DOI / arXiv",
          description:
            "Semantic Scholar paper ID, DOI (e.g. '10.1145/...'), arXiv ID (e.g. 'ARXIV:1706.03762'), or PubMed ID.",
          editor: "textfield",
        },
        authorId: {
          name: "authorId",
          type: "string",
          title: "Author ID",
          description: "Semantic Scholar author identifier.",
          editor: "textfield",
        },
        query: {
          name: "query",
          type: "string",
          title: "Search Query",
          description: "Literature search query.",
          editor: "textfield",
        },
        fields: {
          name: "fields",
          type: "string",
          title: "Fields Projection",
          description: "Comma-separated S2 Graph API fields to request.",
          editor: "textfield",
        },
        limit: {
          name: "limit",
          type: "integer",
          title: "Max Results",
          description: "Maximum papers or authors to return.",
          default: 10,
          editor: "number",
        },
        offset: {
          name: "offset",
          type: "integer",
          title: "Offset",
          description: "Pagination offset for search.",
          default: 0,
          editor: "number",
        },
        year: {
          name: "year",
          type: "string",
          title: "Year Filter",
          description: "Publication year filter (e.g. '2023' or '2020-2024').",
          editor: "textfield",
        },
        targetUrl: {
          name: "targetUrl",
          type: "string",
          title: "Target URL",
          description: "Direct Semantic Scholar paper or author URL.",
          editor: "textfield",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      fields: {
        action: { type: "string", description: "Executed action mode" },
        queryUrl: { type: "string", description: "Source URL fetched" },
        totalResults: { type: "number", description: "Total results returned" },
        offset: { type: "number", description: "Search pagination offset" },
        next: { type: "number", description: "Next pagination offset" },
        paper: {
          type: "object",
          description: "Paper details, abstract, TLDR, authors, and citation counts",
        },
        papers: { type: "array", description: "List of paper items" },
        author: { type: "object", description: "Author profile, affiliations, and metrics" },
        authors: { type: "array", description: "List of authors" },
        markdown: { type: "string", description: "GFM markdown formatted literature report" },
      },
    },
    exampleInput: {
      action: "paper",
      paperId: "ARXIV:1706.03762",
    },
    readme:
      "# Semantic Scholar Graph API Harvester\n\nQueries scientific literature, citations, AI-generated TLDR summaries, author profiles, and paper graphs from Semantic Scholar Graph API (S2AG).",
    mcpTool: {
      name: "query_semantic_scholar",
      description:
        "Queries Semantic Scholar Graph API (S2AG) for scientific literature, AI-generated TLDR summaries, citation graphs, author profiles, and open-access PDF links across 200M+ research papers.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["paper", "search", "author", "author_search", "citations", "references"],
            description: "Action: paper, search, author, author_search, citations, or references",
          },
          paperId: {
            type: "string",
            description: "Paper ID, DOI, arXiv ID (e.g. 'ARXIV:1706.03762'), or PubMed ID",
          },
          authorId: { type: "string", description: "Author ID" },
          query: { type: "string", description: "Literature search query" },
          fields: { type: "string", description: "Comma-separated fields to request" },
          limit: { type: "number", description: "Maximum items to return" },
          offset: { type: "number", description: "Pagination offset" },
          year: { type: "string", description: "Publication year filter (e.g. '2023')" },
          targetUrl: { type: "string", description: "Direct Semantic Scholar URL" },
        },
        required: [],
      },
    },
  },
};
