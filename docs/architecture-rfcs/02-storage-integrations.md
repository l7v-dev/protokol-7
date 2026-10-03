# 02 — Seçimli storage ve entegrasyonlar
## Registry ve routing
`storage_ref={provider_id,container,key,version,sha256,bytes}`. Fiziksel URI veya signed URL kalıcı business identity değildir. Provider ID config'teki sabit registry kimliğidir; aynı ID'yi başka bucket/root için tekrar kullanmayın. DB'de mevcut object'ler kendi provider ID'lerini korur. Default değişikliği yalnızca yeni yazımlara uygulanır.

| Provider | Rol | Durum ve gate |
|---|---|---|
| local | dev, staging, kontrollü tek sunucu üretim | örnek implementasyon; shared access/HA yok |
| R2 | paylaşımlı object storage adayı | tasarlanmış; gerçek credential ve kontrat testi gerekli |
| Ceph RGW | self-hosted opsiyon | aday; operasyon kapasitesi ve uyumluluk POC gerekli |
| GCS / Azure Blob / Alibaba OSS | isteğe bağlı native adapter | aday; ayrı SDK/contract test gerekli |
| Google Drive | yetkili dosya import ve teslim export | lake primary değil; connector/account/scope test gerekli |
| SFTP / WebDAV / shared volume | partner import/export | sınırlandırılmış path ve yetki testi gerekli |

AWS S3 provider bu seçeneklerde bulunmaz. R2'nin S3-compatible API kullanması AWS hesabı veya AWS storage kullanımını gerektirmez. SDK yalnızca taşıma detayıdır. Genel S3-compatible adapter eklenirse endpoint zorunlu olur ve hiçbir AWS endpoint'ine implicit fallback yapılmaz.

## ObjectStore kontratı
Zorunlu: put_stream, open_stream, head, exists, list_page. Opsiyonel capability: multipart, ranged_read, conditional_create, versioning, presign, server_side_copy, retention. delete admin rolündedir; otomatik iş akışlarında retention ve referans kontrolünden sonra çağrılır. Unsupported capability explicit hata verir, sessiz taklit edilmez. SDK istisnaları ortak hata sınıflarına çevrilir: not_found, auth, retryable, conflict, capacity, unsupported, integrity.

Hash stream sırasında hesaplanır. Object tamamlanıp size/hash doğrulanmadan DB artifact commit edilmez. ETag checksum yerine kullanılmaz. Local key traversal, absolute path, symlink ve root kaçışı engellenir; staging write aynı filesystem'de atomik rename ve fsync ile tamamlanır. R2 immutable hash key ve upload sonrası doğrulama; büyük payload streaming/multipart; DB record publish sonrasında görünürlük kontrolü. Delete/list üzerinden transaction illüzyonu oluşturmayın.

## Provider geçişi
1. Hedefte bucket/prefix erişimini ve engine uyumluluğunu doğrula.
2. Manifest tabanlı kopyala; SHA-256/size kontrol et.
3. DB yeni replica reference'ını ekle, pointer'ı transactional değiştir.
4. Okuma canary + önceki sağlayıcıya rollback; retention bitmeden eski object'i silme.
5. Iceberg tablosunda dosyaları taşımak tek başına yeterli değildir: engine destekli metadata/path migration ve snapshot okuma testi gerekir.

## Entegrasyon matrisi
| Entegrasyon | Kontrat | Failure davranışı |
|---|---|---|
| DOAJ / DergiPark | external ID, cursor, raw response, rights evidence | 429 Retry-After; token expiry kontrollü yeniden tarama |
| arXiv / Europe PMC / OpenAlex | kaynak bazlı quota/schema | pilot tamamlanmadan operational etiketi yok |
| PostgreSQL | versioned migration, repository | transaction rollback; reconnect sonrası job doğrulama |
| RabbitMQ | publisher confirm + manual ack | duplicate toleransı, DB reconciliation |
| PyMuPDF / alternatif parser | parser version, pages, bbox | parse timeout → quarantine veya OCR |
| OCR | dil, engine/version, page confidence | düşük kalite review; boş metni success sayma |
| Iceberg REST catalog | namespace/table/snapshot | commit conflict retry ve commit belirsizliğini araştır |
| Trino | read role, quotas, table schema | query resource limit; worker DB bağlantısı ayrı |
| Search/vector | artifact/release ID, tombstone | outbox retry; silme olayı türevlere yayılır |
| LLM/embedding | model ID/revision, usage, policy | token/cost budget; 429; veri gönderme izni |
| Google Drive | seçili folder/file, OAuth scope, checksum | quota/auth fail durdur; checkpoint koru |

## Storage layout
`bronze/responses/<source>/<run>/<sha>.json|xml`, `bronze/assets/sha256/ab/cd/<hash>.pdf`, `silver/<dataset>/<version>/<part>.parquet`, `gold/<purpose>/<release>/...`, `quarantine/<run>/...`. Hassas kimlikler path'te tutulmaz. Drive input file ID+version, kaynak lineage'a yazılır; export metadata Drive file ID taşır. Kaynak file erişim izni downstream training izni sayılmaz.

## Iceberg compatibility gate
Aynı R2 endpoint'i üzerinden writer + REST catalog + Trino birlikte create/write/read/concurrent commit/restore testleri geçmelidir. Local filesystem çok node'lu Trino'ya kendiliğinden ortak storage sağlamaz. GCS/Azure/OSS adapter'ı uygulama kontratını geçse de lake engine desteği ayrıca test edilir. Yeni provider için capability matrix ve contract suite zorunlu.
