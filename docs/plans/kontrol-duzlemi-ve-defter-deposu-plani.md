# Kontrol Düzlemi ve Defter Deposu Planı (Faz 2)

## Hedef
`docs/architecture-rfcs/03-workers-control-plane.md` ve `infra/migrations/001-control-plane.sql` şartnamelerinde tanımlanan `LedgerRepository` (kontrol düzlemi defter deposu) sözleşmesini ve SQLite tabanlı çift modlu uygulamasını (`SqliteLedgerRepository`), atomik iş sahiplenme (`lease_epoch`), outbox olay kuyruğu ve arıza kurtarma (lease reaper) mekanizmasıyla hayata geçirmek.

## Güven Kademesi (Trust-Tier)
- **Güven Kademesi:** `Tier 1` (Yeni sözleşme dosyaları, SQLite defter deposu implementasyonu, outbox yöneticisi ve test süitleri).

## Mimari Prensipler
1. **DB Doğruluk Kaynağıdır (DB Truth + Broker Notification):** İşlerin ve imleçlerin (cursor) gerçek durumu veritabanında tutulur; kuyruklar yalnızca hafif iş bildirim aracıdır.
2. **Epoch Çit Koruması (Epoch Fencing):** Her iş sahiplenmesinde (`claim`) `lease_epoch` artırılır. Süresi dolan veya geciken eski worker'lar sonuçları veritabanına mühürleyemez.
3. **Outbox Deseni (Transactional Outbox):** İş tamamlama, çocuk iş üretimi ve olay bildirimi tek bir ACID veritabanı işleminde (`transaction`) kaydedilir. Ağ çökse bile olaylar kaybolmaz.
4. **Sıfır Dış Bağımlılık (Self-Contained SQLite):** Geliştirme, birim testleri ve tek hostlu üretim için yerel `node:sqlite` WAL motoru kullanılır; PostgreSQL üretim sürümleri için aynı arayüz korunur.

## Uygulama Adımları

1. **TASKS.md Güncellemesi:**
   - Faz 2 görevini `TASKS.md`'ye işle.

2. **Defter Sözleşmeleri (`contracts/ledger.ts`):**
   - `SourceRecord`, `CrawlPartition`, `DocumentRecord`, `ContentObjectRecord`, `ArtifactRecord`, `JobRecord`, `OutboxEventRecord` veri yapıları.
   - `LedgerRepository` arayüzü: kaynak yönetimi, imleç güncelleme, atomik claim, heartbeat, finalize ve outbox dağıtım metotları.

3. **SQLite Defter Deposu Uygulaması (`src/storage/ledger/sqlite-ledger-repository.ts`):**
   - Yerel `node:sqlite` motoru üzerinde DDL şeması (`001-control-plane.sql` karşılığı).
   - Atomik satır kilitleri (`lease_epoch`), idempotency denetimleri, imleç revizyon kontrolü ve outbox yazımı.

4. **Outbox Dağıtıcı Motoru (`src/storage/ledger/outbox-dispatcher.ts`):**
   - Yayınlanmamış outbox olaylarını çeken, işleyiciye (handler) ileten ve onay alındığında `published_at` işaretleyen hafif olay dağıtıcısı.

5. **Birim Testleri (`tests/ledger-repository.test.ts`):**
   - Kaynak/imleç oluşturma ve revizyon denetimi.
   - Doküman ve içerik nesnesi (content object) tekilleştirmesi (dedup).
   - Atomik iş sahiplenme (`lease_epoch`), heartbeat ve finalize doğrulaması.
   - Süresi dolan işlerin kurtarılması (`reapExpiredLeases`).
   - Outbox olay kaydı, çekilmesi ve yayınlanma onayı.

6. **Mimari Şema ve Doğrulama:**
   - `context/architecture-schema.md` güncellemesi.
   - `npm run connectome` ve `npm run verify` (6/6 katman).
   - Walkthrough dokümanı: `docs/walkthroughs/kontrol-duzlemi-ve-defter-walkthrough.md`.
