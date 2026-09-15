# Faz 4 & NixOS Entegrasyonu: Tarayıcı/Ağ Aktörleri ve Deklaratif Geliştirme Ortamı — Walkthrough

Bu doküman, **protokol-7** sistemine kazandırılan Faz 4 aktörlerini (`network-interceptor-actor` ve `serp-search-actor`), Chromium ağ ve stealth katmanı iyileştirmelerini ve NixOS (`nix develop`, `devenv`, `direnv`) deklaratif geliştirme altyapısını özetler.

---

## 1. Tamamlanan Değişiklikler

### A. Yeni Aktörler ve REST Uç Noktaları
1. **`NetworkInterceptorActor` (`src/network-interceptor-actor.ts`)**:
   - Playwright Chromium oturumunda `page.on('response')` dinleyicisi ile arka plandaki tüm Fetch ve XHR JSON API yanıtlarını yakalar.
   - `urlPatterns` ile wildcard/glob desen eşleme desteği (`matchUrlPattern(url, pattern)`).
   - SSRF koruması (`SSRFGuard`) ve `finally` bloğunda garantili oturum kapatma (`session.release()`).
   - Rota: `POST /api/v1/network/intercept` ve `POST /network/intercept`.

2. **`SerpSearchActor` (`src/serp-search-actor.ts`)**:
   - DuckDuckGo HTML arama motoru üzerinden organik arama sonuçlarını çeker.
   - Cheerio DOM ayrıştırması ile sıralama (`rank`), başlık (`title`), hedef URL (`url`), alan adı (`domain`) ve metin özetini (`snippet`) üretir.
   - DuckDuckGo takip yönlendirmelerini (`uddg` sorgu parametresi) çözerek temiz nihai URL üretir.
   - Rota: `POST /api/v1/search` ve `POST /search`.

### B. Chromium Ağ ve Stealth Katmanı Hata Düzeltmeleri
1. **`StealthManager` (`src/stealth-manager.ts`)**:
   - Global `extraHTTPHeaders` içerisinden `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`, `Sec-Fetch-User` başlıkları kaldırıldı. W3C Fetch Metadata spesifikasyonuna göre tarayıcı bu başlıkları alt kaynak fetch/XHR çağrılarına otomatik atar; global zorlama Chromium'da `net::ERR_INVALID_ARGUMENT` hatasına yol açıyordu.
2. **`BrowserPool` (`src/browser-pool.ts`)**:
   - `window.__name = (fn) => fn; var __name = (fn) => fn;` polyfill'i `StealthManager.getInitScript()` öncesine alındı.
   - `resolveExecutablePath()` fonksiyonu `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ortam değişkenine ve NixOS yollarına tam uyumlu hale getirildi.
3. **`Server` (`src/server.ts`)**:
   - Test dosyaları tarafından import edildiğinde dinleme soketinin açık kalmaması için `isMainModule` kontrolü eklendi (`fileURLToPath(import.meta.url) === process.argv[1]`).

### C. NixOS & Declarative Development Stack
1. **`flake.nix`**:
   - `nix develop` ile doğrudan çalışan, `nodejs_22`, `pnpm`, `git` ve `pkgs.chromium` içeren saf Nix flake devShell.
   - `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` otomatik olarak Nix store Chromium ikilisine bağlanır.
2. **`devenv.nix`**:
   - `devenv` CLI kullanan geliştiriciler için `languages.javascript` ve `packages = [ pkgs.chromium ]` tanımları.
3. **`.envrc`**:
   - `direnv allow` ile dizine girildiğinde otomatik kabuk yüklemesi (`use flake`).

---

## 2. Doğrulama ve Test Sonuçları

### Birim Testleri
```bash
# Hem yerel Node.js hem de 'nix develop' izole kabuğu altında:
npm test
```
- **Toplam Test:** 68
- **Başarılı:** 68 (%100)
- **Başarısız:** 0
- **Süre:** ~7-10 saniye

### Doğrulama Hattı (Verification Pipeline)
```bash
npm run verify
```
- **[1/5] Mimari Dosya Bütünlüğü:** Başarılı
- **[2/5] İsimlendirme Disiplini:** Başarılı (Pazarlama jargonu yok)
- **[3/5] Sıfır Emoji Disiplini:** Başarılı (Sıfır emoji)
- **[4/5] SCA Canlı Paket Denetimi:** 6 paketin tamamı resmi npm kayıt defterinde doğrulandı
- **[5/5] Biome Linter & Format:** 51 dosya incelendi, 0 hata
