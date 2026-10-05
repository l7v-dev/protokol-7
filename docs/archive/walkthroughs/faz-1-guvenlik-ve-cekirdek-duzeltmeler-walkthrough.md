# Faz 1: Güvenlik ve Çekirdek Düzeltmeler Walkthrough

Bu belge, **protokol-7** projesinde Faz 1 (Güvenlik ve Çekirdek Düzeltmeler) kapsamında tamamlanan değişiklikleri ve doğrulama sonuçlarını belgeler.

## Yapılan Değişiklikler

### 1. Güvenlik Katmanı (SSRF & Ağ Çeperi)
- [src/ssrf-guard.ts](file:///home/l7v/l7v-dev/protokol-7/src/ssrf-guard.ts):
  - `parseIPv6Segments` yardımcı fonksiyonu eklendi; IPv6 hextetleri ayrıştırılarak IPv4-compatible IPv6 (`::/96`, ör. `[::7f00:1]`, `[::127.0.0.1]`), 6to4 (`2002::/16`), NAT64 (`64:ff9b::/96`) ve ULA/multicast adresleri tespit edilip `isPrivateIPv4` ile denetlenmesi sağlandı.
- [src/browser-pool.ts](file:///home/l7v/l7v-dev/protokol-7/src/browser-pool.ts):
  - Rota bazlı istek filtreleme `page.route` yerine `context.route` seviyesine taşındı. Böylece oturum içinde açılan tüm yeni pencereler, pop-up'lar ve iframe'ler için ağ çeperi koruması garanti altına alındı.
  - `BrowserPool.getBrowser()` ve `shutdown()` metodlarına `browserLaunchPromise` mutex'i eklenerek soğuk başlatma (cold-start) sırasında mükerrer Chromium işlemleri (orphan process) başlatılması engellendi.
- [src/browser-session-manager.ts](file:///home/l7v/l7v-dev/protokol-7/src/browser-session-manager.ts):
  - `createTab(sessionId, url)` metoduna hedef URL kontrolü eklendi. `about:blank` dışındaki URL'ler `SSRFGuard.validateUrl` ile doğrulanıp geçersiz olanlar `Error` fırlatılarak reddedildi.

### 2. Eşzamanlılık ve Asenkron Durum Yönetimi
- [src/politeness-limiter.ts](file:///home/l7v/l7v-dev/protokol-7/src/politeness-limiter.ts):
  - `DomainRateState` içine `nextAllowedTime` alanı eklendi.
  - `waitForSlot` metodu, zaman yuvasını (`scheduledTime = Math.max(now, state.nextAllowedTime)`) `await setTimeout` öncesinde atomik olarak kaydedecek şekilde yeniden yapılandırıldı. Eşzamanlı isteklerin çakışarak aynı anda hedefe istek atması engellendi.
- [src/interactive-browser-controller.ts](file:///home/l7v/l7v-dev/protokol-7/src/interactive-browser-controller.ts):
  - `attachedPages = new WeakSet<Page>()` mekanizması eklendi; `attachListeners` metodunun aynı sayfaya her işlemde mükerrer dinleyici eklemesi ve bellek sızıntısı yapması engellendi.
  - `BrowserActionParams` arayüzü tanımlanarak parametre tipi güvenli hale getirildi.

### 3. Kazıma ve Tarayıcı Aktörleri
- [src/playwright-browser-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/playwright-browser-actor.ts):
  - Link çıkarma adımı `el.getAttribute("href")` yerine DOM özelliği `(el as HTMLAnchorElement).href` ile değiştirildi; sadece HTTP/HTTPS mutlak linkler filtrelendi.
- [src/crawl-url-accumulator.ts](file:///home/l7v/l7v-dev/protokol-7/src/crawl-url-accumulator.ts):
  - `sameDomainOnly` opsiyonu (varsayılan: `true`) ve `startHostname` domain sınırlaması eklendi.
- [src/crawler-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/crawler-actor.ts):
  - `CrawlUrlAccumulator` başlatılırken `options.sameDomainOnly` parametresi aktarıldı.
- [src/dom-indexer.ts](file:///home/l7v/l7v-dev/protokol-7/src/dom-indexer.ts):
  - Sınıf seçici üretiminde `CSS.escape` kullanılarak Tailwind ve utility sınıf karakterlerinden kaynaklanan sözdizimi hataları engellendi.
- [src/url-normalizer.ts](file:///home/l7v/l7v-dev/protokol-7/src/url-normalizer.ts):
  - Genel IPv6 adresleri için `net.isIP(cleanHost) === 6` desteği eklendi.
  - TLD regexi `/\.[a-zA-Z0-9-]{2,}$/` olarak genişletildi.
  - URL arama parametreleri deterministik biçimde sıralandı (`searchParams.sort()`).

### 4. HTTP API Sunucusu
- [src/server.ts](file:///home/l7v/l7v-dev/protokol-7/src/server.ts):
  - `parseBody` fonksiyonuna 10MB (`MAX_BODY_SIZE_BYTES`) boyut sınırı getirildi; aşım durumunda HTTP 413 fırlatılıp istek soketi sonlandırıldı.
  - `DELETE /browser/session/:id` kök rota takma adı (alias) tanımlandı.

---

## Doğrulama Sonuçları

### 1. Statik Tip Denetimi
```bash
npm run typecheck
# tsc --noEmit: Sıfır hata ile tamamlandı.
```

### 2. Bütünleşik Test Paketi
```bash
npm test
# 53 test çalıştırıldı, 53 test başarılı (%100 geçiş).
```

- `tests/ssrf-guard.test.ts`: IPv4-compatible IPv6 adreslerinin (`::127.0.0.1`, `::7f00:1`, `::10.0.0.1`) başarıyla engellendiği doğrulandı.
- `tests/politeness-limiter.test.ts`: Eşzamanlı 3 istek için atomik aralıklı gecikmeler doğrulandı.
- `tests/server.test.ts`: 10MB üzeri payload'un 413 döndürdüğü ve `DELETE /browser/session/:id` takma adının çalıştığı doğrulandı.
- `tests/crawler-actor.test.ts`, `tests/browser-session-manager.test.ts`, `tests/dom-indexer.test.ts`: Tüm bileşenler yeşil geçti.

### 3. Deterministik Doğrulama Hattı
```bash
npm run verify
# [1/5] Mimari Dosya Bütünlüğü: OK
# [2/5] İsimlendirme Disiplini: OK
# [3/5] Sıfır Emoji Disiplini: OK
# [4/5] SCA Canlı Bağımlılık Denetimi: 6 paket doğrulandı (PASS)
# [5/5] Biome Statik Analiz: OK
# DOGRULAMA BASARILI: Kod tabanı tüm doğrulama katmanlarından geçti.
```
