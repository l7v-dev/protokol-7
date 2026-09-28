# Tüm Aktörlerin Modüler Paket (`mcp/` Dizinli, `wiki.md` Şartnameli) Mimarisine Taşınması Planı

## 1. Amaç ve Kapsam

Kullanıcı gereksinimi doğrultusunda:
1. Modüler aktör klasörleri içindeki alt araç dizininin adı `tools` yerine doğrudan `mcp` olarak güncellenecektir (`src/actors/<kategori>/<ad>/mcp/`).
2. Protokol-7 bünyesindeki 31 aktörün tamamı (`web`, `corpus`, `documents`) bu yeni standart mimariye taşınacaktır:
   - `<name>-actor.ts`: Aktörün iş mantığı ve çekirdek uygulama sınıfı.
   - `<name>-actor.test.ts`: Eş-konumlu (colocated) birim ve SSRF test süiti.
   - `wiki.md`: `docs/actor-wiki-template.md` standardına uygun, 3 adet Mermaid şeması (Flowchart mimari, Sequence yaşam döngüsü, State makinesi) içeren teknik dokümantasyon.
   - `mcp/<name>-mcp-tool.ts`: Aktöre ait MCP araç şeması ve çalışma zamanı işleyicisi.
   - `mcp/index.ts`: MCP araç modülü bareli.
   - `index.ts`: Modül kök bareli (`export * from "./mcp"; export * from "./<name>-actor";`).
3. Geriye dönük uyumluluk (%100 zero-breaking change):
   - `src/actors/<kategori>/<name>-actor.ts` dosyaları trampolin olarak tutulacak ve `./<name>/<name>-actor` re-export edecektir.
   - Mevcut tüm importlar, REST rotaları ve testler kesintisiz çalışacaktır.

---

## 2. Aktör Listesi ve Kategoriler

| Kategori | Aktörler (Toplam: 31) |
|---|---|
| **web** (8) | `cheerio-scraper`, `playwright-browser`, `api-extractor`, `crawler`, `sitemap-xml`, `markdown-reader`, `network-interceptor`, `serp-search` |
| **corpus** (19) | `arxiv`, `clinical-trials`, `court-listener`, `dergipark`, `eur-lex`, `europe-pmc`, `gutenberg`, `ietf-rfc`, `internet-archive`, `ktb-ekitap`, `mit-ocw`, `open-fda`, `openalex`, `openstax`, `saglik-ekutuphane`, `sec-edgar`, `software-heritage`, `stack-exchange`, `wikipedia` |
| **documents** (4) | `archive-extractor`, `document-extractor`, `epub-extractor`, `pdf-document` |

---

## 3. Uygulama Aşamaları

### Aşama 1: `tools/` -> `mcp/` Adlandırma Güncellemesi
* [docs/actor-wiki-template.md](file:///home/l7v/l7v-dev/play/protokol-7/docs/actor-wiki-template.md) dosyasındaki `tools/` referanslarının `mcp/` olarak güncellenmesi.
* [scripts/scaffold-actor.mjs](file:///home/l7v/l7v-dev/play/protokol-7/scripts/scaffold-actor.mjs) üretecinin `tools/` yerine `mcp/` klasörü üretmesi.
* [src/actors/corpus/wikipedia/](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/corpus/wikipedia/) içindeki `tools/` klasörünün `mcp/` olarak yeniden adlandırılması ve içe aktarma yollarının güncellenmesi.

### Aşama 2: Otomatik Modülerleştirici ve Taşınma Betiği
* 30 aktörü güvenli, hatasız ve deterministik bir şekilde dönüştürmek için geçici/yardımcı bir Node.js betiği (`scripts/migrate-actors-to-modular.mjs`) hazırlanması:
  - Aktör dosyasını okuyup derinlikteki importları (`../../` -> `../../../`) uyarlayarak `<kategori>/<ad>/<ad>-actor.ts` içine yazma.
  - Orijinal `<kategori>/<ad>-actor.ts` dosyasını `export * from "./<ad>/<ad>-actor";` trampolinine dönüştürme.
  - Aktörün manifestosundaki MCP tanımına göre `mcp/<ad>-mcp-tool.ts` ve `mcp/index.ts` oluşturma.
  - `docs/actor-wiki-template.md` standardında Mermaid diyagramları içeren `wiki.md` üretme.
  - Varsa `tests/<ad>-actor.test.ts` testini eş-konumlu `<ad>-actor.test.ts` olarak uyarlama ve kökteki test dosyasını köprüleme.
  - `<kategori>/<ad>/index.ts` barelini yazma.
  - `<kategori>/index.ts` içine `export * from "./<ad>";` ekleme.

### Aşama 3: Derleme ve Test Doğrulaması
* `npm run typecheck` ile 0 tip hatası doğrulaması.
* `npm test` ile tüm 510+ testin eksiksiz yeşil geçmesi.
* `npm run format` ve `npm run lint` ile Biome denetimi.

### Aşama 4: Nihai Doğrulama ve Teslim
* `npm run verify` (6 katmanlı deterministik doğrulama).
* `context/architecture-schema.md` dosyasının tüm aktör modüllerini içerecek şekilde güncellenmesi.
* `TASKS.md` ve `docs/walkthroughs/tum-aktorler-moduler-mcp-ve-wiki-walkthrough.md` güncellemeleri.
