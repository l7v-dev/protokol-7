# Faz 3: Çekirdek Aktörlerin Entegrasyonu Walkthrough

Bu belge, **protokol-7** sistemine eklenen iki yeni çekirdek aktörün (`sitemap-xml-actor` ve `markdown-reader-actor`) geliştirilmesini, test edilmesini ve mimari sisteme entegrasyonunu belgeler.

## Yapılan Değişiklikler

### 1. Tip ve Sözleşme Tanımları
- [src/types.ts](file:///home/l7v/l7v-dev/protokol-7/src/types.ts):
  - `ActorType` union genişletildi: `"sitemap-xml"` ve `"markdown-reader"` eklendi.
  - `SitemapUrlEntry`, `SitemapTaskOptions`, `SitemapResult` arayüzleri tanımlandı.
  - `MarkdownHeadingItem`, `MarkdownReaderTaskOptions`, `MarkdownReaderResult` arayüzleri eklendi.
  - `ActorTask.options` içine `sitemapOptions` ve `markdownOptions` eklendi.

### 2. Yeni Aktörlerin Geliştirilmesi
- [src/sitemap-xml-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/sitemap-xml-actor.ts):
  - Standart `<urlset>` ayrıştırması (`loc`, `lastmod`, `changefreq`, `priority`).
  - Özyinelemeli `<sitemapindex>` ve alt sitemap taraması (`maxDepth`, `maxUrls`).
  - Yerel `node:zlib.gunzipSync` ile sıkıştırılmış sitemap (`.xml.gz`) desteği.
  - RSS (`<item>`) ve Atom (`<entry>`) akış bağlantılarının çıkarılması.
  - Ağ çeperi ve SSRF koruması (`SSRFGuard.validateUrl`).
- [src/markdown-reader-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/markdown-reader-actor.ts):
  - `ReadabilityExtractor` ve `StructuredExtractor` ile makale ve tablo içeriğini temiz GFM markdown formatına damıtma.
  - YAML Frontmatter üretimi (`title`, `url`, `byline`, `siteName`, `publishedTime`, `characterCount`, `wordCount`, `estimatedTokens`).
  - Başlık hiyerarşisi (`#`, `##`, `###`) ve içindekiler tablosu (TOC) üretimi.
  - Ağ çeperi ve SSRF koruması.

### 3. Kayıt Defteri, Dışa Aktarım ve Sunucu Uç Noktaları
- [src/actor-registry.ts](file:///home/l7v/l7v-dev/protokol-7/src/actor-registry.ts):
  - `SitemapXmlActor` ve `MarkdownReaderActor` aktörleri `createDefaultActorRegistry` içine kaydedildi.
- [src/index.ts](file:///home/l7v/l7v-dev/protokol-7/src/index.ts):
  - Yeni aktörler dışa aktarıldı.
- [src/server.ts](file:///home/l7v/l7v-dev/protokol-7/src/server.ts):
  - `POST /api/v1/sitemap` (ve `/sitemap`) rotası eklendi.
  - `POST /api/v1/reader` (ve `/reader`) rotası eklendi.
- [scripts/generate-connectome.mjs](file:///home/l7v/l7v-dev/protokol-7/scripts/generate-connectome.mjs):
  - Yeni rotalar ve aktörler eşleme tablosuna dahil edildi.

### 4. Bütünlük ve Mimari Kayıtları
- [context/connectome.md](file:///home/l7v/l7v-dev/protokol-7/context/connectome.md):
  - 17 API rotası ve 6 aktör ile sistem haritası güncellendi.
- [context/architecture-schema.md](file:///home/l7v/l7v-dev/protokol-7/context/architecture-schema.md):
  - Yeni kaynak ve test dosyaları tekil doğruluk tablosuna eklendi.

---

## Doğrulama ve Test Sonuçları

### 1. Yeni Birim Testleri
- [tests/sitemap-xml-actor.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/sitemap-xml-actor.test.ts):
  - Standart urlset ayrıştırma, sitemapindex özyinelemeli tarama, gzip dekompresyonu, RSS/Atom feed link çıkarma ve SSRF engelleme test edildi (5/5 başarılı).
- [tests/markdown-reader-actor.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/markdown-reader-actor.test.ts):
  - Makale damıtma, YAML frontmatter, içindekiler tablosu (TOC), GFM tablo entegrasyonu ve SSRF engelleme test edildi (2/2 başarılı).

### 2. Tip Denetimi
```bash
npm run typecheck
# tsc --noEmit: Sıfır hata ile tamamlandı.
```

### 3. Bütünleşik Test Paketi
```bash
npm test
# 60 test çalıştırıldı, 60 test başarılı (%100 geçiş).
```

### 4. Deterministik Doğrulama Hattı
```bash
npm run verify
# [1/5] Mimari Dosya Bütünlüğü: OK
# [2/5] İsimlendirme Disiplini: OK
# [3/5] Sıfır Emoji Disiplini: OK (scripts, src, tests)
# [4/5] SCA Canlı Bağımlılık Denetimi: 6 paket doğrulandı (PASS)
# [5/5] Biome Statik Analiz: Checked 47 files. No fixes applied. (OK)
# DOGRULAMA BASARILI: Kod tabanı tüm doğrulama katmanlarından geçti.
```
