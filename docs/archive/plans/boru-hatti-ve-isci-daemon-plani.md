# Boru Hattı Entegrasyonu ve İşçi CLI Daemon'ı Planı (Faz 4)

## Hedef
Faz 0 (Sözleşmeler), Faz 1 (Nesne Deposu), Faz 2 (Kontrol Düzlemi) ve Faz 3 (İşçi Havuzu) ile kurulan mimari omurgayı; bağımsız bir işçi CLI koşturucusu (`scripts/run-worker.ts`), REST API kontrol düzlemi rotaları (`ControlRouter`), ve `package.json` CLI betikleri ile üretime hazır bir mikroservis yapısına bağlamak.

## Kapsam ve Güven Kademesi (Trust-Tier)
- **Güven Kademesi:** `Tier 1` (Yeni HTTP rotaları, CLI koşturucusu ve entegrasyon testleri; mevcut çalışan aktör veya boru hatlarına yıkıcı müdahale içermez).
- **Blast Radius:** `src/api/routers/control-router.ts`, `src/api/server.ts`, `scripts/run-worker.ts`, `package.json` ve `tests/control-router.test.ts`.

## Mimari Gereksinimler (RFC 03 ve RFC 05)
1. **HTTP REST Kontrol Düzlemi Router'ı (`ControlRouter`):**
   - `POST /api/v1/control/jobs`: Yeni iş talebi oluşturma (`operation`, `idempotencyKey`, `input`, `maxAttempts`, `documentId`).
   - `GET /api/v1/control/jobs/:id`: İş durumunu sorgulama (`status`, `attempt`, `leaseOwner`, `errorCode`).
   - `POST /api/v1/control/sources`: Kaynak tanımlayıcısı (`source_descriptor`) kaydetme.
   - `GET /api/v1/control/sources/:id`: Kaynak detaylarını okuma.
   - `POST /api/v1/control/leases/reap`: Bayat kiralama ve outbox kilitlerini zorla süpürme.
2. **Bağımsız İşçi CLI Koşturucusu (`scripts/run-worker.ts`):**
   - Komut satırı argümanları (`--concurrency`, `--db-path`, `--storage-dir`, `--operations`).
   - `SIGINT` ve `SIGTERM` sinyalleri ile temiz boşaltma (`pool.drain()`) ve kapatma.
   - Sıfır emoji, saf ASCII `TerminalTheme` panel loglaması.
3. **npm CLI Entegrasyonu (`package.json`):**
   - `"worker": "tsx scripts/run-worker.ts"`.
4. **Birim ve Entegrasyon Testleri (`tests/control-router.test.ts`):**
   - HTTP REST rotalarının tam test kapsamı.

## Uygulama Adımları
1. `src/api/routers/control-router.ts` dosyasını oluştur.
2. `src/api/server.ts` içerisine `ControlRouter` rotalarını bağla.
3. `scripts/run-worker.ts` CLI işçi koşturucusunu geliştir.
4. `package.json` içine `"worker"` betiğini ekle.
5. `tests/control-router.test.ts` entegrasyon test süitini yaz ve çalıştır.
6. `context/architecture-schema.md` ve `context/connectome.md` güncelle.
7. `npm run verify` ve `npm test` ile tam doğrulama sağla.
8. `docs/walkthroughs/boru-hatti-ve-isci-daemon-walkthrough.md` dokümanını oluştur.
