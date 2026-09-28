# Formel Mantık, Teorem Kanıtlama ve Rasyonalite Aktörleri Uygulama Planı (Faz 4)

Bu plan, **protokol-7** bünyesinde yapay zeka modellerinin sembolik mantık, aksiyomatik matematik, formel doğrulama (formal verification) ve epistemik rasyonalite alanlarında derin muhakeme (deep reasoning) yeteneklerini geliştirmek üzere 3 kritik korpus aktörünün (`proofwiki`, `lean-mathlib`, `lesswrong`) mimari sözleşmelere ve deterministik kalite kapılarına uygun olarak geliştirilmesini tanımlar.

---

## 1. Kapsam ve Aktörler

1. **proofwiki-actor (`proofwiki`):**
   - MediaWiki API (`https://proofwiki.org/w/api.php`) entegrasyonu.
   - Teoremler (`theorems`), aksiyomlar (`axioms`), tanımlar (`definitions`) ve adım adım matematiksel ispat zincirlerinin (`proofs`) çekilmesi.
   - LaTeX denklemleri ve denklem şablonlarının (`{{begin-eqn}}`, `{{eqn}}`) temiz GFM Markdown formatına dönüştürülmesi.
   - Gayriresmi matematiksel akıl yürütme (informal Chain-of-Thought) korpusu üretimi.

2. **lean-mathlib-actor (`lean-mathlib`):**
   - Lean 4 / Mathlib4 ve Archive of Formal Proofs (Isabelle) depolarından formel matematiksel kanıtların çekilmesi.
   - Teorem tanımları (`theorem`, `lemma`), tip kuralları, taktikler (`tactics`: `rw`, `simp`, `exact`, `induction` vb.) ve kanıt gövdelerinin yapılandırılması.
   - Halüsinasyonu matematiksel olarak imkansız kılan, bilgisayar tarafından doğrulanabilir sembolik mantık eğitimi için veri çiftleri üretimi.

3. **lesswrong-actor (`lesswrong`):**
   - LessWrong ve Alignment Forum GraphQL API (`https://www.lesswrong.com/graphql`) entegrasyonu.
   - Bayesyen rasyonalite, karar teorisi, yapay zeka güvenliği/hizalama (alignment), bilişsel önyargılar ve analitik felsefe metinlerinin çekilmesi.
   - Gönderi (`post`), yazar (`user`), oy/puan (`score`), diyalektik yorum ağacı ve tez-antitez argümantasyon zincirlerinin ayrıştırılması.

---

## 2. Mimari Sözleşmeler ve Güvenlik İnvariantları

`docs/actor-contract.md` standardı uyarınca her aktör için:
1. `src/api/types.ts`: `ActorType` union listesine ekleme, `TaskOptions` ve `Result` sözleşmeleri.
2. `src/actors/corpus/<ad>-actor.ts`: `IActor<T>` implementasyonu, `SSRFGuard`, zaman aşımı kontrolleri ve deterministik Markdown motoru.
3. `src/actors/corpus/index.ts` & `src/index.ts`: Modüler ve kök barel ihracı.
4. `src/actors/actor-manifests.ts`: Manifesto tanımı, Zod girdi şeması ve MCP aracı (`query_proofwiki`, `query_lean_mathlib`, `query_lesswrong`).
5. `src/actors/actor-registry.ts`: `createDefaultActorRegistry` kaydı.
6. `src/mcp/protokol-mcp-server.ts`: MCP `tools/call` yönlendiricisi ve parametre eşlemesi.
7. `src/api/server.ts` & `src/api/openapi-spec.ts`: REST yönlendirici ve OpenAPI 3.1.0 spesifikasyonu.
8. `examples/actors/<ad>.json` & `examples/pipelines/<ad>-pipeline.yaml`: Örnek çalışma yükü ve boru hattı yapılandırması.
9. `tests/<ad>-actor.test.ts`, `tests/server.test.ts`, `tests/protokol-mcp-server.test.ts`: Kapsamlı test süiti.
10. `docs/actors/<ad>.md`: Mermaid mimari/sıra/durum diyagramlı teknik wiki dokümantasyonu.
11. `context/architecture-schema.md`: Aktör sayısı ve test envanteri senkronizasyonu.
12. `docs/walkthroughs/<ad>-walkthrough.md`: Kalıcı doğrulama raporu.

---

## 3. Uygulama Adımları

- [x] **Adım 1: ProofWiki Matematiksel İspat Aktörü (`proofwiki-actor`)**
- [x] **Adım 2: Lean 4 / Mathlib Formel Doğrulama Aktörü (`lean-mathlib-actor`)**
- [x] **Adım 3: LessWrong & Alignment Forum Rasyonalite Aktörü (`lesswrong-actor`)**
- [x] **Adım 4: Entegre Testler, Kalite Kapıları ve Doğrulama**
