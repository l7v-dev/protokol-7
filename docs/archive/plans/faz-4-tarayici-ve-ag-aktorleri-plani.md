# Faz 4: Tarayıcı ve Ağ Aktörleri Uygulama Planı

Bu plan, **protokol-7** sistemine iki yeni gelişmiş aktör eklemeyi hedefler:
1. **`network-interceptor-actor`**: Single Page Application (SPA) ağ katmanını dinleyerek arka plandaki tüm XHR/Fetch JSON API yanıtlarını doğrudan yakalayan aktör.
2. **`serp-search-actor`**: DuckDuckGo HTML üzerinden organik arama sonuçlarını, sıralamalarını ve özetlerini ayrıştıran aktör.

## User Review Required

> [!IMPORTANT]
> - `rules/trust-tiers.md` gereğince bu görev **Tier 2 (Kısıtlı Otomasyon)** kapsamındadır çünkü Playwright tarayıcı havuzuna (`BrowserPool`) ve ağ dinleyicilerine dokunmaktadır.
> - Her iki aktör de sıfır harici npm bağımlılığı ile mevcut `BrowserPool` ve `Cheerio` altyapısı üzerinde çalışacaktır.
> - Tüm değişiklikler `docs/git-commit-convention.md` kurallarına uygun olarak atomik git commit'leri ile taahhüt edilecektir.

---

## Proposed Changes

### 1. Tip ve Sözleşme Tanımları

#### [MODIFY] [src/types.ts](file:///home/l7v/l7v-dev/protokol-7/src/types.ts)
- `ActorType` union genişletilecek: `"network-interceptor" | "serp-search"`.
- `InterceptedApiResponse`, `NetworkInterceptorTaskOptions`, `NetworkInterceptorResult` arayüzleri eklenecek.
- `SerpResultItem`, `SerpSearchTaskOptions`, `SerpSearchResult` arayüzleri eklenecek.
- `ActorTask.options` içine `networkInterceptorOptions` ve `serpOptions` alanları eklenecek.

---

### 2. Yeni Aktörlerin Geliştirilmesi

#### [NEW] [src/network-interceptor-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/network-interceptor-actor.ts)
- `BrowserPool.acquireContext()` kullanarak izole Chromium bağlamı açar.
- `page.on("response", async (response) => { ... })` dinleyicisi ile gelen yanıtları yakalar.
- `content-type: application/json` başlığı taşıyan veya `urlPatterns` filtrelerine uyan istekleri süzer.
- Yanıt gövdesini JSON olarak ayrıştırır ve `InterceptedApiResponse` listesine ekler.
- `finally` bloğu içinde `BrowserPool.releaseContext()` ile bellek sızıntılarını önler.

#### [NEW] [src/serp-search-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/serp-search-actor.ts)
- DuckDuckGo HTML arama uç noktasını (`https://html.duckduckgo.com/html/?q=...`) sorgular.
- Arama sonuç bloklarını (`.result`) Cheerio ile ayrıştırır.
- Yönlendirme linklerini (`uddg` parametresi) temiz hedef URL'ye çözer (`UrlNormalizer`).
- Sıralama (`rank`), başlık (`title`), hedef URL (`url`), alan adı (`domain`) ve metin özetini (`snippet`) üretir.

---

### 3. Kayıt Defteri, Dışa Aktarım ve Sunucu Rotaları

#### [MODIFY] [src/actor-registry.ts](file:///home/l7v/l7v-dev/protokol-7/src/actor-registry.ts)
- `NetworkInterceptorActor` ve `SerpSearchActor` sınıfları varsayılan registry'ye kaydedilecek.

#### [MODIFY] [src/index.ts](file:///home/l7v/l7v-dev/protokol-7/src/index.ts)
- Yeni aktörler dışa aktarılacak.

#### [MODIFY] [src/server.ts](file:///home/l7v/l7v-dev/protokol-7/src/server.ts)
- `POST /api/v1/network/intercept` (ve `/network/intercept`) uç noktası eklenecek.
- `POST /api/v1/search` (ve `/search`) uç noktası eklenecek.

#### [MODIFY] [scripts/generate-connectome.mjs](file:///home/l7v/l7v-dev/protokol-7/scripts/generate-connectome.mjs)
- Yeni rotalar ve aktörler connectome eşleme tablosuna eklenecek.

---

### 4. Birim Testleri

#### [NEW] [tests/network-interceptor-actor.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/network-interceptor-actor.test.ts)
- Yerel test sunucusu ve SPA taklidi üzerinde XHR/Fetch JSON API çağrılarının yakalandığı doğrulanacak.
- URL filtre desenleri ve SSRF engellemesi test edilecek.

#### [NEW] [tests/serp-search-actor.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/serp-search-actor.test.ts)
- Mock DuckDuckGo HTML arama çıktısı üzerinden organik sonuçların, sıralamaların ve snippet'lerin çıkarıldığı test edilecek.
- SSRF engellemesi doğrulanacak.

---

## Verification Plan

### Automated Tests
```bash
# 1. Tip denetimi
npm run typecheck

# 2. Birim testleri (yeni testler dahil)
npm test

# 3. Linter ve biçimlendirme denetimi
npm run lint

# 4. Connectome güncellemesi ve doğrulama hattı
npm run connectome
npm run verify
```

### Git Commit Planı
Yapılan çalışmalar `docs/git-commit-convention.md` standardına uygun olarak taahhüt edilecektir:
- `feat(actors): implement network-interceptor and serp-search actors`
- `docs(plans): update roadmap plan and walkthrough for phase 4`
