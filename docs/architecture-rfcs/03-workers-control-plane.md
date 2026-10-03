# 03 — Worker, transaction ve control plane
## Kaynak gerçekliği
DB job state'in gerçek kaynağıdır. RabbitMQ mesajı job ID bildirimidir. Broker publisher confirm consumer'ın işi tamamladığı anlamına gelmez. Ağ kesildiğinde publish edilmiş fakat confirmed görünmeyen event tekrar gönderilebilir; duplicate beklenir.

## Discovery commit protokolü
API cevabını raw storage'a tamamla → hash/size kontrol et → tek DB transaction'ında artifact, document upsert, yeni job, outbox ve cursor checkpoint yaz → commit. DB rollback halinde raw object orphan kalabilir; inventory reconciliation grace period sonrası inceler. Cursor raw object tamamlanmadan ilerlemez. Aynı cursor replay stable upstream kimliğiyle duplicate job oluşturmaz. Kaynak resumption token ömrü ve watermark ayrı tasarlanır.

## Worker protokolü
1. Mesaj şemasını doğrula; DB job terminal ise ack.
2. Job'u atomic lease ile claim et; lease_epoch artır. Önceki lease sahibi hiçbir sonucu finalize edemez.
3. Bounded network/CPU işlemi çalıştır. Heartbeat ownership+epoch koşuluyla lease yeniler. Lease kaybında sonucu publish etme.
4. Immutable çıktı upload et; hash/size doğrula.
5. Tek DB transaction: epoch ve geçerli lease kontrolüyle job succeeded, artifact reference, child job ve outbox yaz. Başarısız koşullu UPDATE tüm transaction'ı rollback eder.
6. DB commit sonrası ack. Commit sonrası ack kaybında yeniden delivery terminal job üzerinden ack olur.

Uzun object işinde DB transaction açık tutulmaz. DB commit ile object store commit arasında distributed transaction yok; immutable object + reconciliation kullanılır. Harici LLM çağrısı iki kez yapılabilir; maliyet ve idempotency key provider destekliyorsa ayrıca korunur.

## State ve retry
Jobs: pending → running → succeeded; running → retry_wait/failed/quarantined/cancelled. Lease expiry → retry_wait ve epoch yeni claim'de artırılır. Ayrı attempt history append-only tutulur. Retry_wait DB available_at ile kontrol edilir; broker TTL tek retry otoritesi değildir. Scheduler zamanı gelen işleri outbox üzerinden tekrar bildirir. Mesajı kaybolan pending/expired işleri reconciler yeniden bildirir. Claim edilmemiş, aktif leased duplicate mesaj ack olabilir; lease reaper/DB scheduler kurtarma için zorunludur.

| Worker | Input | Output | Kaynak sınırı |
|---|---|---|---|
| discover | source partition/cursor | raw response + document/jobs | per-host HTTP budget |
| download | asset URL/job | binary artifact/hash | bytes, redirect, timeout |
| extract | binary artifact/parser version | page text, bbox, table refs | CPU, RAM, subprocess deadline |
| OCR | page image + language | text/confidence | CPU/GPU ayrı pool |
| normalize | parsed pages/schema version | normalized records | batch memory/disk |
| quality | records + rights | check report + release candidate | sampled/full check ayrımı |
| publish | approved release | Parquet/Iceberg snapshot | commit batching |
| embed/index | released chunks/model revision | index refs | tokens, GPU, cost |
| export | dataset snapshot/split | manifest + JSONL/Parquet | local disk ve bandwidth |

## Queue tasarımı
download, extract, ocr, normalize, publish ve embed için ayrı routing key/pool. Durable exchange/queue; production HA için quorum queue POC. Persistent messages, mandatory routing ve unroutable handling, publisher confirms, manual acknowledgements. Prefetch pool kaynaklarına göre ölçülür. Celery seçilirse result backend DB job modelini değiştirmez; acks_late ve worker lost/reject/retry davranışları kill testleriyle doğrulanır. Celery ile custom AMQP protokolünü aynı queue'da karıştırmayın.

Önerilen ilk timeout/retry değerleri config örneğidir, ölçülmüş kapasite değildir: connect 10 s; download total 180 s; 256 MiB max asset; max attempts 5; backoff full jitter 5–300 s; heartbeat 20 s; lease 120 s. Uzun download heartbeat sürdürür. 429 Retry-After önceliklidir. Auth/unsupported schema terminal veya kaynak pause; 404 kayda terminal; bozuk PDF quarantine; 5xx bounded retry. SSRF redirect ve her yeni host için tekrar kontrol edilir; DNS rebinding'e karşı doğrulanan adrese bağlantı yöntemi kullanılmalıdır.

## Backpressure
DB backlog ve oldest eligible job age + queue ready/unacked + storage latency/disk free birlikte ölçülür. Örnek başlangıç high/low watermark 100k/50k pending; gerçek pilotla kalibre edilir. High'da discovery job üretimini durdur/yavaşlat; low'da hysteresis ile aç. API caller'a accepted/queued dön; synchronous extraction vaat etme. Source ve tenant fairness sağlayan scheduler kullan. Backlog DB'de tutulabilir, tümünü broker'a önceden doldurmayın.

## Data model
source, crawl_partition, document, content_object, document_asset, job, job_attempt, outbox_event, artifact, dataset_release. contracts job envelope yalnızca job ID taşır; URL/credential taşımaz. İş uniqueness logical operation + input version + transform version üzerinden belirlenir. Embedding model revision ve chunk policy de key'e dahil edilir. İçerik aynı olsa bile lisans/provenance kayıtları birleştirilip kaybedilmez.

## Lake commit
Worker başına tek satır Parquet üretmeyin. Batch writer staging segment'lerini manifest ile toplar; hedef file size örnek aralık 128–512 MiB, pilotla seçilir. Iceberg'e append öncesi release/batch ID ledger kaydı tutulur. Commit sonucu belirsizse snapshot içinde batch ID aranır; kör append tekrarından kaçınılır. Snapshot committed fakat DB güncellenememiş durum reconciliation ile tamamlanır. UNIQUE kısıtı Iceberg append dedup'ını otomatik sağlamaz. Compaction, snapshot expiry ve orphan cleanup ayrı kontrollü maintenance işi; aktif upload süresinden uzun grace period kullanır.
