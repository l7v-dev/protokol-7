# ADR 0001: Standalone Scraping and Browser Automation Service Architecture

## Status
Accepted

## Context
1. Web kazıma (scraping), derin web tarama (crawling) ve Playwright Chromium tabanlı tarayıcı otomasyonu, ağır yerel ikili dosyalar (`chromium`), DOM ayrıştırma kütüphaneleri (`cheerio`, `jsdom`, `@mozilla/readability`) ve yüksek bellek tüketimi gerektirir.
2. Bu alt sistemlerin saf AI chatbot ve kodlama platformları (`Agent-Smith`) ile aynı süreç içerisinde çalışması; derleme sürelerini uzatmakta, sunucu bellek ayak izini şişirmekte ve çökme alanlarını (blast radius) genişletmektedir.
3. Kazıma ve tarayıcı otomasyonu yeteneklerinin bağımsız bir süreç ve mikroservis olarak izole edilmesi ihtiyacı doğmuştur.

## Decision
- `protokol-7`, tüm kazıma aktörlerini ve tarayıcı havuzunu bünyesinde barındıran bağımsız bir Node.js HTTP REST mikroservisi olarak kurulmuştur.
- Harici istemciler (örn. `Agent-Smith`), `protokol-7` ile standart HTTP JSON REST uç noktaları (`/api/v1/scrape`, `/api/v1/crawl`, `/api/v1/browser/action`) üzerinden haberleşir.
- Herhangi bir dış bağımlılık veya monolitik kütüphane bağlantısı taşınmaz; sözleşmeler salt JSON veri modelleri üzerinden yürütülür.

## Consequences
- **Pozitif**:
  - `Agent-Smith` ve diğer tüketici projeler Chromium ve ağır kazıma paketlerinden arındırılmış, hafifletilmiştir.
  - Olası bir Playwright Chromium çökmesi ana ajanı veya API sunucusunu etkilemez.
  - `protokol-7` kendi kaynak sınırları ve yaşam döngüsüyle bağımsız ölçeklendirilebilir.
- **Negatif**:
  - Kazıma isteklerinde yerel süreç içi çağrı yerine yerel HTTP döngüsü (loopback latency, ~1-3ms) eklenir. Ağ ve servis erişilebilirlik hataları için dayanıklı hata yönetimi gerekir.
