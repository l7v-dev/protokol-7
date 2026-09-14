# Faz 2: Doğrulama ve Bilişsel Altyapı Düzeltmeleri Uygulama Planı

Bu plan, **protokol-7** sistemindeki bilişsel altyapı ve kod kalitesi araçlarını (Connectome haritası, ADR mimari kayıtları, Biome statik analizi ve deterministik doğrulama hattı) projenin gerçek mimarisiyle tam uyumlu hale getirmeyi hedefler.

## User Review Required

> [!IMPORTANT]
> - `rules/trust-tiers.md` gereğince bu görev **Tier 2 (Kısıtlı Otomasyon)** kapsamındadır çünkü derleme, linter kuralları (`biome.json`), doğrulama hattı (`verify-pipeline.mjs`) ve mimari dokümantasyonu (`context/connectome.md`, `docs/adr/`) etkilemektedir.
> - `biome.json` içinde `noThisInStatic` ve `noStaticOnlyClass` kuralları kapatılacaktır (`"off"`), çünkü `SSRFGuard`, `StructuredExtractor` ve `UrlNormalizer` gibi bileşenler TypeScript'in nesne yönelimli statik yardımcı sınıf (utility class) ve metod içi `this` tasarım desenini kullanmaktadır.

---

## Proposed Changes

### 1. Connectome Üreticisi ve Sistem Haritası

#### [MODIFY] [scripts/generate-connectome.mjs](file:///home/l7v/l7v-dev/protokol-7/scripts/generate-connectome.mjs)
- `ROUTE_PATTERN` ve rota çıkarma mantığı güncellenecek: `src/server.ts` içerisindeki `method === "METHOD" && pathname === "..."`, çoklu rota alternatifleri (`pathname === "/api/v1/actors" || pathname === "/actors"`) ve regex parametreli rotalar (`/browser/session/:id/tab/:tabId/...`) ayrıştırılacak.
- `ACTOR_PATTERN`: `registry.register(new ClassName())` sözdizimini eşleyecek ve aktör sınıf isimlerini aktör anahtarlarıyla (`cheerio-scraper`, `playwright-browser`, `api-extractor`, `crawler`) ilişkilendirecek.
- `npm run connectome` çalıştırılarak [context/connectome.md](file:///home/l7v/l7v-dev/protokol-7/context/connectome.md) eksiksiz olarak yeniden üretilecek.

---

### 2. Mimari Karar Kaydı (ADR) Çakışma Çözümü

#### [DELETE / RENAME] `docs/adr/0001-brain-inspired-agent-architecture.md` -> [NEW] [docs/adr/0004-brain-inspired-agent-architecture.md](file:///home/l7v/l7v-dev/protokol-7/docs/adr/0004-brain-inspired-agent-architecture.md)
- `0001-standalone-scraping-service-architecture.md` ile çakışan `0001` sıra numarası, kronolojik olarak bir sonraki boş numara olan `0004` olarak güncellenecek.
- `docs/walkthroughs/omega-3-mimari-konsolidasyon-ve-otomasyon-walkthrough.md` ve ilgili planlardaki dosya referansları güncellenecek.

---

### 3. Doğrulama Hattı ve Emoji Taraması

#### [MODIFY] [scripts/verify-pipeline.mjs](file:///home/l7v/l7v-dev/protokol-7/scripts/verify-pipeline.mjs)
- Sıfır emoji taraması sadece `scripts/` dizinini değil, `["scripts", "src", "tests"]` dizinlerinin tamamını denetleyecek.
- Biome adımı sadece `scripts/` değil, tüm projeyi denetleyecek.

---

### 4. Biome Linter ve Biçimlendirme Entegrasyonu

#### [MODIFY] [biome.json](file:///home/l7v/l7v-dev/protokol-7/biome.json)
- `files.includes` genişletilecek:
  `["scripts/**/*.mjs", "scripts/**/*.js", "scripts/**/*.ts", "package.json", "src/**/*.ts", "tests/**/*.ts"]`
- TypeScript statik sınıf desenini korumak için `complexity.noThisInStatic: "off"` ve `complexity.noStaticOnlyClass: "off"` eklenecek.
- Testlerdeki boş/kullanılmayan callback parametreleri için uyumluluk sağlanacak veya `_req` formatına getirilecek.
- Güvenli import sıralaması ve formatlama (`npx @biomejs/biome check --write`) çalıştırılacak.

---

## Verification Plan

### Automated Tests
```bash
# 1. Connectome üretimi
npm run connectome
git diff context/connectome.md

# 2. Biome linter ve statik analiz denetimi
npm run lint

# 3. TypeScript derleme kontrolü
npm run typecheck

# 4. Tüm birim ve entegrasyon testleri
npm test

# 5. Deterministik doğrulama hattı
npm run verify
```

### Manual Verification
- `context/connectome.md` dosyasında `(Belirlenemedi)` uyarısı kalmadığı ve tüm API rotaları ile aktörlerin listelendiği doğrulanacak.
- `docs/adr/` altında çift `0001` dosyasının kalmadığı doğrulanacak.
