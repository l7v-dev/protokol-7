# 08 — Headless connector catalog ve izin sözleşmesi
V2 kapsamı: frontend yok. CLI + HTTP API + MCP aynı policy engine üzerinden çalışır. İlerideki frontend bu API'yi kullanabilir; bu teslim UI veya ekran implementasyonu içermez. LLM agent yetki sahibi değildir; çağıran principal'ın scope ve bütçesiyle hareket eder.

## Bağlayıcı seçimi
| Bağlayıcı | Öncelik | Okuma | Yazma | Silme | Durum |
|---|---|---|---|---|---|
| local | P0 | get/head/range/list scoped root | immutable create | retention worker | küçük referans örneği |
| Cloudflare R2 | P0 | scoped bucket/prefix | put/multipart | ayrı GC credential | tasarım, gerçek test yok |
| HTTP/API/bulk | P0 | GET, belgelenmiş read-only POST | upstream write yok | upstream delete yok | source-specific geliştirme |
| OAI-PMH/RSS/sitemap | P0 | discovery ve incremental fetch | yok | yok | source-specific geliştirme |
| Google Drive | P1 | seçili file/folder fetch/revision/export | seçili export folder create | varsayılan kapalı | tasarım |
| SFTP/WebDAV | P1 | partner directory read | ayrı delivery directory | varsayılan kapalı | tasarım |
| PostgreSQL source | P1 | read-only role/snapshot | kaynak DB'ye yok | kaynak DB'ye yok | tasarım |
| Git/HF-type versioned repo | P1 | belirli repo/revision/artifact | varsayılan yok | yok | tasarım |
| GCS/Azure Blob/Alibaba OSS | P2 | scoped object read | explicit output scope | ayrı GC role | opsiyonel native adapter |
| Ceph RGW | P2 | scoped object read | immutable object write | ayrı GC role | self-hosted aday |
| Stream/CDC/webhook | P2 | authorized subscription/change log | yalnızca checkpoint/ack | kaynak veri silme yok | ayrı adapter |
| Browser | ihtiyaç bazlı | izinli public rendering | form submit default kapalı | yok | source-specific |

AWS S3 provider yok. S3-compatible sadece protokol adı. Her adapter operation inventory verir; tablo ürün API'lerinin tam destek iddiası değildir. DOAJ/DergiPark mevcut README beyanı; diğer actor'lar repo testiyle doğrulanacak.

## Connection modeli
connection_id, connector_type, owner_principal, account_label, allowed_resource_scope, granted_operations, secret_ref, capability_snapshot, adapter_version, status, tested_at, last_error_redacted. Status: configured/unverified/healthy/degraded/expired/revoked/disabled. Credential rotations bağlantı kimliğini korur; account/root/bucket değişimi yeni identity gerektirir. Tek bağlantı çok hesap arasında sessiz geçiş yapmaz.

## Etkin yetki
Etkin izin = connector capability ∩ upstream credential scope ∩ proje policy ∩ principal grant ∩ resource scope ∩ mevcut job budget. Bunlardan biri yoksa deny. Varsayılan deny; wildcard scope explicit admin kararı gerektirir. OAuth scope runtime permission yerine geçmez; provider coarse scope verirse uygulama file/prefix allowlist ile ayrıca sınırlar. Policy koşulları: environment, purpose, resource, tenant, expiry, max objects/bytes/cost, allowed domains.

| İşlem grubu | Örnek | Principal |
|---|---|---|
| READ | metadata/list/fetch/head/range/export native → bytes | scoped reader |
| CREATE | put/upload/create export file/multipart | output writer |
| MODIFY | overwrite/rename/move/update metadata | ayrı operator grant |
| DELETE | delete/trash/purge/abort multipart | ayrı retention/admin grant |
| SHARE | public link/permission/invite | ayrı sharing grant |
| EXECUTE | run ingestion/retry/publish release/LLM call | bounded operator |

export yerel bytes üretme ise read; Drive'a yeni dosya upload etme create'dir. Move/rename modify, public link share, trash/delete delete'dir. Salt read çağrısının yan etkisi varsa adapter bunu inventory'de açıklar. Multipart abort yalnızca job'un sahip olduğu upload ID için ayrı dar cleanup scope alabilir; genel object delete izni gerektiren credential runtime worker'a verilmez. Upstream fine-grained izin sağlamıyorsa delete credential ayrı süreçte tutulur.

## Headless API yüzeyi — tasarım
GET /v1/connectors; GET /v1/connectors/{type}/operations; POST /v1/connections; GET /v1/connections/{id}; POST /v1/connections/{id}/test; POST /v1/connections/{id}/disable; POST /v1/ingestion-plans; POST /v1/ingestion-runs; GET /v1/jobs/{id}; POST /v1/exports; POST /v1/retention/plans; POST /v1/retention/plans/{id}/execute.
Test endpoint read-only health check default; create/delete probe ancak explicitly scoped sandbox grant ile. Connection API secret plaintext geri döndürmez. Plan validate yetki vermez; execute aşamasında policy yeniden değerlendirilir. Idempotency-Key yazma çağrılarında zorunlu; trace/request/principal/policy revision audit'e yazılır. List sonucunda yetkisiz kaynak isimleri sızmaz.

## Agent MCP
connector_describe, connection_status, ingestion_plan, ingestion_start, job_status, dataset_describe, export_plan, export_start, retention_plan. execute/delete ayrı principal grant ve policy gerekir. Tool schema additionalProperties=false; kaynak metnindeki komutlar iş emri değildir. Credentials tool payload'ında değil secret resolver'da tutulur. Yanlış argument, scope dışı resource veya budget aşımı iş başlamadan reddedilir. Human/agent ayrımı audit'te tutulur. Bu beceri/policy tasarımını uygulama authorization middleware'i ve storage adapter enforcement tamamlar.
