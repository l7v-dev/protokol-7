# Faz 1: Mantiksal Hata, SSRF Perimetre Guvenligi ve Veri Toplama Dayanikliligi Plani

Bu plan, Protokol-7 veri cekme motorunun mimari denetiminde tespit edilen 6 kritik mantiksal hatayi, SSRF guvenlik acigini, asenkron olay yarisini ve bellek sizintilarini deterministik olarak gidermek amaciyla hazirlanmistir.

## Kullanici Incelemesi Gerektiren Konular
- CheerioScraperActor ve ApiExtractorActor icindeki redirect: "error" kurali kaldirilacak; yerine azami 5 adimli ve her adimda DNS/SSRF dogrulayan safeRedirectFetch mekanizmasi getirilecektir.
- BrowserPool route filtreleyicisi, senkron IP kontrolu yerine DNS cozumlemeli validateUrlWithDns kontrolune gecirilerek DNS rebinding acigi kapatilacaktir.
- StealthManager baslik matrisi, User-Agent isletim sistemi ve tarayici motoruna (Chrome, Firefox, Safari) gore dinamik Client Hints (Sec-Ch-Ua) uretecek sekilde duzeltilecektir.

## Onerilen Degisiklikler

### 1. Ag & Guvenlik Katmani (src/network/)
- [NEW] src/network/safe-redirect-fetcher.ts: SSRF korumali guvenli HTTP yonlendirme sarmalayicisi (safeRedirectFetch).
- [MODIFY] src/browser/browser-pool.ts: context.route icinde validateUrlWithDns cagrisi.

### 2. Aktorler Katmani (src/actors/)
- [MODIFY] src/actors/cheerio-scraper-actor.ts: safeRedirectFetch entegrasyonu.
- [MODIFY] src/actors/api-extractor-actor.ts: safeRedirectFetch entegrasyonu.
- [MODIFY] src/actors/pdf-document-actor.ts: validateUrlWithDns ve safeRedirectFetch entegrasyonu.
- [MODIFY] src/actors/serp-search-actor.ts: validateUrlWithDns ve safeRedirectFetch entegrasyonu.
- [MODIFY] src/actors/sitemap-xml-actor.ts: validateUrlWithDns ve safeRedirectFetch entegrasyonu.
- [MODIFY] src/actors/network-interceptor-actor.ts: in-flight promise bariyeri ile arka plan yanitlarinin kontekst kapanmadan tamamlanmasi.
- [MODIFY] src/actors/crawler-actor.ts: robotsParser.getCrawlDelay() degerinin politenessLimiter'a baglanmasi.

### 3. Tarayici & Durum Yonetimi (src/browser/)
- [MODIFY] src/browser/stealth-manager.ts: User-Agent isletim sistemi ve istemci ipuclari (Sec-Ch-Ua) uyumsuzlugunun giderilmesi.
- [MODIFY] src/browser/interactive-browser-controller.ts: cleanupSession ile consoleErrorMap sizintisinin onlenmesi.
- [MODIFY] src/browser/browser-session-manager.ts: Oturum kapandiginda veya zaman asimina ugradiginda controller temizligi.

### 4. Cikaricilar & Cekirdek Runtime (src/extractors/, src/core/)
- [MODIFY] src/extractors/structured-extractor.ts: Ic ice tablolarda birinci seviye tr secimi ve colspan hucre genislemesi.
- [MODIFY] src/network/politeness-limiter.ts: setMinInterval destegi.
- [MODIFY] src/core/run-registry.ts: MAX_RUNS = 200 tahliye siniri.
- [MODIFY] context/architecture-schema.md: Yeni safe-redirect-fetcher bileseninin envantere eklenmesi.

## Dogrulama Plani
- tests/safe-redirect-fetcher.test.ts
- npm test (83+ test)
- npm run verify (6 asamali dogrulama hatti)
