# Matematik, Mantık ve Benchmark Aktörleri Uygulama Planı (Faz 3)

Bu plan, **protokol-7** bünyesinde yapay zeka modellerinin ince ayarı (fine-tuning) ve kıyaslamalı değerlendirmesi (benchmarking) için matematiksel akıl yürütme (Chain-of-Thought), kodlama değerlendirmesi ve Hugging Face veri seti dilimlerini toplayan aktörlerin (`huggingface-datasets`, `math-reasoning`, `code-eval`) mimari sözleşmelere ve deterministik kalite kapılarına uygun olarak geliştirilmesini tanımlar.

---

## 1. Kapsam ve Aktörler

1. **huggingface-datasets-actor (`huggingface-datasets`):**
   - Hugging Face Datasets Server REST API (`https://datasets-server.huggingface.co/rows`, `/splits`, `/size`, `/info`) entegrasyonu.
   - Herhangi bir açık kaynaklı Hugging Face veri kümesini (`dataset`, `config`, `split`, `offset`, `limit`) tarama, satırları akıtma, sütun şemasını çıkarma.
   - Hugging Face API anahtarı (`HF_TOKEN`) opsiyonel desteği ile özel/sınırlı veri setlerine erişim.
   - JSON satırlarını yapılandırılmış veri kayıtlarına ve GFM Markdown tablosuna dönüştürme.

2. **math-reasoning-actor (`math-reasoning`):**
   - Matematiksel problem çözme ve çok adımlı düşünme zinciri (Chain-of-Thought - CoT) korpusu toplama (GSM8K, MATH, SVAMP, OlympiadBench).
   - Soru (`problem` / `question`), düşünce adımları (`reasoning` / `thought_process`), LaTeX matematiksel ifadeleri ve nihai cevap (`answer` / `boxed_result`) alanlarını ayrıştırma ve standartlaştırma.
   - SFT (Supervised Fine-Tuning) ve RLHF/DPO eğitimleri için standart Prompt-CoT-Answer diyalektik çiftleri üretimi.

3. **code-eval-actor (`code-eval`):**
   - Standart kodlama ve yazılım mühendisliği benchmark kümeleri (HumanEval, MBPP, SWE-bench) çıkarımı.
   - Fonksiyon adı/giriş noktası (`entry_point`), dokümantasyon dizgisi (`prompt` / `docstring`), kanonik çözüm (`canonical_solution`), test fonksiyonları ve doğrulama iddialarını (`test` / `assertions`) yapılandırılmış biçimde ayıklama.
   - LLM kod tamamlama ve otomatik onarım (repair) eğitimleri için yüksek kaliteli doğrulama çiftleri üretimi.

---

## 2. Mimari Sözleşmeler ve Güvenlik İnvariantları

`docs/actor-contract.md` standardı uyarınca her aktör için:
1. `src/api/types.ts`: `ActorType` union listesine ekleme, `TaskOptions` ve `Result` tipleri.
2. `src/actors/corpus/<ad>-actor.ts`: `IActor<T>` implementasyonu, `SSRFGuard`, zaman aşımı kontrolleri ve deterministik Markdown render motoru.
3. `src/actors/corpus/index.ts` & `src/index.ts`: Modüler ve kök barel ihracı.
4. `src/actors/actor-manifests.ts`: Manifesto tanımı, Zod girdi şeması ve MCP aracı (`query_huggingface_datasets`, `query_math_reasoning`, `query_code_eval`).
5. `src/actors/actor-registry.ts`: `createDefaultActorRegistry` kaydı.
6. `src/mcp/protokol-mcp-server.ts`: MCP `tools/call` ve araç yönlendirme eşlemesi.
7. `src/api/server.ts` & `src/api/openapi-spec.ts`: REST yönlendirici ve OpenAPI 3.1.0 spesifikasyonu.
8. `examples/actors/<ad>.json` & `examples/pipelines/<ad>-pipeline.yaml`: Örnek çalışma yükü ve boru hattı yapılandırması.
9. `tests/<ad>-actor.test.ts`, `tests/server.test.ts`, `tests/protokol-mcp-server.test.ts`: Kapsamlı test süiti.
10. `docs/actors/<ad>.md`: Mermaid mimari/sıra/durum diyagramlı teknik wiki dokümantasyonu.
11. `context/architecture-schema.md`: Aktör sayısı ve test envanteri senkronizasyonu.
12. `docs/walkthroughs/<ad>-walkthrough.md`: Kalıcı doğrulama raporu.

---

## 3. Uygulama Adımları

- [x] **Adım 1: Hugging Face Datasets Aktörü (`huggingface-datasets-actor`)** — Tamamlandı (9/9 birim test, REST, MCP, Wiki, Walkthrough).
- [x] **Adım 2: Matematiksel Muhakeme Aktörü (`math-reasoning-actor`)** — Tamamlandı (7/7 birim test, REST, MCP, Wiki, Walkthrough).
- [x] **Adım 3: Kod Kıyaslama ve Değerlendirme Aktörü (`code-eval-actor`)** — Tamamlandı (7/7 birim test, REST, MCP, Wiki, Walkthrough).
- [x] **Adım 4: Entegre Testler, Kalite Kapıları ve Doğrulama** — Tamamlandı (606/606 test PASS, verify pipeline 100% PASS, 41 aktör, 51 MCP aracı).

