# Faz 1: Güvenlik ve Çekirdek Düzeltmeler Uygulama Planı

Bu plan, **protokol-7** sistemindeki kritik güvenlik açıklarını (SSRF bypass, OOM DoS), eşzamanlılık yarış durumlarını (`PolitenessLimiter`, `BrowserPool`), Playwright göreceli link kaybını ve bellek sızıntılarını gidermeyi amaçlar.

## User Review Required

> [!IMPORTANT]
> - `rules/trust-tiers.md` gereğince bu görev **Tier 2 (Kısıtlı Otomasyon)** kapsamındadır çünkü güvenlik kapılarına (`ssrf-guard.ts`, `browser-pool.ts`), HTTP sunucusuna (`server.ts`) ve durum taşıyan modüllere dokunmaktadır.
> - `CrawlUrlAccumulator` için varsayılan davranış `sameDomainOnly: true` olarak ayarlanacaktır. Harici domainlere taşmak isteyen crawler görevlerinin açıkça `sameDomainOnly: false` belirtmesi gerekecektir.
> - `SSRFGuard`, RFC 4291 uyumlu IPv4-compatible IPv6 adreslerini (`::/96`, ör. `[::7f00:1]`) ve 6to4 adreslerini kesin olarak engelleyecektir.

---

## Proposed Changes

### 1. Güvenlik Katmanı (SSRF & Ağ Çeperi)

#### [MODIFY] [src/ssrf-guard.ts](file:///home/l7v/l7v-dev/protokol-7/src/ssrf-guard.ts)
- `isPrivateIPv6` metoduna IPv4-compatible IPv6 (`::/96`), NAT64 (`64:ff9b::/96`) ve 6to4 (`2002::/16`) bloklarının 32-bitlik IPv4 değerlerini ayıklayıp `isPrivateIPv4` ile denetleyen mantık eklenecek.
- `[::127.0.0.1]` (`[::7f00:1]`) ve `[::a00:1]` gibi gömülü yerel adresler bloke edilecek.

#### [MODIFY] [src/browser-pool.ts](file:///home/l7v/l7v-dev/protokol-7/src/browser-pool.ts)
- Rota filtreleme `page.route` yerine `context.route` seviyesine taşınacak. Böylece oturum içinde açılan tüm yeni sekmeler, pop-up'lar ve iframe'ler otomatik olarak SSRF ve varlık engelleme koruması altına alınacak.
- `BrowserPool.getBrowser` fonksiyonuna `browserLaunchPromise: Promise<Browser> | null` eklenerek eşzamanlı cold-start çağrılarında birden fazla Chromium başlatılması (orphan process) engellenecek.

#### [MODIFY] [src/browser-session-manager.ts](file:///home/l7v/l7v-dev/protokol-7/src/browser-session-manager.ts)
- `createTab(sessionId, url)` fonksiyonunda hedef URL sağlanmışsa `SSRFGuard.validateUrl` ile doğrulanacak; geçersizse hata fırlatılacak.

---

### 2. Eşzamanlılık ve Asenkron Durum Yönetimi

#### [MODIFY] [src/politeness-limiter.ts](file:///home/l7v/l7v-dev/protokol-7/src/politeness-limiter.ts)
- `DomainRateState` içine `nextAllowedTime: number` eklenecek.
- `waitForSlot` içinde zaman yuvası rezervasyonu (`scheduledTime = Math.max(now, state.nextAllowedTime)`) `await setTimeout` öncesinde atomik olarak kaydedilecek. Böylece eşzamanlı isteklerin aynı anda hedefe istek atması engellenecek.

#### [MODIFY] [src/interactive-browser-controller.ts](file:///home/l7v/l7v-dev/protokol-7/src/interactive-browser-controller.ts)
- `attachedPages: WeakSet<Page>` eklenerek `attachListeners` metodunun aynı sayfaya her işlemde mükerrer dinleyici eklemesi engellenecek (`MaxListenersExceededWarning` ve bellek sızıntısı giderilecek).
- `executeAction` metodundaki `params: Record<string, any>` tipi `Record<string, unknown>` olarak güncellenecek.

---

### 3. Tarayıcı ve Kazıyıcı Aktör Düzeltmeleri

#### [MODIFY] [src/playwright-browser-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/playwright-browser-actor.ts)
- Link toplama adımı `el.getAttribute("href")` yerine DOM özelliği olan `el.href` kullanacak ve sadece geçerli HTTP/HTTPS linklerini toplayacak. Böylece `CrawlerActor` JavaScript render modunda bağıntılı linkleri eksiksiz takip edebilecek.

#### [MODIFY] [src/crawl-url-accumulator.ts](file:///home/l7v/l7v-dev/protokol-7/src/crawl-url-accumulator.ts)
- `sameDomainOnly: boolean` parametresi eklenecek (varsayılan: `true`).
- Başlangıç alan adından farklı harici linklerin kuyruğa eklenmesi engellenecek.

#### [MODIFY] [src/dom-indexer.ts](file:///home/l7v/l7v-dev/protokol-7/src/dom-indexer.ts)
- Sınıf adları `CSS.escape(firstClass)` ile sarılarak Tailwind / utility CSS sınıflarından kaynaklanan sözdizimi hataları giderilecek.

#### [MODIFY] [src/url-normalizer.ts](file:///home/l7v/l7v-dev/protokol-7/src/url-normalizer.ts)
- Genel IPv6 adresleri (`net.isIP(hostname) === 6`) geçerli sayılacak.
- TLD regexi sayı/tire içeren alan adlarını (`\.[a-zA-Z0-9-]{2,}$`) destekleyecek.
- URL sorgu parametreleri deterministik biçimde alfabetik sıralanacak (`parsed.searchParams.sort()`).

---

### 4. HTTP API Sunucusu

#### [MODIFY] [src/server.ts](file:///home/l7v/l7v-dev/protokol-7/src/server.ts)
- `parseBody` içine 10MB boyut sınırı (`MAX_BODY_SIZE_BYTES`) getirilecek. Sınır aşıldığında istek kesilip 413 hatası verilecek.
- `DELETE` rotası için `/browser/session/:id` takma adı eklenecek.

---

### 5. Test Paketi Genişletmesi

#### [MODIFY] [tests/ssrf-guard.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/ssrf-guard.test.ts)
- IPv4-compatible IPv6 (`::127.0.0.1`, `::7f00:1`, `::10.0.0.1`) adreslerinin engellendiğini doğrulayan testler eklenecek.

#### [MODIFY] [tests/politeness-limiter.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/politeness-limiter.test.ts)
- Eşzamanlı `waitForSlot` çağrılarının sıralı gecikme aldığını doğrulayan concurrency testi eklenecek.

#### [MODIFY] [tests/crawler-actor.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/crawler-actor.test.ts)
- Playwright render ile bağıntılı linklerin başarıyla takip edildiğini ve harici domainlerin elendiğini doğrulayan testler eklenecek.

---

## Verification Plan

### Automated Tests
```bash
# 1. Tip ve Sözleşme Kontrolü
npm run typecheck

# 2. Bütünleşik Test Paketinin Çalıştırılması
npm test

# 3. Deterministik Doğrulama Hattı
npm run verify
```

### Manual Verification
- `http://[::127.0.0.1]/` URL'sinin `SSRFGuard.validateUrl` tarafından `valid: false` olarak reddedildiği test edilecek.
- `PolitenessLimiter` için eşzamanlı 3 `waitForSlot` çağrısının aralıklı çalıştığı doğrulanacak.
