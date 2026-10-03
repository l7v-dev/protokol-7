# Kontrol Düzlemi ve Defter Deposu Walkthrough (Faz 2)

## Genel Bakış
`docs/architecture-rfcs/03-workers-control-plane.md` ve `infra/migrations/001-control-plane.sql` şartnamelerinde tanımlanan `LedgerRepository` sözleşmesi, yerel `node:sqlite` WAL motoruna dayalı `SqliteLedgerRepository` sınıfı, atomik satır sahiplenme (`lease_epoch`), outbox olay kuyruğu ve arıza kurtarma (`OutboxDispatcher`, `reapExpiredLeases`) mekanizmaları hayata geçirildi.

## Yapılan İşlemler

### 1. Defter ve Kontrol Düzlemi Sözleşmeleri ([`contracts/ledger.ts`](file:///home/l7v/l7v-dev/play/protokol-7/contracts/ledger.ts))
- `SourceRecord`, `CrawlPartition`, `DocumentRecord`, `ContentObjectRecord`, `ArtifactRecord`, `JobRecord`, `OutboxEventRecord` kanonik veri modelleri tanımlandı.
- `LedgerRepository` arayüzü oluşturuldu:
  - `createSource`, `getSource`: Kaynak tanımlayıcılarının ACID kaydı.
  - `getOrCreatePartition`, `updatePartitionCursor`: Bölümleme ve imleçlerin revizyon kontrollü (`expectedRevision`) atomik ilerletilmesi.
  - `upsertDocument`: `(source_id, external_id)` bileşik anahtarıyla doküman tekilleştirmesi.
  - `registerContentObject`, `recordArtifact`: SHA-256 binary hash tekilleştirmesi ve doküman varlık eşleştirmesi (`document_assets`).
  - `createJob`, `claimJob`: İdempotent iş oluşturma ve `lease_epoch` artışıyla atomik iş sahiplenme.
  - `heartbeatJob`: Zaman aşımını önleyen ve eski epoch sahiplerini reddeden canlılık yenilemesi.
  - `finalizeJob`: İş tamamlama, çocuk iş üretimi ve outbox olay kaydını tek bir ACID işlemde (`BEGIN IMMEDIATE / COMMIT`) birleştiren finalize protokolü.
  - `claimOutboxEvents`, `markOutboxPublished`: Outbox olaylarının dağıtımı ve yayınlanma onayı.
  - `reapExpiredLeases`: Süresi dolan veya çöken worker'ların işlerini `retry_wait` ya da `failed` durumuna çeken kurtarma süreci.

### 2. SQLite Defter Deposu Uygulaması ([`src/storage/ledger/sqlite-ledger-repository.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/storage/ledger/sqlite-ledger-repository.ts))
- Yerel `node:sqlite` `DatabaseSync` motoru üzerinde sıfır dış bağımlılıkla çalışır.
- WAL modu (`PRAGMA journal_mode = WAL;`) ve bellek izolasyonu (`:memory:` desteği).
- `001-control-plane.sql` tablosunun birebir DDL şeması otomatik kurulur.
- Çift modlu mimari: Hem yerel tekil dosya ortamlarında hem de gelecekteki PostgreSQL kontrol düzleminde aynı sözleşmeyle çalışır.

### 3. Outbox Dağıtıcı Motoru ([`src/storage/ledger/outbox-dispatcher.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/storage/ledger/outbox-dispatcher.ts))
- Abone-yayıncı (Pub/Sub) mimarisini outbox deseniyle birleştirir.
- `subscribe(eventType, handler)` ile olay dinleyicileri kaydeder.
- `dispatchOnce()` ile yayın bekleyen olayları sahiplenir, işleyicileri çalıştırır ve başarılı olanları `dispatch_epoch` doğrulamasıyla `published_at` olarak damgalar.

### 4. Testler ve Doğrulama
- [`tests/ledger-repository.test.ts`](file:///home/l7v/l7v-dev/play/protokol-7/tests/ledger-repository.test.ts) süiti geliştirildi (5/5 test yeşil):
  - Kaynak ve imleç revizyon çiti denetimi.
  - Doküman ve SHA-256 artifact tekilleştirme.
  - Atomik job claim, lease epoch, heartbeat ve outbox yayımı.
  - OutboxDispatcher olay dağıtım deseni.
  - Süresi dolan işlerin otomatik reaped edilmesi.
- `context/architecture-schema.md` ve `context/connectome.md` güncellendi.
- `npm run verify` ile 6/6 katmanda tam yeşil onaylandı.
- Canlı DOAJ arka plan akışının kesintisiz devam ettiği teyit edildi.
