# ADR 0003: Multi-Actor Pipeline and Readability Markdown Extraction

## Status
Accepted

## Context
1. Web sayfalarındaki içerikler farklı karakteristiklere sahiptir: Statik HTML sayfaları hafif HTTP istekleriyle okunabilirken, SPA (Single Page Application) siteleri JavaScript yürütme gerektirir.
2. Ham HTML içerikleri LLM bağlam pencerelerini (context window) gereksiz biçimde doldurur (reklamlar, navigasyon menüleri, footer linkleri, script kodları).
3. Ajanların ve LLM'lerin en yüksek verimle tüketebileceği format, temiz ve yapısal GitHub Flavored Markdown (GFM) formatıdır.

## Decision
- Çok katmanlı bir aktör mimarisi kurgulanmıştır:
  - `CheerioScraperActor`: JavaScript gerektirmeyen sayfalar için mikro-saniye seviyesinde hızlı statik HTML ayrıştırıcı.
  - `PlaywrightBrowserActor`: Dinamik DOM render gerektiren sayfalar için headless Chromium aktörü.
  - `ApiExtractorActor`: REST JSON API uç noktalarından veri çekme ve sayfalama aktörü.
- `ReadabilityExtractor`: `@mozilla/readability`, `jsdom` ve `turndown` kütüphanelerini birleştirerek ham HTML'i ana makale metnine indirger ve GFM Markdown çıktısı üretir.
- `StructuredExtractor`: Sayfadaki HTML tablolarını tespit ederek doğrudan GFM Markdown tablolarına (`| col1 | col2 |`) dönüştürür.

## Consequences
- **Pozitif**:
  - LLM'lere aktarılan içerik boyutu ortalama %80 oranında küçülür; token maliyeti düşer ve odaklanma artar.
  - Statik sayfalar Playwright beklemelerine takılmadan Cheerio ile milisaniyeler içinde çekilir.
  - Tablo ve metaveriler deterministik olarak yapısal nesnelere dönüştürülür.
- **Negatif**:
  - JS gerektiren sayfaların ilk denemede Cheerio ile boş dönmesi durumunda Playwright aktörüne geri çekilme (fallback) mekanizması ek CPU/zaman maliyeti getirir.
