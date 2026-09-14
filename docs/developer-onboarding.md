# Geliştirici Başlangıç Rehberi (Developer Onboarding)

## 1. Servis Tanımı

`protokol-7`, yüksek verimli web kazıma, sıralı derin tarama ve anti-detection Playwright Chromium tarayıcı otomasyonunu sağlayan bağımsız bir Node.js mikroservisidir. Harici tüketici sistemlere (örn. `Agent-Smith`, veri işleme boru hatları veya bağımsız CLI araçları) HTTP REST API üzerinden hizmet verir.

---

## 2. Sistem Gereksinimleri

- **Node.js**: v20.x veya üzeri
- **npm**: v10.x veya üzeri
- **Chromium / Playwright**: Playwright Chromium sürücüsü (yerel veya sistem kütüphanesi).

---

## 3. Kurulum ve Başlatma

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme modunda başlat (otomatik yeniden yükleme)
npm run dev

# Üretim derlemesi oluştur
npm run build

# Üretim modunda başlat
npm start
```

---

## 4. Test ve Kalite Denetimleri

```bash
# Tüm birim ve entegrasyon testlerini çalıştır
npm test

# TypeScript tip denetimi
npm run lint

# Teknik isimlendirme disiplini denetimi (Pazarlama jargonu taraması)
npm run lint:naming
```

---

## 5. Ortam Değişkenleri (Environment Variables)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `4000` | HTTP REST sunucusunun dinleyeceği TCP portu |
| `HOST` | `127.0.0.1` | Sunucu dinleme adresi |
| `HEADLESS` | `true` | Playwright Chromium headless çalışma modu (`true` / `false`) |
| `CHROMIUM_PATH` | - | Özel Chromium çalıştırılabilir ikili dosya yolu (opsiyonel) |

---

## 6. HTTP REST API Uç Noktaları

### 6.1. Sistem Sağlığı
- **`GET /health`**
  - Dönen Veri: `{ status: "ok", service: "protokol-7", activeBrowserContexts: 0, memoryUsage: { ... } }`

### 6.2. Aktör İşlemleri
- **`GET /api/v1/actors`**
  - Kayıtlı aktörlerin (Cheerio, Playwright, API) meta verilerini döner.
- **`POST /api/v1/actors`**
  - Gövde: `{ actorId: string, task: ActorTask }`

### 6.3. Sayfa Kazıma
- **`POST /api/v1/scrape`**
  - Gövde: `{ url: string, preferredActor?: "cheerio" | "playwright" | "api", options?: ActorTaskOptions }`
  - Dönen Veri: `ScrapedPageResult` (title, content, markdown, links, images, tables, metadata).

### 6.4. Derin Web Tarama (Crawling)
- **`POST /api/v1/crawl`**
  - Gövde: `{ startUrl: string, maxPages?: number, maxDepth?: number, sameDomainOnly?: boolean, rateLimitMs?: number }`
  - Dönen Veri: `CrawlerResult` (pages: ScrapedPageResult[], visitedUrls, durationMs).

### 6.5. İnteraktif Tarayıcı Eylemleri
- **`POST /api/v1/browser/action`**
  - Gövde: `{ sessionId?: string, action: "navigate" | "click" | "fill" | "screenshot" | "evaluate" | "wait_for_selector" | "get_content" | "close_session", url?: string, selector?: string, value?: string, script?: string }`
  - Dönen Veri: `BrowserActionResult` (success, sessionId, currentUrl, textContent, screenshot, error).

### 6.6. Tarayıcı Oturum Kapatma
- **`DELETE /api/v1/browser/session/:id`**
  - Belirtilen tarayıcı bağlamını kapatır ve Chromium bellek kaynaklarını serbest bırakır.
