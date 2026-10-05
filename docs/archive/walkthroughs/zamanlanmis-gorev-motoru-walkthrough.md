# Zamanlanmis Periyodik Kulliyat Gorevleri (Scheduled Pipelines & Cron Engine) Walkthrough

Bu dokuman, periyodik veri derleme ve boru hatti zamanlama altyapisinin (Scheduled Jobs & Cron Engine), HTTP REST rotalarinin, Model Context Protocol (MCP) araclari ve OpenAPI 3.1.0 sema entegrasyonunun dogrulama adimlarini belgeler.

---

## 1. Mimari Ozeti ve Bilesenler

- **`src/core/job-router.ts`**:
  - `JobRouter`: `ScheduleBroker`, `PipelineRunner`, `RegistryDatabase` ve `ActorRegistry` entegrasyonu saglayan HTTP kontrolcusu.
  - Guvenlik: `pipeline.filePath` uzerinde path traversal savunmasi (`normalize()`, workspace root kontrolu, `..` engelleme).
  - Standart 5-alanli cron ayrirma ve dogrulama (`isCronMatch`).
  - Hata Yonetimi: `SelfHealingError` sozlesmesi ile `INVALID_CRON_EXPRESSION`, `INVALID_JOB_PAYLOAD`, `PATH_TRAVERSAL_DETECTED`, `PIPELINE_FILE_NOT_FOUND`, `UNKNOWN_ACTOR`, `JOB_NOT_FOUND`.

- **`src/core/server.ts`**:
  - `POST /api/v1/jobs/schedule` -> Gorev zamanlama (201 Created).
  - `GET /api/v1/jobs` -> Aktif ve veritabani kayitli gorevlerin listesi (200 OK).
  - `GET /api/v1/jobs/:id` -> Tekil gorev detaylari ve calisma sayaci (200 OK).
  - `DELETE /api/v1/jobs/:id` -> Gorevi durdurma ve pasife alma (200 OK).
  - `POST /api/v1/jobs/:id/stop` -> POST takma rotasi (200 OK).

- **`src/mcp/protokol-mcp-server.ts`**:
  - `schedule_job`: 5-alanli cron ifadesi ile boru hatti veya aktor gorevi zamanlama.
  - `list_jobs`: Bellekteki aktif ve SQLite kayitli periyodik gorevleri sorgulama.
  - `cancel_job`: Calisan zamanlayiciyi guvenle durdurma ve kaydi pasife alma.
  - Toplam MCP arac sayisi: 36 -> 39'a cikarildi.
  - `close()` yordami ile tum zamanlayici interval'larinin temizlenmesi (`scheduleBroker.stopAll()`).

- **`src/core/registry-database.ts`**:
  - `getScheduledJob(id: string)`: `scheduled_jobs` tablosundan ACID tekil sorgulama yordami eklendi.

- **`src/core/openapi-spec.ts`**:
  - `Jobs` etiketi eklendi.
  - `/api/v1/jobs/schedule`, `/api/v1/jobs`, `/api/v1/jobs/{id}`, `/api/v1/jobs/{id}/stop` endpoint semalari OpenAPI 3.1.0 standardinda belgelendi.

---

## 2. Dogrulama Sonuclari

### 2.1 Entegrasyon Testleri (`tests/job-scheduler-and-api.test.ts`)
- 16/16 test basariyla calisti:
  - Gecersiz veya eksik cron ifadelerinin 400 ile reddedilmesi.
  - Hedefsiz payload'larin (pipeline ve actor eksik) 400 ile reddedilmesi.
  - Path traversal girisimlerinin 403 `PATH_TRAVERSAL_DETECTED` ile engellenmesi.
  - Bulunamayan boru hatti dosyalarinin 404 ile karsilanmasi.
  - Kayitsiz aktor adlarinin 400 `UNKNOWN_ACTOR` ile elenmesi.
  - Gecerli boru hatti gorevinin 201 Created ile baslatilmasi.
  - Gecerli aktor gorevinin 201 Created ile baslatilmasi.
  - `GET /api/v1/jobs` listeleme, `GET /api/v1/jobs/:id` ayrinti sorgulama.
  - `DELETE /api/v1/jobs/:id` ve `POST /api/v1/jobs/:id/stop` ile iptal etme.
  - MCP JSON-RPC araclari (`schedule_job`, `list_jobs`, `cancel_job`) dogrulamasi.

### 2.2 Tum Test Paketi
- Calistirilan: `npm test`
- Sonuc: 75 test paketi, 486/486 test basarili, 0 hata.

### 2.3 TypeScript Derleme
- Calistirilan: `npm run build` (`tsc`)
- Sonuc: Sifir hata ile `dist/` cikti derlemesi tamamlandi.

### 2.4 Kod Kalitesi ve Deterministik Dogrulama
- `npm run lint` -> Biome 220 dosya tarandi, 0 hata.
- `npm run lint:naming` -> Yasakli pazarlama terimi ve jargonsuz adlandirma dogrulandi.
- `npm run connectome` -> `context/connectome.md` guncellendi.
- `npm run verify` -> 6/6 asamali dogrulama hatti eksiksiz gecti.
