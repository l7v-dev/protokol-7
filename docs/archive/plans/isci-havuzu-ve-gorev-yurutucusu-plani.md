# İşçi Havuzu ve Görev Yürütücüsü Planı (Faz 3)

## Hedef
Geliştirici Paketi V3 (RFC 03 — Worker, Transaction ve Control Plane, RFC 05 — Production Runbook) standartlarına uygun olarak; `LedgerRepository` kontrol düzlemine bağlanan, atomik kiralama (`lease_epoch`), periyodik heartbeat, exponansiyel backoff ve jitter ile arıza kurtarma (`failJob`), eşzamanlı işçi havuzu (`WorkerPool`), ve standart boru hattı işleyicilerini (`DownloadJobHandler`, `ExtractJobHandler`) içeren sağlam bir işçi yürütme köprüsü geliştirmek.

## Kapsam ve Güven Kademesi (Trust-Tier)
- **Güven Kademesi:** `Tier 1` (Yeni modüller, kontrol düzlemi arayüz genişletmeleri ve birim testler; mevcut API ve boru hatlarına yıkıcı müdahale içermez).
- **Blast Radius:** `contracts/ledger.ts`, `src/storage/ledger/sqlite-ledger-repository.ts`, `src/workers/` dizini ve `tests/worker-pool.test.ts`.

## Mimari Gereksinimler (RFC 03 ve RFC 05)
1. **İşçi Sözleşmesi ve Durum Döngüsü:**
   - İş claim edildiğinde: `status = 'running'`, `attempt = attempt + 1`, `lease_epoch = lease_epoch + 1`, `lease_until = now + leaseSeconds`.
   - İzin verilen operasyon filtreleme (`allowedOperations`): Worker yalnızca uzmanlaştığı iş tiplerini (`download`, `extract`, `normalize` vb.) çeker.
   - Periyodik Heartbeat: Uzun süren işlerde `leaseSeconds / 3` periyodunda arka plan heartbeat çalışır. `lease_epoch` ve `lease_owner` eşleşmezse (kira kaybedilmişse) heartbeat sonlanır ve işlem kesilir.
   - Başarılı Finalizasyon: Tek atomik işlemde `status = 'succeeded'`, üretilen artifact'lar kaydedilir, alt işler (`childJobs`) oluşturulur ve `outbox_events` basılır.
   - Hata Yönetimi (`failJob`):
     - `quarantined`: Bozuk veya kurtarılamaz veri (ör. bozuk PDF formatı).
     - `failed`: Terminal hata veya `attempt >= max_attempts`.
     - `retry_wait`: Geçici hata; tam jitter'lı exponansiyel backoff (ör. 5s - 300s) ile `available_at` güncellenir.
     - Tüm durumlarda `lease_epoch` korunur; bayat işçi başka işçinin devraldığı işi ezemez.

2. **İşçi Havuzu Mimarisi (`src/workers/`):**
   - `TaskWorker`: Tek bir işçi döngüsünü yönetir. Bounded execution context, AbortController ile deadline denetimi, heartbeat yönetimi.
   - `WorkerPool`: Çoklu işçi eşzamanlılığı (`concurrency`), handler kayıt defteri (`registerHandler(operation, handler)`), periyodik lease reaper (`reapExpiredLeases`), temiz durdurma (`drain`, `stop`).
   - `DownloadJobHandler`: URL'den içeriği indirir, `ObjectStore`'a yazar, SHA-256 ve boyut doğrular, `ContentObject` ve `Artifact` üretir, alt `extract` işi planlar.
   - `ExtractJobHandler`: `ObjectStore`'dan ham veriyi okur, metin veya yapısal veri çıkarır, işlenmiş çıktıyı `ObjectStore`'a yazar ve outbox bildirimi yayar.

## Uygulama Adımları
1. **Sözleşme Güncellemesi (`contracts/ledger.ts`):**
   - `failJob` ve `getJob` metodlarını `LedgerRepository` arayüzüne ekle.
   - `claimJob` metoduna opsiyonel `allowedOperations?: string[]` parametresi ekle.
   - `TaskContext`, `TaskResult`, `TaskHandler` tiplerini tanımla ve `contracts/index.ts` üzerinden dışa aktar.
2. **SQLite Kontrol Düzlemi Güncellemesi (`src/storage/ledger/sqlite-ledger-repository.ts`):**
   - `failJob`: Atomik hata ve yeniden deneme zamanlaması (`retry_wait`, `failed`, `quarantined`).
   - `getJob`: ID ile iş durumunu getirme.
   - `claimJob`: `allowedOperations` filtresi (SQL `operation IN (...)`).
3. **İşçi Çekirdeği Geliştirmesi (`src/workers/`):**
   - `src/workers/types.ts`: İşçi konfigürasyon ve metrik sözleşmeleri.
   - `src/workers/task-worker.ts`: Tekil işçi yaşam döngüsü ve heartbeat zamanlayıcısı.
   - `src/workers/worker-pool.ts`: Eşzamanlı havuz, kayıt defteri, lease süpürücüsü ve shutdown protokolü.
   - `src/workers/handlers/download-handler.ts`: İndirme ve artifact kayıt işleyicisi.
   - `src/workers/handlers/extract-handler.ts`: Çıkarma ve outbox yayım işleyicisi.
   - `src/workers/index.ts`: Modül dışa aktarımları.
4. **Birim ve Entegrasyon Testleri (`tests/worker-pool.test.ts`):**
   - İşçi kiralama, periyodik heartbeat ve başarılı tamamlama testi.
   - Geçici hata ile `retry_wait` ve `max_attempts` sonrası `failed` durum geçişi testi.
   - `lease_epoch` koruma testi: Bayat işçinin kiralama süresi dolan işi güncelleyememesi.
   - Çoklu işçi eşzamanlılığı ve `drain` kapatma testi.
   - Uçtan uca boru hattı simülasyonu: `download` -> `extract` -> outbox yayımı.
5. **Mimari Şema ve Doğrulama:**
   - `context/architecture-schema.md` güncellemesi.
   - `npm run verify` ve `npm test` tam doğrulama.
   - Walkthrough dokümanı oluşturulması: `docs/walkthroughs/isci-havuzu-ve-gorev-yurutucusu-walkthrough.md`.
