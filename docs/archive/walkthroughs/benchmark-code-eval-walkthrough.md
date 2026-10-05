# Doğrulama Raporu: Kodlama Değerlendirme ve Benchmark Aktörü Entegrasyonu (Faz 3 - Adım 3)

Bu walkthrough raporu, **protokol-7** Faz 3 (Matematik, Mantık ve Benchmark Kümeleri) kapsamındaki üçüncü bileşen olan `code-eval-actor` geliştirme, tip sözleşmesi, test süiti, MCP/REST entegrasyonu ve kalite kapılarının doğrulanmasını belgeler.

---

## 1. Uygulanan Değişiklikler

1. **Tip Sözleşmesi (`src/api/types.ts`):**
   - `ActorType` union listesine `"code-eval"` eklendi.
   - `CodeEvalItem`, `CodeEvalActorTaskOptions`, `CodeEvalActorResult` arayüzleri tanımlandı.
   - `ActorTask.options.codeEvalOptions` alanı eklendi.

2. **Aktör Sınıfı (`src/actors/corpus/code-eval-actor.ts`):**
   - `CodeEvalActor` sınıfı `IActor<CodeEvalActorResult>` olarak kodlandı.
   - SSRFGuard DNS hop-by-hop doğrulama ve AbortController 30s zaman aşımı invariantları sağlandı.
   - HumanEval (`openai/openai_humaneval`): `task_id`, `prompt`, `entry_point`, `canonical_solution` ve assertion `test` alanları ayrıştırıldı.
   - MBPP (`google-research-datasets/mbpp`): `task_id`, `text`, `code` ve `test_list` birim test dizileri birleştirilerek temizlendi.
   - SWE-bench (`princeton-nlp/SWE-bench_Lite`): `instance_id`, `problem_statement`, `patch`, `test_patch` ve `repo` alanları ayıklandı.
   - Deterministik GFM Markdown kod blokları çıktısı üretildi.

3. **Merkezi Tescil ve Katalog:**
   - `src/actors/corpus/index.ts` ve `src/index.ts` barel ihracı tamamlandı.
   - `src/actors/actor-manifests.ts` içerisine Zod girdi şeması, etiketler ve `query_code_eval` MCP araç tanımı kaydedildi (toplam 51 araç).
   - `src/actors/actor-registry.ts` içerisinde `createDefaultActorRegistry` kaydı yapıldı (toplam 41 aktör).
   - `src/mcp/protokol-mcp-server.ts` `tools/call` yönlendiricisine `codeEvalOptions` eşlemesi eklendi.
   - `src/api/server.ts` içerisine `POST /api/v1/code-eval` ve `/code-eval` rotası eklendi.
   - `src/api/openapi-spec.ts` 3.1.0 şemasına `/api/v1/code-eval` uç noktası işlendi.
   - `examples/actors/code-eval.json` ve `examples/pipelines/code-eval-pipeline.yaml` şablonları oluşturuldu.

4. **Teknik Dokümantasyon ve Mimari Şema:**
   - `docs/actors/code-eval.md` Mermaid mimari/sıra/durum diyagramları ve 11 standart bölümle tamamlandı.
   - `context/architecture-schema.md` 41 aktör sayısıyla ve test envanteriyle güncellendi.
   - `src/actors/README.md` katalog fihristine 41. aktör olarak eklendi.

---

## 2. Test ve Kalite Kapısı Sonuçları

- **Kod Değerlendirme Aktörü Birim Testleri:** `tests/code-eval-actor.test.ts` (7/7 PASS)
  - Aktör başlatma ve açıklama doğrulaması
  - HumanEval, MBPP ve SWE-bench parametre çözümleme
  - SSRF engeli (169.254.169.254 bulut metadata koruması)
  - HumanEval görevleri, entry_point, canonical_solution ve test doğrulaması
  - MBPP problem açıklaması, çözüm kodu ve test_list ayrıştırması
  - SWE-bench instance_id, problem tanımı, patch ve test_patch ayrıştırması
  - Upstream HTTP hata (404/500) yönetimi
- **HTTP Sunucu Entegrasyonu:** `tests/server.test.ts` (34/34 PASS)
  - `POST /api/v1/code-eval` rotasının doğrulanması
- **MCP Sunucu Entegrasyonu:** `tests/protokol-mcp-server.test.ts` (16/16 PASS)
  - 51 kayıtlı MCP aracı ve `query_code_eval` parametre yönlendirme doğrulaması
