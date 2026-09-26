# Sistem Hataları Giderimi ve Web UI Tasfiyesi Planı

Bu belge, protokol-7 sisteminde tespit edilen 6 mimari/akış hatasının giderilmesini ve gömülü Web UI frontend bileşeninin sistemden tamamen kaldırılarak saf headless mikroservis mimarisinin pekiştirilmesini tanımlar.

## 1. Kapsam ve Güven Kademesi (Trust-Tier)

- **Güven Kademesi:** Tier 2 (Çekirdek yönlendirici, aktör manifestoları, tarayıcı denetleyicisi ve test dosyaları güncellenmektedir).
- **Hedef Dizinler:**
  - `src/core/server.ts`
  - `src/core/store-router.ts`
  - `src/actors/actor-manifests.ts`
  - `src/browser/interactive-browser-controller.ts`
  - `src/actors/crawler-actor.ts`
  - `src/network/crawl-url-accumulator.ts`
  - `src/actors/cheerio-scraper-actor.ts`
  - `src/actors/api-extractor-actor.ts`
  - `src/extractors/robots-parser.ts`
  - `context/architecture-schema.md`
  - `tests/store-api.test.ts`
  - `tests/server.test.ts`

---

## 2. Düzeltilecek Maddeler ve Teknik Çözüm

### 2.1 StoreRouter Eksik Opsiyon Eşlemeleri (saglik-ekutuphane & ktb-ekitap)
- `src/core/store-router.ts` içerisindeki `handleRunActor` fonksiyonunda `saglikEkutuphaneOptions` ve `ktbEkitapOptions` blokları tanımlanacak.
- `body.action`, `body.category`, `body.publicationId`, `body.bookId`, `body.detailUrl`, `body.page`, `body.limit`, `body.downloadPdf` alanları ilgili aktör seçeneklerine aktarılacak.

### 2.2 Actor Manifests'te network-interceptor Eksikliği
- `src/actors/actor-manifests.ts` içerisine `network-interceptor` manifestosu eklenecek.
- MCP araç tanımı (`network_interceptor`) eklenecek.
- `src/mcp/protokol-mcp-server.ts` içerisindeki opsiyon eşlemesi teyit edilecek.

### 2.3 Web UI Frontend'inin Tasfiyesi (Gömülü HTML/JS SPA Temizliği)
- `src/core/store-router.ts` içerisindeki 740+ satırlık `EMBEDDED_DASHBOARD_HTML` tamamen silinecek.
- `handleServeWeb` fonksiyonu JSON tabanlı mikroservis durum ve kök bilgisi döndüren `handleServiceInfo` ile değiştirilecek:
  - `{ status: "healthy", service: "protokol-7", mode: "headless", endpoints: { docs: "/docs", openapi: "/openapi.json", health: "/health", store: "/api/v1/store/actors" } }`
- `src/core/server.ts` üzerindeki `/store` ve `/dashboard` rotaları 404'e düşürülecek veya `/` uçbirimine yönlendirilecek.

### 2.4 InteractiveBrowserController Erken DNS Doğrulaması
- `src/browser/interactive-browser-controller.ts` dosyasındaki `navigate` fonksiyonunda `SSRFGuard.validateUrl` yerine `await SSRFGuard.validateUrlWithDns(url, { allowLocalNetwork })` kullanılacak.
- DNS rebinding yapan alan adları `page.goto` öncesinde yakalanarak temiz `SSRF validation failed` hatası döndürülecek.

### 2.5 CrawlerActor Sayfa Limiti ve robots.txt Sayaç Uyumu
- `src/network/crawl-url-accumulator.ts` dosyasında `visited` sayacının robots.txt tarafından engellenen ve hiç taranmayan URL'leri başarıyla taranmış sayfa kotasından düşmesi engellenecek.
- `CrawlerActor.run` içerisinde sayfa tüketim mantığı `CrawlFrontier` ile simetrik hale getirilecek.

### 2.6 Graceful Shutdown (Süreç Kapatma Dinleyicileri)
- `src/core/server.ts` içerisine `SIGINT` ve `SIGTERM` dinleyicileri eklenerek `BrowserPool.shutdown()` ve `server.close()` sıralı olarak çağrılacak.

### 2.7 Eski Proje Adı Kalıntılarının Temizliği
- `src/actors/cheerio-scraper-actor.ts`, `src/actors/api-extractor-actor.ts` ve `src/extractors/robots-parser.ts` içerisindeki `AgentSmith*` referansları `protokol-7` standardına dönüştürülecek.

---

## 3. Doğrulama ve Test Adımları

1. `tests/store-api.test.ts` güncellenerek HTML yerine JSON yanıtı test edilecek; yeni eklenen manifest ve opsiyon eşlemeleri doğrulanacak.
2. `npm test` ile tüm Node.js testlerinin (180+) başarıyla geçtiği doğrulanacak.
3. `npm run bigdata:test` ve Python pipeline testlerinin geçtiği doğrulanacak.
4. `npm run verify` ile 6 katmanlı doğrulama hattı çalıştırılacak.
5. `context/architecture-schema.md` güncellenecek.
