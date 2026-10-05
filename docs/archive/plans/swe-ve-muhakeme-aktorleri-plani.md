# SWE ve Muhakeme Aktörleri Uygulama Planı (Faz 2)

Bu plan, **protokol-7** bünyesinde yazılım mühendisliği (SWE), akademik hakem değerlendirmesi ve teknik muhakeme verisi toplayan aktörlerin (`github`, `openreview`, `hacker-news`) mimari sözleşmelere ve kalite kapılarına uygun olarak geliştirilmesini tanımlar.

---

## 1. Kapsam ve Aktörler

1. **github-actor (`github`):**
   - GitHub açık kaynak ambarları (README, Releases, Issues, Pull Requests, Commit ağacı ve kod dosyaları).
   - GitHub REST API v3 (`https://api.github.com`) tabanlı; `GITHUB_TOKEN` desteği ile hız sınırı (rate limit) yönetimi.
   - LLM için Markdown dokümantasyon, kod inceleme ve sorun giderme çiftleri üretimi.

2. **openreview-actor (`openreview`):**
   - OpenReview akademik yayın platformu (ICLR, NeurIPS, ICML) makaleleri, hakem yorumları, yazar yanıtları (rebuttals) ve meta-incelemeler.
   - Resmi OpenReview API v1/v2 (`https://api.openreview.net` / `https://api2.openreview.net`) desteği.
   - LLM'lerin eleştirel düşünme, bilimsel muhakeme ve argümantasyon yetenekleri için yüksek kaliteli diyalektik veri.

3. **hacker-news-actor (`hacker-news`):**
   - Y Combinator Hacker News tartışmaları, teknik analizler, "Show HN", "Ask HN" ve iç içe yorum ağaçları.
   - Resmi Firebase REST API (`https://hacker-news.firebaseio.com/v0/`) ve Algolia arama API (`https://hn.algolia.com/api/v1/`) desteği.
   - Mühendislik tartışmaları ve teknik akıl yürütme verisi.

---

## 2. Mimari Sözleşmeler ve Güvenlik İnvariantları

`docs/actor-contract.md` standardı uyarınca her aktör için:
1. `src/api/types.ts`: `ActorType` union listesine ekleme, `TaskOptions` ve `Result` tipleri.
2. `src/actors/corpus/<ad>-actor.ts`: `IActor<T>` implementasyonu, `SSRFGuard`, zaman aşımı kontrolleri ve GFM Markdown render motoru.
3. `src/actors/corpus/index.ts` & `src/index.ts`: Modüler ve kök barel ihracı.
4. `src/actors/actor-manifests.ts`: Manifesto tanımı, Zod girdi şeması ve MCP aracı (`query_github`, `query_openreview`, `query_hacker_news`).
5. `src/actors/actor-registry.ts`: `createDefaultActorRegistry` kaydı.
6. `src/mcp/protokol-mcp-server.ts`: MCP `tools/call` ve araç yönlendirme eşlemesi.
7. `src/api/server.ts` & `src/api/openapi-spec.ts`: REST yönlendirici ve OpenAPI 3.1.0 spesifikasyonu.
8. `examples/actors/<ad>.json` & `examples/pipelines/<ad>-pipeline.yaml`: Örnek çalışma yükü ve boru hattı yapılandırması.
9. `tests/<ad>-actor.test.ts`, `tests/server.test.ts`, `tests/protokol-mcp-server.test.ts`: Kapsamlı test süiti.
10. `docs/actors/<ad>.md`: Mermaid diyagramlı teknik wiki dokümantasyonu.
11. `context/architecture-schema.md`: Aktör sayısı ve test envanteri senkronizasyonu.
12. `docs/walkthroughs/<ad>-walkthrough.md`: Kalıcı doğrulama raporu.

---

## 3. Uygulama Adımları

- [x] **Adım 1: GitHub Aktörü (`github-actor`)** — Tamamlandı (10/10 birim test, REST, MCP, Wiki, Walkthrough).
- [x] **Adım 2: OpenReview Aktörü (`openreview-actor`)** — Tamamlandı (7/7 birim test, REST, MCP, Wiki, Walkthrough).
- [x] **Adım 3: Hacker News Aktörü (`hacker-news-actor`)** — Tamamlandı (7/7 birim test, REST, MCP, Wiki, Walkthrough).
- [x] **Adım 4: Entegre Testler, Kalite Kapıları ve Doğrulama** — Tamamlandı (577/577 test, Biome format, Verify, Doctor).

