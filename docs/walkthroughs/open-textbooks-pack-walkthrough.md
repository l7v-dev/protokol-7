# Açık Üniversite & STEM Ders Kitapları Paketi (Set 3) Walkthrough

Bu doküman, `docs/plans/wikimedia-kardesleri-ve-yeni-aktor-setleri-plani.md` kapsamındaki **SET 3: Açık Üniversite & STEM Ders Kitapları Paketi** dahilinde hayata geçirilen 3 aktörün (`libretexts`, `open-textbook`, `semantic-scholar`) mimari tasarımını, tip sözleşmelerini, REST/MCP entegrasyonlarını ve doğrulama sonuçlarını belgeler.

---

## 1. Uygulanan Aktörler Özeti

| Aktör Kodu | Sınıf Adı | Kategori | Kaynak ve Protokol | Desteklenen Modlar |
|---|---|---|---|---|
| `libretexts` | `LibreTextsActor` | `DOCUMENT` | LibreTexts CXone Expert / Deki REST API + HTML | `page`, `search`, `subpages`, `toc` |
| `open-textbook` | `OpenTextbookActor` | `DOCUMENT` | University of Minnesota Open Textbook Library | `book`, `search`, `subjects` |
| `semantic-scholar` | `SemanticScholarActor` | `API` | Semantic Scholar Academic Graph (S2AG) API | `paper`, `search`, `author`, `author_search`, `citations`, `references` |

---

## 2. Mimari Katmanlar ve Değişiklikler

1. **Tip Sözleşmeleri (`src/api/types.ts`)**:
   - `ActorType` union kümesine `"libretexts" | "open-textbook" | "semantic-scholar"` eklendi.
   - `LibreTextsActorTaskOptions`, `LibreTextsActorResult`, `LibreTextsPageItem` tanımlandı.
   - `OpenTextbookActorTaskOptions`, `OpenTextbookActorResult`, `OpenTextbookItem`, `OpenTextbookReview`, `OpenTextbookSubject` tanımlandı.
   - `SemanticScholarActorTaskOptions`, `SemanticScholarActorResult`, `SemanticScholarPaperItem`, `SemanticScholarAuthorItem` tanımlandı.
   - `ActorTask["options"]` nesnesine opsiyon alanları eklendi.

2. **Aktör Sınıfları (`src/actors/corpus/`)**:
   - `libretexts-actor.ts`: LibreTexts kütüphanelerinden (`chem`, `phys`, `math`, `eng` vb.) açık ders kitaplarını, bölüm hiyerarşisini, LaTeX/MathJax formüllerini (`$...$`) ve içindekiler tablosunu çeken aktör.
   - `open-textbook-actor.ts`: Minnesota Üniversitesi açık ders kitaplarını, PDF/EPUB/Online indirme formatlarını, içindekiler dizinini ve hakemli akademik değerlendirmeleri çeken aktör.
   - `semantic-scholar-actor.ts`: 200M+ makale içeren S2AG API üzerinden makale özetleri, yapay zeka TLDR özetleri, yazar profilleri, atıf ve referans ağlarını çeken aktör.

3. **Merkezi Kayıt & Dağıtım**:
   - `src/actors/corpus/index.ts` ve `src/index.ts` alfabetik sırada güncellendi.
   - `src/actors/actor-manifests.ts` içine Zod/JSON şemaları ve MCP araçları (`query_libretexts`, `query_open_textbook`, `query_semantic_scholar`) eklendi (toplam MCP araç sayısı 71'den 74'e çıktı).
   - `src/actors/actor-registry.ts` içinde `createDefaultActorRegistry()` fonksiyonuna 3 aktör kaydedildi (toplam aktör sayısı 54'ten 57'ye çıktı).
   - `src/mcp/protokol-mcp-server.ts` içinde görev opsiyonları haritalandı.

4. **HTTP REST Router & OpenAPI 3.1.0**:
   - `src/api/server.ts` rotaları:
     - `POST /api/v1/libretexts` & `POST /libretexts`
     - `POST /api/v1/open-textbook` & `POST /open-textbook`
     - `POST /api/v1/semantic-scholar` & `POST /semantic-scholar`
   - `src/api/openapi-spec.ts`: `Corpus - Academic & Open Textbooks` etiketi altında OpenAPI 3.1.0 rotaları eklendi.

5. **Dokümantasyon & Örnekler**:
   - `examples/actors/`: `libretexts.json`, `open-textbook.json`, `semantic-scholar.json`.
   - `docs/actors/`: `libretexts.md`, `open-textbook.md`, `semantic-scholar.md`.
   - `src/actors/README.md`: Hızlı referans tablosuna (62, 63, 64) ve detaylı bölümlere (44, 45, 46) eklendi.

6. **Birim ve Entegrasyon Testleri (`tests/`)**:
   - `tests/libretexts-actor.test.ts`: SSRF koruması, arama sorgusu, sayfa/bölüm çıkarma, LaTeX formül koruması, alt sayfa/TOC listesi ve 404 hata yönetimi.
   - `tests/open-textbook-actor.test.ts`: SSRF koruması, ders kitabı araması, kitap detayları/formatları/içindekiler/değerlendirmeler ve akademik konular listesi.
   - `tests/semantic-scholar-actor.test.ts`: SSRF koruması, makale çekme/abstract/TLDR, literatür araması, yazar profili ve atıf zinciri.
   - `tests/protokol-mcp-server.test.ts`: 74 MCP aracının listelenmesi ve Set 3 araçlarının yönlendirme doğrulaması.
   - `tests/server.test.ts`: 3 yeni REST uç noktasının HTTP yönlendirme doğrulaması (49/49 geçen test).

---

## 3. Doğrulama ve Test Sonuçları

- **TypeScript Typecheck (`tsc --noEmit`)**: 0 hata ile geçti.
- **Set 3 & MCP Testleri (`tsx --test`)**: 43/43 geçen test (0 hata).
- **Server Rotaları Testi (`tsx --test`)**: 49/49 geçen test (0 hata).
