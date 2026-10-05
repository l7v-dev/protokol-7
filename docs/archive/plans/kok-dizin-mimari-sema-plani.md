# Mimari Şema ve Kök Dizin Bakım Kolaylaştırma Planı

Bu plan, **protokol-7** projesinin kök dizininden başlayarak kod tabanını daha modüler, ölçeklenebilir ve bakımı kolay bir mimari şemaya kavuşturmayı hedefler.

## User Review Required

> [!IMPORTANT]
> - Şu an `src/` dizini altında 27 dosya ve `tests/` dizini altında 17 dosya tamamen tek bir düz liste (*flat*) halinde bulunmaktadır.
> - Bu durum proje büyüdükçe aktörler, tarayıcı motoru, ağ/güvenlik araçları ve ayrıştırıcılar arasındaki sınırların bulanıklaşmasına ve bilişsel yükün artmasına yol açmaktadır.
> - Önerilen şema, projeyi 5 temel etki alanına (*domain*) ayırarak kök dizinden yapraklara kadar net bir sınır çizerken, `src/index.ts` barrel export'ları sayesinde geriye dönük tam uyumluluğu korur.

---

## Önerilen Mimari Şema (Root-to-Leaf Blueprint)

### 1. Kök Dizin (`/`) Katmanları

```text
protokol-7/
├── .agents/ / skills/     # Bilişsel yetenek kütüphanesi (Serebellum - 38 teknik beceri)
├── rules/                 # Omega-3 bilişsel kurallar (Amigdala & Bazal Ganglia)
├── context/               # Mimari sözleşmeler, connectome ve bağlam belgeleri (Korteks)
├── docs/                  # Planlar (docs/plans/), doğrulamalar (docs/walkthroughs/), ADR'lar
├── scripts/               # Deterministik doğrulama, connectome ve bellek betikleri
├── src/                   # Uygulama kaynak kodları (Domain bazlı alt dizinler)
│   ├── core/              # Çekirdek tipler, HTTP sunucu ve barrel export
│   ├── actors/            # Ayrıştırma ve tarama aktörleri + ActorRegistry
│   ├── browser/           # Playwright havuzu, oturum yönetimi, stealth, dom indexer
│   ├── extractors/        # Readability, HTML tablo, JSON-LD, Robots parser
│   └── network/           # SSRF guard, Politeness rate limiter, URL normalizer & matcher
├── tests/                 # Node.js test takımları (src/ ile birebir örtüşen modüler yapı)
├── flake.nix / devenv.nix # NixOS deklaratif geliştirme ortamı
├── biome.json             # Linter ve biçimlendirme kuralları
├── package.json           # Proje bağımlılıkları ve çalıştırma betikleri
└── TASKS.md               # Çalışan bellek (Hipokampüs)
```

---

## Proposed Changes

### Aşama 1: Kök Dizin Mimari Dokümantasyonu
- **[NEW] [ARCHITECTURE.md](file:///home/l7v/l7v-dev/protokol-7/ARCHITECTURE.md)**: Kök dizinde yer alan, her klasörün ve dosyanın teknik sorumluluğunu, bağımlılık yönünü ve veri akış diyagramını içeren kapsamlı şema.
- **[MODIFY] [context/architecture-schema.md](file:///home/l7v/l7v-dev/protokol-7/context/architecture-schema.md)**: Güncellenmiş modüler dizin envanterini yansıtacak şekilde revize edilecek.

### Aşama 2: `src/` Kaynak Kodunun Modüler Dizinlere Ayrılması
Aşağıdaki 5 etki alanı dizini oluşturulup dosyalar taşınacaktır:

1. **`src/core/`**:
   - `types.ts`
   - `server.ts`
   - `index.ts` (ana dışa aktarım noktası, kök `src/index.ts` burayı re-export eder)

2. **`src/actors/`**:
   - `actor-registry.ts`
   - `cheerio-scraper-actor.ts`
   - `playwright-browser-actor.ts`
   - `api-extractor-actor.ts`
   - `crawler-actor.ts`
   - `sitemap-xml-actor.ts`
   - `markdown-reader-actor.ts`
   - `network-interceptor-actor.ts`
   - `serp-search-actor.ts`

3. **`src/browser/`**:
   - `browser-pool.ts`
   - `browser-session-manager.ts`
   - `interactive-browser-controller.ts`
   - `stealth-manager.ts`
   - `dom-indexer.ts`

4. **`src/extractors/`**:
   - `readability-extractor.ts`
   - `structured-extractor.ts`
   - `robots-parser.ts`

5. **`src/network/`**:
   - `ssrf-guard.ts`
   - `politeness-limiter.ts`
   - `url-normalizer.ts`
   - `url-pattern-matcher.ts`
   - `crawl-url-accumulator.ts`

### Aşama 3: Barrel Export ve İçe Aktarım Uyumluluğu
- Kök `src/index.ts` tüm modülleri merkezi olarak dışa aktarmaya devam edecek (`export * from "./actors/..."`, vb.).
- `tsconfig.json` dosyasındaki path alias (`@/*`) modüler yolları ve kök modülleri kusursuz destekleyecek şekilde güncellenecek.
- `scripts/generate-connectome.mjs` ve `scripts/verify-pipeline.mjs` yeni dosya yollarını tarayacak şekilde güncellenecektir.

---

## Verification Plan

### Automated Tests
1. **Tip Denetimi:**
   ```bash
   npm run typecheck
   ```
2. **Tüm Birim Testleri:**
   ```bash
   npm test
   ```
3. **Nix İzole Ortam Doğrulaması:**
   ```bash
   nix develop --command npm test
   ```
4. **Deterministik Doğrulama Hattı:**
   ```bash
   npm run connectome
   npm run verify
   ```

### Git Commit Planı
- `refactor(architecture): organize src into modular domain packages`
- `docs(architecture): add root ARCHITECTURE.md schema and update context`
