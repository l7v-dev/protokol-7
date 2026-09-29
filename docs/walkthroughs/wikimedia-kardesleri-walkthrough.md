# Wikimedia Kardeş Projeleri Paketi (Set 1) Walkthrough

Bu doküman, Wikimedia Vakfı'nın 7 temel kardeş projesi için geliştirilen aktörlerin (`wikiquote`, `wikibooks`, `wikiversity`, `wikivoyage`, `wikinews`, `wikispecies`, `wikidata`) mimari sözleşmelerini, sistem entegrasyonlarını ve doğrulama sonuçlarını belgeler.

---

## 1. Hayata Geçirilen Aktörler ve Teknik Kapsam

| Aktör | Sınıf | Port / Endpoint | MCP Aracı | Veri Tipi ve Kaynak Mimarisi |
|---|---|---|---|---|
| **wikiquote** | `WikiquoteActor` | `POST /api/v1/wikiquote` | `query_wikiquote` | 90+ dünya dilinde edebi, felsefi ve tarihsel aforizmalar, atasözleri, diyaloglar (`{lang}.wikiquote.org`). |
| **wikibooks** | `WikibooksActor` | `POST /api/v1/wikibooks` | `query_wikibooks` | 120+ dilde açık üniversite ve teknik ders kitapları, kılavuzlar (`{lang}.wikibooks.org`). |
| **wikiversity** | `WikiversityActor` | `POST /api/v1/wikiversity` | `query_wikiversity` | 17+ dilde akademik müfredat, ders modülleri ve açık pedagojik materyaller (`{lang}.wikiversity.org`). |
| **wikivoyage** | `WikivoyageActor` | `POST /api/v1/wikivoyage` | `query_wikivoyage` | 30+ dilde coğrafi konumlar, şehir rehberleri, seyahat ve lojistik profilleri (`{lang}.wikivoyage.org`). |
| **wikinews** | `WikinewsActor` | `POST /api/v1/wikinews` | `query_wikinews` | 35+ dilde tarihsel haber bültenleri, kronolojiler ve gazetecilik metinleri (`{lang}.wikinews.org`). |
| **wikispecies** | `WikispeciesActor` | `POST /api/v1/wikispecies` | `query_wikispecies` | Biyolojik taksonomi, Linnaean hiyerarşisi, kladlar ve nomenklatür (`species.wikimedia.org`). |
| **wikidata** | `WikidataActor` | `POST /api/v1/wikidata` | `query_wikidata` | Q-ID varlıkları, P-ID iddiaları, etiketler ve SPARQL sorgulama motoru (`www.wikidata.org` ve `query.wikidata.org`). |

---

## 2. Mimari Entegrasyon ve Sözleşmeler

Tüm aktörler 8 aşamalı Aktör Sözleşmesi (`docs/actor-contract.md`) gereksinimlerine göre entegre edilmiştir:

1. **Tip Tanımları (`src/api/types.ts`):**
   - `ActorType` union genişletildi.
   - Her aktör için `Options` ve `Result` arayüzleri tanımlandı ve `ActorTask` bileşenine bağlandı.
2. **Aktör Sınıfları (`src/actors/corpus/`):**
   - Temiz HTTP istemcisi, SSRF koruması (`SSRFGuard.validateUrlWithDns`), timeout ve hata yönetimi eklendi.
   - Wikispecies tekil küresel alan adı (`species.wikimedia.org`) için özelleştirildi.
   - Wikidata için varlık çözümleme ve SPARQL endpoint entegrasyonu sağlandı.
3. **Kategori ve Kök İhracatları (`src/actors/corpus/index.ts`, `src/index.ts`):**
   - 7 aktör sınıfı dışa aktarıldı.
4. **Manifesto ve Şemalar (`src/actors/actor-manifests.ts`):**
   - Zod ve JSON Schema şemaları tanımlandı.
   - MCP araç tanımları (`query_wikiquote`, `query_wikibooks`, `query_wikiversity`, `query_wikivoyage`, `query_wikinews`, `query_wikispecies`, `query_wikidata`) eklendi.
5. **Merkezi Kayıt (`src/actors/actor-registry.ts`):**
   - `createDefaultActorRegistry()` içine 7 aktör kaydedildi.
6. **HTTP Sunucu ve OpenAPI 3.1.0 (`src/api/server.ts`, `src/api/openapi-spec.ts`):**
   - `POST /api/v1/<name>` ve `POST /<name>` rotaları bağlandı.
   - OpenAPI 3.1.0 tanımları tam şemalarıyla eklendi.
7. **MCP Sunucu Araç Haritalaması (`src/mcp/protokol-mcp-server.ts`):**
   - Toplam MCP araç sayısı 64'e yükseltildi.
8. **Testler, Örnekler ve Wiki Dokümantasyonu:**
   - Örnek yapılandırmalar: `examples/actors/<actor>.json`
   - Teknik wiki sayfaları: `docs/actors/<actor>.md`
   - Birim ve entegrasyon testleri: `tests/<actor>-actor.test.ts`

---

## 3. Doğrulama ve Test Sonuçları

- **Test Paketi:** 749 / 749 test başarılı (`npm test`).
- **Statik Tip Denetimi:** `npm run typecheck` sıfır hata ile tamamlandı.
- **Biçim ve Kod Standartları:** Biome linter ve format kontrolleri hatasız geçti.
- **6 Aşamalı Doğrulama Hattı (`npm run verify`):**
  1. Dosya bütünlüğü: PASS
  2. İsimlendirme disiplini (reklamsız/teknik): PASS
  3. Sıfır emoji politikası: PASS
  4. Gizli anahtar / secret taraması: PASS
  5. SCA güvenlik denetimi: PASS
  6. Biome kod kalitesi: PASS
