# 07 — Resmi kaynaklar ve karar kanıtı
Kontrol tarihi: 2026-10-03. Aşağıdakiler resmi doküman arama kanıtıdır; canlı connector veya ürün benchmark'ı yapılmadı. Sürüm pinleme implementation sırasında release dokümanlarından yapılmalıdır. Nightly doküman production version garantisi değildir.

| Konu | Resmi referans | Tasarıma etkisi |
|---|---|---|
| R2 API compatibility | https://developers.cloudflare.com/r2/api/s3/api/ | capability-specific adapter, endpoint explicit |
| R2 API interface | https://developers.cloudflare.com/r2/api/ | R2 provider protokolü sağlayıcı tercihinden ayrı |
| RabbitMQ confirms | https://www.rabbitmq.com/docs/confirms | publisher confirm ve consumer ack ayrı |
| RabbitMQ reliability | https://www.rabbitmq.com/docs/reliability | duplicate toleransı ve recovery |
| PostgreSQL SELECT | https://www.postgresql.org/docs/16/sql-select.html | SKIP LOCKED row claim örneği |
| Celery task semantics | https://docs.celeryq.dev/en/stable/userguide/tasks.html | late ack tek başına crash garantisi değildir |
| Iceberg reliability | https://iceberg.apache.org/docs/1.4.2/reliability/ | optimistic commit ve belirsiz commit reconciliation |
| Iceberg maintenance | https://iceberg.apache.org/docs/nightly/maintenance/ | maintenance sürüm gate'i |
| Trino Iceberg | https://trino.io/docs/current/connector/iceberg.html | engine/storage/catalog POC |

PostgreSQL→Yugabyte geçişi bu paketin ilk production gereksinimi değildir. Ölçülmüş write/availability darboğazı varsa ayrı compatibility ve failover POC. Catalog Polaris/Lakekeeper için ürün seçimi yapılmadı. Ceph/native cloud adapter'ları uygulanmış entegrasyon değildir. Fiyat, bölge kotaları ve ölçülmüş throughput bu belgede verilmez; planlama aşamasında resmi hesabın güncel verileriyle hesaplanır.

## Teslim doğrulaması
JSON parse ve job fixture üzerinde şemanın required/additional keys, const, enum, UUID ve trace pattern kurallarının manuel kontrolü (genel JSON Schema validator kurulu değil); Python local adapter geçici dizin smoke test; Python syntax compile; paket dosyalarının SHA-256 manifest'i; ZIP CRC ve path kontrolü. PostgreSQL migration, RabbitMQ/Celery, R2, Iceberg, Trino, gerçek extraction ve LLM yürütümü doğrulanmadı. Örnek SQL production migration review gerektirir.
