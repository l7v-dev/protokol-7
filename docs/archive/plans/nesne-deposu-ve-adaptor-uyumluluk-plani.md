# Nesne Deposu ve Adaptör Uyumluluk Planı (Faz 1)

## Hedef
`contracts/storage.ts` içinde tanımlanan `ObjectStore`, `StorageRef` ve `Capabilities` sözleşmelerine tam uyumlu, yol geçişi (path traversal) korumalı, atomik yazma/fsync garantili, değişmezlik (immutable) çakışma kontrollü ve aralıklı okuma (ranged read) destekli depolama adaptörlerini TypeScript ve Python katmanlarında hayata geçirmek.

## Güven Kademesi (Trust-Tier)
- **Güven Kademesi:** `Tier 1` (Yeni izole modüller, adaptör sınıfları ve test süitleri; mevcut boru hatlarını bozmaz).

## Mimari Prensipler
1. **AWS S3 Dışlama / Yalnızca R2:** AWS S3 sağlayıcısı kullanılmaz; S3-compatible protokolü yalnızca Cloudflare R2 veya yerel Ceph RGW uç noktaları için geçerlidir.
2. **Yol Güvenliği (Path Traversal & Symlink Defense):** Göreli `..`, mutlak kök `/` veya kök dışına yönlendiren sembolik bağlar (symlinks) doğrudan engellenir.
3. **Değişmezlik ve Çakışma Yönetimi:** Aynı anahtar (key) aynı içerikle gelirse idempotency sağlanır; farklı içerikle üzerine yazılmak istenirse hata fırlatılır.
4. **Dayanıklı Doğrulama:** Hash akış sırasında hesaplanır; boyut ve SHA-256 doğrulanmadan `StorageRef` üretilmez.

## Uygulama Adımları

1. **TASKS.md Güncellemesi:**
   - Faz 1 aktif görevini `TASKS.md`'ye işle.

2. **TypeScript Adaptörleri (`src/storage/adapters/`):**
   - `src/storage/adapters/local-object-store.ts`:
     - `contracts/storage.ts` içindeki `ObjectStore` arayüzünü uygular.
     - Atomik yazım (`tempfile` + `fsync` + rename/link).
     - Ranged read (`openStream` slice aralığı).
     - Kök dizin dışına kaçış kontrolü.
   - `src/storage/adapters/r2-object-store.ts`:
     - Cloudflare R2 / S3-compatible uç nokta istemcisi.
     - `capabilities`: multipart, ranged_read, conditional_create, versioning, presign.
   - `src/storage/adapters/index.ts`: Adaptör dışa aktarımları.

3. **Python Adaptörleri (`pipelines/shared/object_store_base.py`):**
   - `StorageRef` ve `BaseObjectStore` soyut sınıfı.
   - `LocalObjectStore`: Atomik fsync, traversal engeli, immutable conflict denetimi.

4. **Birim Testleri:**
   - `tests/object-store-adapters.test.ts`: Local adaptörün put, get, head, range, idempotency, path traversal ve conflict davranışlarını doğrula.
   - Python birim testi ile `pipelines/shared/object_store_base.py` doğrulaması.

5. **Mimari Şema ve Doğrulama:**
   - `context/architecture-schema.md` güncellemesi.
   - `npm run connectome` ve `npm run verify` (6/6 katman).
   - Walkthrough dokümanı: `docs/walkthroughs/nesne-deposu-ve-adaptor-walkthrough.md`.
