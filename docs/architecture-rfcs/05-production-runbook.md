# 05 — Development'tan production'a
## Ortamlar
Dev: local storage, SQLite mevcut akış; PostgreSQL/RabbitMQ disposable integration ortamı. Pilot: tek host, PostgreSQL+RabbitMQ ve local/R2 ayrı denemeler. Staging: production ile aynı topology/secrets mekanizması, küçük yetkili gerçek sample. Production: DB HA/backup, broker HA gereken SLO'ya göre, ortak storage, stateless worker pool. Kubernetes mecburi değil; Compose dev/pilot için uygundur, multi-host HA'yı kendiliğinden sağlamaz.

## CI/CD
1. lint/typecheck/unit + contract/schema compatibility.
2. Python/Node lockfiles, reproducible image, SBOM, vulnerability scan, nonroot user.
3. disposable PostgreSQL/RabbitMQ ile migration ve crash tests.
4. scoped R2 secret yalnızca güvenilen protected job; PR fork'una secret yok.
5. staging fixture/end-to-end, old/new producer consumer compatibility.
6. artifact digest ve release notes; canary worker/tek source.
7. metrics gate → kademeli rollout. Migration expand→backfill→read switch→contract; destructive adım ayrı sürüm.
Rollback: image/config pin önceki sürüme; DB schema yeni alanlarla geri uyumlu; başarısız transform yeni version key üretir. Iceberg snapshot rollback ile DB/job/index lineage ayrıca uzlaştırılır. Üretim verisi kör biçimde önceki backup ile üzerine yazılmaz.

## Güvenlik
Per-service DB/storage/RabbitMQ rolü; TLS; credentials secret manager/host secrets; scope prefix/bucket. Download domain policy; redirect/IPv4/IPv6/private IP/DNS rebinding testleri. PDF/OCR sandbox: nonroot, outbound kapalı, resource limit, deadline, writable temp quota. Archive extraction path/decompression guard. API authn/authz, tenant scope, rate limit; browser pool tenant izolasyonu. Public unauthenticated MCP production'da açılmaz. Loglarda token, auth header, signed URL, tam sensitive metin yok. Audit event append-only storage/retention politikasıyla korunur.

## Gözlemlenebilirlik
Prometheus/Grafana + OpenTelemetry traces + merkezi redacted logs. Trace discovery run→job→artifact→release; ID log alanlarında, metric label'larında yüksek cardinality yok. Metrics: job eligible backlog/oldest age, queue ready/unacked, throughput bytes/docs, retry/error class, worker memory/disk, DB connection/lock/replication lag, outbox oldest age, object latency, extraction confidence, token/cost, release quality. Alert receiver seçimi ve gerçek bildirim entegrasyonu ekip tarafından yapılır; bu pakette mesaj gönderimi kurulmadı.

## İlk SLO önerileri — ölçülmüş SLA değildir
Control API aylık 99.9%; metadata→download p95 < 30 dakika (kaynak erişilebilir ve bütçe altında); kalıcı job kaybı 0; pilot lease recovery < 5 dakika; DB RPO ≤ 15 dakika/RTO ≤ 4 saat. Object RPO/RTO ayrı belirlenir. 500 TB geri kopyalama bu RTO içinde varsayılamaz; kritik metadata restore ve lake erişimini koruma ayrı planlanır. İşletme onayı olmadan bu değerler taahhüt olmaz.

## Backup ve restore
DB base backup + WAL/PITR, şifreli ayrı failure domain, düzenli restore testi. Catalog DB ve Iceberg metadata da backup scope'unda. Broker rebuild için DB job/outbox replay rehberi; broker backup job truth yerine geçmez. Object inventory+manifest, retention/version özelliği provider capability ile test edilir. Aynı bucket/prefix kopyası bağımsız disaster recovery değildir. Local disk snapshot tek başına off-host yedek değildir. Restore testinde artifact reference, hash, snapshot query ve job replay doğrulanır. Backup delete credentials runtime worker'da bulunmaz.

## Incident playbook
| Belirti | İlk işlem | Kurtarma |
|---|---|---|
| Queue/backlog büyüyor | source hızını düşür, disk/latency izle | worker sınıfını ölçerek artır |
| DB unavailable | yeni finalize/publish durdur | bağlantı sonrası epoch ve commit durumu kontrol |
| Outbox gecikmesi | routing/confirm/broker health kontrol | pending event replay; duplicate normal |
| Storage failure | discovery/worker yazımını pause | mevcut partial multipart abort ve hash reconcile |
| Worker crash | lease timeout bekle/reaper | deterministic output, epoch fenced retry |
| Schema drift | source quarantine | raw response ile yeni parser reprocess |
| Yanlış LLM çıktı | release/index sürümünü durdur | frozen eval ve prompt/model rollback |
| Hak/silme bildirimi | impacted release serving durdur | lineage ile türev ve export temizliği |

## Ölçek ve kapasite
500 TB logical raw mı, raw+türev mi, physical replicas mı açıkça kararlaştırılır. Disk bütçesi = raw + extracted + Parquet + index + temp + replica + headroom. Ekstraksiyon oranı ve replica çarpanı pilotla ölçülür; cloud ücretleri uydurulmaz. Günlük D byte için süre = hedef byte / net sürdürülebilir byte/s. Gerekli worker ≈ incoming jobs/s × service seconds/job / hedef utilization; CPU/GPU/network ayrı hesaplanır. 30–60 dakikalık steady-state ve burst, ardından daha uzun soak test. 500 TB kapasite hedefi 500 TB testinin yapıldığı anlamına gelmez.

Production gate: signed release artifact, migration evidence, load/fault evidence, real provider contract, restore raporu, dashboard/alert, runbook owner ve on-call, rights/release policy. Bu kapılar henüz geçilmedi.
