- [x] Web sitesi uygulaması kullanıcı talebiyle durduruldu; UI değişikliği yapılmayacak (Scope Excluded).

- [x] Roadmap ve task register üzerinden kalan milestone sayısını doğrula.

- [x] Phase 6 task register ve mevcut extraction sözleşmesini doğrula.

- [x] İlk Extraction Engine backend paketini test ve review dokümanıyla hazırla.

- [x] P06-T01 aktif bounded paket: tenant-scoped immutable extraction plan/versioning contract'ını external target dispatch, provider activation veya credential kullanımı olmadan test/review kanıtıyla hazırla.

- [x] P06-T01 immutable extraction plan ve versioning modelini uygula.

- [x] P06-T02 aktif bounded paket: local HTML fixture üzerinde bounded CSS/XPath extraction contract'ını external URL/target fetch, browser/provider/proxy dispatch veya credential kullanımı olmadan test/review kanıtıyla hazırla.

- [x] P06-T02 bounded CSS/XPath extraction motorunu fixture testleriyle uygula.

- [x] P06-T03 aktif bounded paket: local JSON fixture üzerinde bounded JSONPath extraction contract'ını external API/URL erişimi, provider/browser dispatch veya credential kullanımı olmadan test/review kanıtıyla hazırla.

- [x] P06-T03 bounded JSONPath/API extraction motorunu fixture testleriyle uygula.

- [x] P06-T04 aktif bounded paket: local HTML fixture üzerinde bounded DOM cleaner ve raw-artifact reference metadata contract'ını target fetch, artifact storage, provider/browser dispatch veya credential kullanımı olmadan test/review kanıtıyla hazırla.

- [x] P06-T04 bounded HTML/DOM cleaner ve raw artifact referanslı parse pipeline'ını fixture testleriyle uygula.

- [x] P06-T05 aktif bounded paket: local normalized fixture üzerinde idempotent transform ve raw/normalized lineage contract'ını target/provider/credential kullanımı veya external dispatch olmadan test/review kanıtıyla hazırla.

- [x] P06-T05 idempotent normalize transform kütüphanesini raw/normalized lineage ile uygula.

- [x] P06-T06 aktif bounded paket: local field result fixture’larından secret-safe extraction evidence ve deterministic field-level diagnostics contract'ını target/provider/credential kullanımı veya external dispatch olmadan test/review kanıtıyla hazırla.

- [x] P06-T06 extraction evidence ve field-level diagnostics modelini testlerle uygula.

- [x] P06-T07 aktif bounded paket: caller-provided local model-output fixture’ını strict schema ile doğrulayan controlled AI extraction reference contract'ını gerçek model/API çağrısı, prompt dispatch veya credential kullanımı olmadan test/review kanıtıyla hazırla.

- [x] P06-T07 controlled AI extraction adapter ve schema-gated structured output akışını testlerle uygula.

- [x] P06-T08 aktif bounded paket: local extraction fixture/drift-regression evidence’ını deterministic acceptance ve M6 local-reference gate contract'ında target/provider/model/credential kullanımı veya production release olmadan test/review kanıtıyla hazırla.

- [x] P06-T08 extraction fixture, drift/regression acceptance ve M6 gate paketini hazırla.

- [x] M6 / Phase 6 local-reference Extraction Engine exit gate kanıtını ve kullanıcı onaylı `CONDITIONAL NO-GO` karar kaydını hazırla.

- [x] Production go-live readiness audit: local-reference kanıtı ile gerçek production evidence eksiklerini gate bazında çıkar.

- [x] Dokümantasyon ve test-gap inventory: aktif backend kaynak/test/review/gate yüzeylerindeki açıkları fail-closed şekilde belirle.

- [x] Backend milestone özet raporu: tamamlanan P06–P11 ve P13–P16 paketleri ile M6/M13–M16 kararlarını kanıta dayalı kaydet.

- [x] Reusable skill package: bounded backend package, quality gate ve explicit approval workflow’unu doğrulanmış bir beceriye dönüştür.

- [ ] DOC-GAP: Phase 6’nın `phase-6-*` ve `phase-06-*` belge kümelerini tek authoritative set/controlled archive altında uzlaştır.

- [ ] DOC-GAP: M2/M3 B08 ve P11-T03 dahil stale `In Review` review/board kayıtlarını milestone kararlarıyla uzlaştır.

- [ ] TEST-GAP: Coverage instrumentation ve risk-bazlı source-to-test matrix ekle; filename heuristic ile yetinme.

- [ ] PRODUCTION-GAP: Yetkili staging E2E, security assessment/remediation, real dependency/provider/model validation, operations drill ve final sign-off evidence programını ayrı onaylı kapsamda yürüt.

- [x] P07-T01 schema definition ve field type system contract'ını test/review paketiyle hazırla.

- [x] P07-T02 immutable schema versioning ve explicit compatibility policy paketini test/review kanıtlarıyla hazırla.

- [x] P07-T03 normalized extraction kayıtları için schema validator ve field-level validation result contract'ını test/review kanıtlarıyla hazırla.

- [x] P07-T04 schema validation sonuçlarından secret-safe field diagnostics ve deterministic quality score contract'ını test/review kanıtlarıyla hazırla.

- [x] P07-T05 deterministic publish threshold ve partial result policy contract'ını test/review kanıtlarıyla hazırla.

- [x] P07-T06 schema CRUD ve validation preview API yüzeyini tenant scope, contract ve test/review kanıtlarıyla tamamla.

- [x] P07-T08 backend-only schema fixture, compatibility, validation-preview ve regression acceptance kanıtlarıyla M7 gate paketini hazırla.

- [x] P08-T01 tenant/job-scoped crawler URL frontier, crawl state ve queue partition contract'ını test/review kanıtlarıyla hazırla.

- [x] P08-T02 temizlenmiş HTML fixture'larından bounded, source-aware link discovery ve URL extraction pipeline contract'ını test/review kanıtlarıyla hazırla.

- [x] P08-T03 crawler URL'leri için deterministic canonicalization ve tenant/job-scoped semantic deduplication contract'ını test/review kanıtlarıyla hazırla.

- [x] P08-T04 crawler candidate'ları için fail-closed robots/policy, allowlist/denylist ve domain restriction contract'ını test/review kanıtlarıyla hazırla.

- [x] P08-T05 crawler frontier için fail-closed depth, page-limit ve bounded pagination progression policy contract'ını test/review kanıtlarıyla hazırla.

- [x] P08-T06 crawler için side-effect-free sitemap candidate extraction ve deterministic priority queue ordering contract'ını test/review kanıtlarıyla hazırla.

- [x] P08-T07 crawler checkpoint, pause/resume ve recovery için process-local tenant/job-scoped fail-closed state contract'ını test/review kanıtlarıyla hazırla.

- [x] P08-T08 backend-only crawler fixture, canonical deduplication, policy, limits, checkpoint recovery ve regression acceptance kanıtlarıyla M8 gate paketini hazırla.

- [x] P09-T01 job/task state machine transition guard'ları ve secret-safe audit event contract'ını test/review kanıtlarıyla hazırla.

- [x] P09-T02 task dependency DAG ve deterministic dispatch planner contract'ını test/review kanıtlarıyla hazırla.

- [x] P09-T03 task delivery için idempotency key, process-local lease/heartbeat ve owner-guarded result commit contract'ını test/review kanıtlarıyla hazırla.

- [x] P09-T04 tenant/job-scoped cancel, pause/resume ve graceful drain için fail-closed orchestration control contract'ını test/review kanıtlarıyla hazırla.

- [x] P09-T05 backend-only progress event, reconnect-safe snapshot ve outbound webhook event contract'ını security/policy sınırlarıyla test/review kanıtlarıyla hazırla.

- [x] P09-T06 run/attempt history, reconciliation ve secret-safe audit view için deterministic projection contract'ını test/review kanıtlarıyla hazırla.

- [x] P09-T07 DLQ review, policy-gated replay intent ve operational recovery için fail-closed backend contract'ını test/review kanıtlarıyla hazırla.

- [x] P09-T08 orchestration load, chaos-lite ve acceptance gate kanıtını backend-only dependency sınırlarıyla test/review paketi olarak hazırla.

- [x] P10-T01 Target Analyzer için versioned, policy-doğrulanabilir ve secret-safe girdi/çıktı contract'ını test/review kanıtlarıyla hazırla.

- [x] P10-T02 Target Analyzer output'undan deterministic strategy rules ve fail-closed fallback priority contract'ını test/review kanıtlarıyla hazırla.

- [x] P10-T03 provider-neutral, secret-safe LLMProvider abstraction ve model configuration contract'ını test/review kanıtlarıyla hazırla.

- [x] P10-T04 AI strategy proposal ve explicit policy approval flow için non-dispatching, fail-closed backend contract'ını test/review kanıtlarıyla hazırla.

- [x] P10-T05 strategy proposal feedback, outcome ve immutable strategy versioning için secret-safe backend contract'ını test/review kanıtlarıyla hazırla.

- [x] P10-T06 prompt/data minimization ve untrusted content guardrail'ları için fail-closed, non-executing backend contract'ını test/review kanıtlarıyla hazırla.

- [x] P10-T07 AI latency, token ve per-job budget için secret-safe, deterministic, non-invocation control contract'ını test/review kanıtlarıyla hazırla.

- [x] P10-T08 offline evaluation, drift tespiti ve controlled rollout önerisi için non-deploying backend acceptance contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T01 dataset, immutable dataset version ve record lineage için source job/schema/plan izlenebilir backend data model contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T02 dataset staging, publish ve abort için fail-closed, atomic-visibility backend transaction reference contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T03 JSON, JSONL ve CSV için bounded, streaming-oriented, secret-safe export adapter contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T04 Parquet, API ve S3 delivery için capability-gated, secret-safe, non-delivery backend reference contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T05 record dedupe/upsert ve source-lineage integrity için tenant-scoped, deterministic backend contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T06 dataset retention, deletion ve legal hold için tenant-scoped, secret-safe, non-destructive governance contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T07 dataset/record/version query ve export control API için tenant-scoped, authorization-gated backend contract'ını test/review kanıtlarıyla hazırla.

- [x] P11-T08 dataset format, lineage, retention ve export-control acceptance kanıtını backend-only dependency sınırlarıyla M11 gate paketi olarak hazırla.

- [x] Phase 12 Control Center işleri kullanıcı talimatıyla frontend/UI kapsamı dışında bırakıldı; `/home/ubuntu/scraping-platform-operations-site` dokunulmayacak.

- [x] P13-T01 ortak trace context ve OpenTelemetry-style instrumentation için secret-safe, backend-only contract'ını test/review kanıtlarıyla hazırla.

- [x] P13-T02 API, queue, worker, proxy, extraction ve storage trace binding'leri için secret-safe, non-exporting backend instrumentation contract'ını test/review kanıtlarıyla hazırla.

- [x] P13-T03 platform, target, worker, extraction ve quality metrics için secret-safe, bounded backend metrics contract'ını test/review kanıtlarıyla hazırla.

- [x] P13-T04 structured log schema, redaction ve log routing için secret-safe, bounded backend logging contract'ını test/review kanıtlarıyla hazırla.

- [x] P13-T06 alarm kuralları, severity, on-call routing ve runbook linkleri için secret-safe, bounded, non-dispatching backend alerting contract'ını test/review kanıtlarıyla hazırla.

- [x] P13-T07 telemetry retention, access ve completeness kontrolü için secret-safe, bounded backend governance contract'ını test/review kanıtlarıyla hazırla.

- [x] P13-T08 observability acceptance ve incident drill için secret-safe, deterministic, non-dispatching backend gate contract'ını test/review kanıtlarıyla hazırla.

- [x] M13 / Phase 13 observability exit gate kanıtını ve conditional go karar kaydını hazırla.

- [x] P14-T01 usage event model ve cost category sözlüğünü secret-safe, bounded backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P14-T02 provider tariff ve pricing configuration yönetimini secret-safe, immutable, non-billing backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P14-T03 HTTP, browser, proxy, AI, storage ve compute meter'larını secret-safe, bounded, non-collecting backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P14-T04 retry ve fallback maliyet allocation kuralını secret-safe, deterministic, non-billing backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P14-T05 job cost aggregation ve cost-per-record hesaplamasını secret-safe, deterministic, non-billing backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P14-T06 tenant/project/job budget cap ve cost alert mekanizmasını secret-safe, bounded, non-dispatching backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P14-T07 finance export, reconciliation ve period close raporunu secret-safe, bounded, non-dispatching backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P14-T08 cost attribution completeness ve acceptance testini secret-safe, deterministic, non-dispatching backend gate contract olarak test/review kanıtlarıyla hazırla.

- [x] M14 / Phase 14 Cost Intelligence exit gate kanıtını ve conditional go karar kaydını hazırla.

- [x] P15-T01 threat model ve abuse case review'ünü secret-safe, policy-bounded backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P15-T02 RBAC enforcement, API key, OAuth/session ve revocation kontrollerini secret-safe, bounded backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P15-T03 secrets management ve credential rotation akışını secret-safe, non-revealing, non-rotating backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P15-T04 encryption at rest/in transit ve key policy doğrulamasını secret-safe, non-cryptographic-reference backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P15-T05 SSRF, egress, redirect ve webhook destination guardrail'larını secret-safe, fail-closed backend contract olarak test/review kanıtlarıyla harden et.

- [x] P15-T06 worker/browser sandbox, resource limit ve tenant isolation hardening'i secret-safe, bounded, non-sandboxing backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P15-T07 audit, retention, deletion, DLP ve data access review'ünü secret-safe, bounded, non-destructive backend governance contract olarak test/review kanıtlarıyla hazırla.

- [x] P15-T08 security acceptance, vulnerability/penetration remediation ve M15 go-live gate için secret-safe, deterministic, non-scanning backend contract'ını test/review kanıtlarıyla hazırla.

- [x] M15 / Phase 15 security exit gate kanıtını ve conditional no-go karar kaydını hazırla.

- [x] P16-T01 provider contract conformance test suite'ini secret-safe, deterministic, non-provider-calling backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P16-T02 provider adapter certification akışını secret-safe, local mock/reference, non-provider-calling backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P16-T03 Oxylabs adapter certification akışını secret-safe, local mock/reference, non-provider-calling backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P16-T04 Zyte adapter certification akışını secret-safe, local mock/reference, non-provider-calling backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P16-T05 internal provider adapter ve local test doubles paketini secret-safe, deterministic, non-provider-calling backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P16-T06 provider scoring, health comparison ve non-dispatching failover decision paketini secret-safe, deterministic, bounded backend contract olarak test/review kanıtlarıyla hazırla.

- [x] P16-T07 provider onboarding, quota, credential rotation ve support runbook paketini secret-safe, non-executing, non-rotating backend reference contract olarak test/review kanıtlarıyla hazırla.

- [x] P16-T08 provider portfolio certification ve release gate paketini secret-safe, deterministic, non-releasing backend contract olarak test/review kanıtlarıyla hazırla.

- [x] M16 / Phase 16 local-reference provider abstraction exit gate kanıtını ve kullanıcı onaylı `CONDITIONAL NO-GO` karar kaydını hazırla.

