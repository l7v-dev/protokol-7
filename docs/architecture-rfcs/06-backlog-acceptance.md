# 06 — Uygulama backlog'u ve kabul
Süreler ekip/kod görülmeden verilmez. Aşağıdaki sıralama bağımlılıktır; sprint taahhüdü değildir.

| ID | İş | Bağımlılık | Teslim/kabul |
|---|---|---|---|
| P0-01 | repo ve AGENTS baseline | yok | mevcut test sonuçları, doğrulanmış mevcut özellik listesi |
| P0-02 | contracts + versioning | 01 | TS/Python şema parity, old/new consumer test |
| P0-03 | LedgerRepository + SQLite parity | 02 | mevcut cursor pause/resume değişmez |
| P0-04 | PostgreSQL schema/repository | 03 | duplicate discovery 1 doc/job, cursor+outbox atomic |
| P0-05 | local adapter | 02 | traversal/symlink/crash/integrity testleri |
| P0-06 | R2 adapter | 05 | scoped gerçek put/get/head/range/multipart evidence |
| P0-07 | outbox dispatcher + DB scheduler | 04 | confirm loss replay, missing notification recovery |
| P0-08 | downloader vertical slice | 05,07 | hash dedup, bounds, redirect SSRF, kill sonrası resume |
| P1-01 | extraction + OCR routing | 08 | metin PDF/scanned/bad PDF örnek QA |
| P1-02 | normalize + manifest + release | P1-01 | schema/rights/PII gate, lineage |
| P1-03 | storage registry admin migration | 06,P1-02 | provider switch eski ref'leri okuyabilir |
| P1-04 | telemetry + backup/restore | 04,08 | restore edilen DB object ref'lerini çözer |
| P2-01 | Iceberg/catalog POC | P1-02 | writer/catalog/Trino R2 uyumluluğu, ambiguous commit recovery |
| P2-02 | compaction/maintenance | P2-01 | active upload silinmez, snapshot retention test |
| P2-03 | RAG/embedding gateway | P1-02 | access filter, model version, citation eval |
| P2-04 | LLM training/eval exports | P1-02 | rights-by-purpose, near dedup/split overlap |
| P2-05 | Drive import/export | 02 | account/file scope, version/hash, quota resume |
| P3-01 | staging load/fault/restore | tüm seçili ürün yolları | ölçülmüş capacity ve recovery raporu |
| P3-02 | production canary/rollout | P3-01 | owner+SLO+rollback gate |

## Kritik test senaryoları
- Aynı API sayfası iki kez: document/job unique, cursor tutarlı.
- Raw object yazıldı DB rollback: cursor ilerlemez; orphan reconcile.
- DB transaction committed publish öncesi crash: outbox replay.
- Publish confirmed fakat DB published_at yazılmadı: duplicate teslim tek etkili finalize.
- Storage tamamlandı finalize öncesi worker öldü: retry aynı hash output'a bağlanır.
- Eski lease worker geri geldi: epoch uyuşmadığı için child job/artifact finalize reddedilir.
- Commit sonrası ack kayboldu: terminal job redelivery ack.
- Broker bildirimi kayboldu: DB scheduler eligible işi yeniden bildirir.
- Iceberg commit belirsiz: batch snapshot lookup, duplicate append yok.
- R2 credential iptal/429/5xx: secret log yok, bounded retry ve pause.
- Local disk doldu, symlink kaçışı, path traversal: root dışına yazım yok, success yok.
- Büyük PDF, HTML body masquerade, bozuk archive: limit/quarantine.
- Hak değişimi: impacted chunk/vector/export erişimi kaldırılır.
- Model değişimi: index version ayrı; dimension mismatch erken fail.

## Definition of done
PR: davranış, schema/version değişimi, rollback, relevant test evidence, metrics, redacted logs. Source adapter: resmi endpoint ve hak evidence, bounded pilot, checkpoint recovery, completeness check. Worker: idempotency/fencing/failure test. Provider: contract+engine test. Release: manifest+hash+approved purpose+quality pass. Production: ölçülmüş yük ve restore. Sadece unit test geçmesi tüm production kapısını karşılamaz.

## Açık kararlar
Ekip/sunucu sayısı; hedef günlük ingest; ilk production dataset; 500 TB logical tanımı; R2 hesabı/bölge ve DR planı; OCR dilleri/GPU; LLM local/harici veri izni; search/vector seçimi; REST catalog POC seçimi; alert kanalı; Drive hesap/hedef klasör. Paket varsayılanları geri döndürülebilir tasarım tercihidir.

## V2 zorunlu görevleri
P0: policy middleware + adapter enforcement; principal/resource scoped deny-by-default; connection registry + capability discovery; format negotiation + loss manifest. P1: retention planner dry-run + shared-content dependency fence + dedicated deletion worker; revoke/rotate credentials; agent prompt injection ve budget tests. Frontend mevcut scope dışında. R2 gerçek API/credential/capability verification olmadan production yok.
