# 11 — Ortak runtime, dizin ve araç yüzeyi
## Dizin hedefi (repo incelenmedi; taşıma planı)
```
protokol-7/
  src/{api,mcp,browser,actors}/
  pipelines/{sources,runtime,transforms}/
  workers/{download,extract,ocr,publish,retention}/
  contracts/
  storage/
  control_plane/{repositories,migrations,scheduler,outbox,reconciler}/
  integrations/
  infra/
  tests/
  docs/
  .agents/skills/
```
Bir klasör bir deployment değildir. V3 güncel dizin hedefi bu belgedir; önceki belgelerdeki apps/packages alternatifi uzun vadeli seçenek olarak okunmalıdır. Mevcut src/pipelines üzerinde önce interface sınırları kurulur, toplu rename yapılmaz.

Source adapter discovery/pagination/upstream identity/mapping üretir. Actor API/MCP extraction yeteneğidir. Pipeline aşama bağımlılıklarını belirler. Worker aşamayı çalıştırır. Transport acquisition bytes getirir. Storage adapter bu bytes'ı saklar. Actor ve pipeline aynı acquisition/job kontratına dayanır; Node/Python arasında business rule tekrar yazılmaz. TS ve Python SDK'ları aynı schema/error/capability conformance suite'i geçer.

Yeni kaynakta source descriptor, pagination adapter, mapping ve fixtures değişmelidir. Ortak downloader'a `if source==...` eklenmez. Yeni HTTP auth tipi ya da transport capability ortak katmanda genel özellik olarak eklenebilir. Transport, storage ve extraction ayrıdır. PDF URL discovery'den çıkar; parser download worker içinde çalışmaz.

## İş türleri ve deployment
Discovery, download, extract, OCR, normalize/quality, publish/export; embed/index opsiyonel; retention ayrı yetki. Scheduler/outbox/reconciler control süreçleridir, data worker değildir. Pilot normalize+quality ve publish+export aynı pool olabilir. CPU OCR download pool'unu bloke etmez. Worker instance sayısı ölçülen job arrival rate × service time / utilization ile planlanır; klasör sayısıyla bulunmaz.

## Tools
Read tools: connector_describe, connection_status, job_status, artifact_lineage, quality_report, run_summary.
Plan tools: ingestion_plan, export_plan, reprocess_plan, retention_plan; dry-run kaynak/bütçe/etki gösterir.
Operate tools: ingestion_start, pause, cancel, bounded_retry, export_start; idempotency ve principal scope zorunlu.
Admin tools: retention_execute, connection_grant_change, bulk_retry; ayrı rol.
Tools runtime çağırır; network/storage/parser implementasyonu tools içine kopyalanmaz. Agent'a gizli credential gösterilmez. Tool approval upstream lisans veya runtime RBAC yerine geçmez.

## Kontrol davranışları
Pause yeni claim/discovery'yi durdurur; çalışan işler safe checkpoint'te tamamlanabilir. Cancel run cancellation generation'ını artırır; heartbeat/claim/finalize bunu kontrol eder, geç çıktılar quarantine/orphan olur. Completed watermark yalnızca durable tam batch için ilerler. Retry failed attempt yerine yeni attempt üretir; reprocess yeni transform version/idempotency key üretir. Per-host quota distributed scheduler tarafından global uygulanır; her worker'a ayrı tam quota verilmez. Tenant fairness, temp disk reservations ve maksimum açık file/network connection sınırı gerekir.

Kabul: üçüncü kaynak downloader/storage/runtime değişmeden eklenir; duplicate mesaj ve kill sonrası tek etkili finalize; pause/cancel yarışları; shared raw deletion fence. Bu testler henüz gerçek repo üzerinde yapılmadı.
