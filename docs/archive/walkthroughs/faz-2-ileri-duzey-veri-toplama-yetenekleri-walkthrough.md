# Faz 2: İleri Düzey Veri Toplama Yetenekleri — Walkthrough

## 1. Genel Bakış ve Amaç
Bu aşamada `protokol-7` mikroservisinin büyük ölçekli ve kurumsal veri toplama gereksinimlerini karşılaması amacıyla dört temel altyapı bileşeni geliştirilmiş ve sisteme entegre edilmiştir:
1. **Proxy Havuzu ve Rotasyon Motoru (`ProxyManager`)**: Çoklu upstream HTTP/SOCKS5 proksi rotasyonu (round-robin, rastgele, alan adı yapışkanlığı), karantina hata takibi ve `undici.ProxyAgent` dağıtıcı önbelleklemesi.
2. **Dayanıklı Ağ Yeniden Deneme Katmanı (`withRetry`)**: Üstel geri çekilme (exponential backoff), tam rastlantısal jitter, geçici soket ve DNS hatalarının (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`) tespiti ile HTTP 429/503 durum kodlarında `Retry-After` başlığına uyum.
3. **Playwright Oturum ve Çerez Kalıcılığı (`SessionVault`)**: `storageState` nesnelerinin diske JSON formatında atomik yazılması, dizin denetimi, bozuk JSON kurtarması ve `BrowserPool` üzerinden oturumların doğrudan geri yüklenmesi.
4. **Disk Tabanlı Akışlı Tarayıcı Kuyruğu (`CrawlFrontier`)**: Bellek içi dizi sınırlarını (`MAX_CRAWL_LIMIT = 50`) kaldıran, V8 heap bellek şişmesini engelleyen, çökme sonrası kaldığı yerden devam edebilen (`checkpoint.json`), append-only JSONL akışlı sayfa yazıcısına sahip disk kuyruğu.

---

## 2. Yapılan Değişiklikler ve Mimari Eklemeler

### 2.1 Ağ ve Proksi Katmanı (`src/network/proxy-manager.ts`)
- `ProxyConfig` ve `ProxyPoolOptions` arayüzleri tanımlandı.
- `ProxyManager` sınıfı; `round-robin`, `random` ve `sticky-domain` rotasyon stratejilerini destekleyecek şekilde yazıldı.
- `quarantineThreshold` aşıldığında arızalı proksiler belirli bir süre karantinaya alınır (`quarantineDurationMs`).
- `getDispatcher(proxy)` metodu Node.js yerleşik `undici.ProxyAgent` nesnelerini önbellekleyerek bağlantı havuzlarının tekrar tekrar açılmasını önler.
- `globalProxyManager` tekil örneği dışa aktarıldı.

### 2.2 Üstel Geri Çekilme ve Yeniden Deneme (`src/network/retry-handler.ts`)
- `withRetry<T>(fn, options)` fonksiyonu geliştirildi.
- `calculateBackoffDelay` ile üstel artış + rastlantısal jitter hesaplaması yapıldı.
- `isTransientNetworkError` fonksiyonu soket kopmaları, zaman aşımları ve bağlantı reddi durumlarını tespit eder.
- `Retry-After` başlığı sayısal saniye veya HTTP-Date formatında çözümlenerek bekleme süresine aktarılır.

### 2.3 SSRF Korumalı Yönlendirme Entegrasyonu (`src/network/safe-redirect-fetcher.ts`)
- `SafeRedirectOptions` arayüzüne `proxy?: ProxyConfig` ve `retryOptions?: RetryOptions` eklendi.
- Yönlendirme adımları `withRetry` sarmalayıcısı içine alındı ve her istek proksi dağıtıcısı (`globalProxyManager.getDispatcher`) üzerinden yönlendirildi.
- Cheerio, PDF, Markdown, Sitemap ve API aktörleri bu parametreleri alt isteklerine iletecek şekilde güncellendi.

### 2.4 Oturum ve Kimlik Doğrulama Kasası (`src/browser/session-vault.ts`)
- `SessionVault.saveState(context, filePath)`: Aktif Playwright oturum durumunu diske JSON olarak yazar.
- `SessionVault.loadState(filePath)`: Diskteki oturum durumunu doğrular ve `StoredSessionState` nesnesi olarak döndürür; dosya yoksa veya bozuksa `undefined` döner.
- `SessionVault.hasState(filePath)`: Dosya varlığını denetler.

### 2.5 Tarayıcı Havuz Entegrasyonu (`src/browser/browser-pool.ts` & `src/actors/playwright-browser-actor.ts`)
- `AcquireContextOptions` arayüzüne `proxy?: ProxyConfig` ve `storageState?: string | StoredSessionState` eklendi.
- `BrowserPool.acquireSession`: Playwright bağlamı başlatılırken proxy kimlik bilgileri ve saklanan durum doğrudan `browser.newContext` parametresine geçirildi.
- `PlaywrightBrowserActor`: `task.options.proxy` ve `task.options.storageState` alanlarını `acquireSession` çağrısına iletir.

### 2.6 Disk Tabanlı Tarayıcı Kuyruğu (`src/network/crawl-frontier.ts` & `src/actors/crawler-actor.ts`)
- `CrawlFrontier` sınıfı:
  - `enqueue(url, depth)`: Ziyaret edilmiş ve kuyrukta bekleyen URL'leri O(1) küme kontrolüyle tekilleştirir.
  - `dequeue()`: FIFO sırasında sıradaki adresi döndürür ve `visited.txt` kütüğüne ekler.
  - `appendPage(page)`: CrawledPageData nesnesini JSONL formatında satır satır diske yazar (`crawled-pages.jsonl`).
  - `saveCheckpoint()` / `loadCheckpoint()`: Kuyruk, ziyaret listesi ve toplam taranan sayfa sayacını diske kalıcı kaydeder ve kesinti sonrası kaldığı yerden başlatır.
- `CrawlerActor`:
  - `MAX_CRAWL_LIMIT` 50'den 10.000'e yükseltildi.
  - `crawlerOptions.frontierDirectory` belirtildiğinde `CrawlFrontier` üzerinden akışlı tarama devreye girer.
  - Bellek içi dizi (`crawledPages`) 1.000 sayfayla sınırlandırılarak devasa sitelerin taranmasında V8 heap taşması engellendi.
  - Alt görevlere `proxy` ve `retryOptions` geçişi sağlandı.

---

## 3. Doğrulama ve Test Sonuçları

### 3.1 Yeni Birim Testler
1. `tests/proxy-manager.test.ts`: 4/4 başarılı (URL ayrıştırma, round-robin rotasyon, alan adı yapışkanlığı, karantina mekanizması).
2. `tests/retry-handler.test.ts`: 5/5 başarılı (geçici hata kodları, Retry-After ayrıştırma, tek seferde başarı, üstel yeniden deneme, son hatayı fırlatma).
3. `tests/session-vault.test.ts`: 5/5 başarılı (hasState, dizin oluşturarak kaydetme, geçerli durum yükleme, eksik dosya kontrolü, bozuk JSON toleransı).
4. `tests/crawl-frontier.test.ts`: 4/4 başarılı (tekilleştirme, FIFO sırası, JSONL akışlı yazma, kontrol noktası kaydetme ve kaldığı yerden devam etme).
5. `tests/crawler-actor.test.ts`: 2/2 başarılı (robots.txt ve politeness uyumlu bellek taraması + disk tabanlı CrawlFrontier ve JSONL akışı).

### 3.2 Genel Test Paketi
```text
NODE_ENV=test tsx --test 'tests/**/*.test.ts'
Pass: 107 / 107
Fail: 0
Duration: 8.3s
```

### 3.3 Kalite ve Sağlık Denetimleri
- `npm run verify`: 6 aşamalı doğrulama hattı başarıyla tamamlandı (Mimari bütünlük, sıfır sohbet jargonu, sıfır emoji, gizli anahtar taraması, canlı SCA paket doğrulaması, Biome statik analiz).
- `npm run doctor`: 7/7 sağlık denetimi başarıyla geçti.
- `npm run connectome`: `context/connectome.md` güncellendi.
- `context/architecture-schema.md`: Yeni modüller ve test dosyaları envantere kaydedildi.
- `npm run consolidate`: 5 aktif görev sınırı korundu ve eski görev arşive sıkıştırıldı.
