# Faz 2: Ileri Duzey Veri Toplama Yetenekleri (Proxy, Retry, Session Vault, Disk Frontier) Plani

Bu plan, Protokol-7 mimarisini tekil/mikro kazima seviyesinden endustriyel olcekte blokaj direncli, dayanikli ve yuksek kapasiteli veri hasadi yapabilen bir seviyeye tasimak amaciyla hazirlanmistir.

## Kullanici Incelemesi Gerektiren Konular
- Proksi Entegrasyonu: Hem Node.js HTTP katmanina (safeRedirectFetch -> undici.ProxyAgent) hem de Playwright tarayici baglamina (BrowserPool.acquireSession -> context.proxy) proksi havuzu ve rotasyon motoru (ProxyManager) eklenecektir.
- Olceklenebilir Tarayici (Disk Frontier): CrawlerActor'deki 50 sayfalik kati sinir kaldirilacak; buyuk taramalarin RAM'i sisirmesini onlemek icin sayfalari diske akisli (.jsonl) kaydeden ve kaldigi yerden devam edebilen CrawlFrontier motoru devreye alinacaktir.
- Oturum Kaliciligi (Session Vault): Giris yapilmis oturumlarin, cerezlerin ve Cloudflare/WAF onaylarinin tekrar kullanilabilmesi icin Playwright storageState diske kaydetme/yukleme modulu eklenecektir.

## Onerilen Degisiklikler

### 1. Ag & Iletim Katmani (src/network/)
- [NEW] src/network/proxy-manager.ts: Proksi havuzu, rotasyon stratejileri (round-robin, sticky-domain) ve undici.ProxyAgent entegrasyonu.
- [NEW] src/network/retry-handler.ts: Ag kopmalarinda ve 429/503 yanitlarinda ustel geri cekilmeli yeniden deneme motoru.
- [MODIFY] src/network/safe-redirect-fetcher.ts: Proxy ve RetryOptions parametrelerinin entegrasyonu.

### 2. Tarayici & Oturum Yonetimi (src/browser/)
- [NEW] src/browser/session-vault.ts: Playwright storageState cerez ve oturum durumunu atomik diske kaydetme/yukleme.
- [MODIFY] src/browser/browser-pool.ts: context duzeyinde proxy ve storageState parametre destegi.

### 3. Tarama & Veri Akisi (src/actors/, src/network/)
- [NEW] src/network/crawl-frontier.ts: Disk tabanli kuyruk, checkpoint/resume ve streaming JSONL cikti boru hatti.
- [MODIFY] src/actors/crawler-actor.ts: Kati 50 sayfa sinirinin kaldirilmasi, akisli disk sink destegi.
- [MODIFY] context/architecture-schema.md: Yeni mimari bilesenlerin kaydi.

## Dogrulama Plani
- tests/proxy-manager.test.ts
- tests/retry-handler.test.ts
- tests/session-vault.test.ts
- tests/crawl-frontier.test.ts
- npm test (88+ test)
- npm run verify (6 asamali dogrulama)
- npm run doctor
