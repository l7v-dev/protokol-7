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
  actorType: ActorType | "saglik-ekutuphane";
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

  "saglik-ekutuphane": {
    actorType: "saglik-ekutuphane",
    name: "saglik-ekutuphane",
    title: "Saglik Bakanligi E-Kutuphane Archiver",
    category: "HEALTHCARE",
    version: "3.0.0",
    description:
      "ekutuphane.saglik.gov.tr arsivini 4 asamali veto zinciri, iki fazli siralama ve gzip sikistirmayla havuza aktaran ozel aktör.",
    author: "protokol-7",
    tags: ["healthcare", "government", "pdf", "resumable", "veto-chain"],
    inputSchema: {
      type: "object",
      title: "Saglik E-Kutuphane Input",
      description: "E-Kütüphane arşivleme parametreleri",
      properties: {
        category: {
          name: "category",
          type: "string",
          title: "Kategori",
          description: "İndirilecek hedef kategori.",
          default: "all",
          enum: ["all", "books", "journals", "articles"],
          editor: "select",
        },
        itemLimit: {
          name: "itemLimit",
          type: "integer",
          title: "İndirme Limiti",
          description: "İndirilecek maksimum yayın sayısı (0: sınırsız).",
          default: 0,
          editor: "number",
        },
      },
      required: ["category"],
    },
    outputSchema: {
      type: "object",
      fields: {
        totalRefined: { type: "number", description: "Damıtılan toplam yayın adedi" },
        poolPath: { type: "string", description: "Havuz kök dizini" },
        quarantinedCount: { type: "number", description: "Veto edilen yayın adedi" },
      },
    },
    exampleInput: {
      category: "books",
      itemLimit: 10,
    },
    readme: `# Saglik Bakanligi E-Kutuphane Archiver\n\n4 kapılı Veto Zinciri ile resmi sağlık kütüphanesini yerel havuza mühürler.`,
    mcpTool: {
      name: "archive_saglik_ekutuphane",
      description: "Saglik Bakanligi e-kutuphane yayinlarini indirip damitir.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Kategori secimi." },
        },
        required: ["category"],
      },
    },
  },
};
