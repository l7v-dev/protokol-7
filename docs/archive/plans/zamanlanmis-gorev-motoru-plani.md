# Zamanlanmis Periyodik Kulliyat Gorevleri ve Cron Motoru Plani

Bu plan; `ScheduleBroker` altyapısı ve `RegistryDatabase.scheduled_jobs` ACID tablosu üzerinden bildirimsel YAML veri boru hatlarının ve aktör görevlerinin standart 5 alanlı cron ifadeleriyle zamanlanmasını, çalıştırılmasını, REST API (`/api/v1/jobs/*`) ve Model Context Protocol (MCP) arayüzleri (`schedule_job`, `list_jobs`, `cancel_job`) üzerinden yönetilmesini tanımlar.

---

## 1. Temel Ilkeler ve Sozlesmeler (Core Invariants)

1. **Standart 5 Alanli Cron Ayrıştırması (POSIX Cron Format):**
   * Dakika (0-59), Saat (0-23), Ayın Günü (1-31), Ay (1-12), Haftanın Günü (0-6).
   * Desteklenen sözdizimi: `*`, `*/step`, `min-max`, `val1,val2`, tam sayı.
   * `isCronMatch` fonksiyonu ile kayıt anında kesin biçim doğrulaması.
2. **ACID Cift Katmanli Durum Takibi (In-Memory Timer + SQLite Persistence):**
   * Bellek içi `setInterval` zamanlayıcısı dakikalık periyotla tetiklenir; aynı dakika içinde çift çalıştırmayı önleyen (`lastCheckedMinute`) nöbetçi kilit mekanizması kullanılır.
   * `scheduled_jobs` tablosu üzerinde `running`, `last_run_at` ve `run_count` ACID olarak güncellenir.
3. **Esnek Calistirma Hedefleri (Pipeline or Actor Task):**
   * Zamanlanan görev bir bildirimsel YAML boru hattı (`pipeline.yaml`, `pipeline.filePath`, `pipeline.config`) veya doğrudan tekil bir aktör görevi (`actor.actorName`, `actor.input`) olabilir.
4. **Guvenlik ve Sinir Korumasi (Path Traversal Defense):**
   * Görev konfigürasyonunda `filePath` kullanılıyorsa çalışma alanı dışına çıkışlar engellenir.
5. **Coklu Erisim (REST API + MCP):**
   * REST: `POST /api/v1/jobs/schedule`, `GET /api/v1/jobs`, `GET /api/v1/jobs/:id`, `DELETE /api/v1/jobs/:id`, `POST /api/v1/jobs/:id/stop`.
   * MCP: `schedule_job`, `list_jobs`, `cancel_job`.

---

## 2. Faz Faz Uygulama Adimlari

### Faz 1: Veritabanı ve ScheduleBroker Tamamlayıcıları (`src/core/registry-database.ts`)
* `stmtGetJob` ve `RegistryDatabase.getScheduledJob(id: string)` metodunun eklenmesi.

### Faz 2: Zamanlanmış Görev Kontrolcüsü (`src/core/job-router.ts`)
* `JobRouter` sınıfının oluşturulması:
  - `handleScheduleJob(req, res)`: Yeni cron görevi kaydeder ve zamanlayıcıyı başlatır.
  - `handleListJobs(res)`: Aktif bellek içi zamanlayıcıları ve veritabanı kayıtlarını birleştirerek listeler.
  - `handleGetJob(res, id)`: Belirli bir görevin ayrıntılarını döndürür.
  - `handleCancelJob(res, id)`: Zamanlayıcıyı durdurur ve veritabanında `running = 0` yapar.

### Faz 3: HTTP Sunucu Entegrasyonu (`src/core/server.ts`)
* `JobRouter` örneğinin başlatılması ve `/api/v1/jobs/*` rotalarının bağlanması.

### Faz 4: MCP Protokol Araçları (`src/mcp/protokol-mcp-server.ts`)
* `schedule_job`, `list_jobs`, `cancel_job` araçlarının eklenmesi.
* Toplam MCP araç sayısının 36'dan **39'a** çıkarılması.

### Faz 5: OpenAPI 3.1.0 Spesifikasyonu (`src/core/openapi-spec.ts`)
* `Jobs` etiketiyle tüm iş zamanlama rotalarının şemalarının belgelenmesi.

### Faz 6: Entegrasyon Testleri (`tests/job-scheduler-and-api.test.ts`)
* Cron geçerlilik doğrulama, hatalı cron reddi (400), zamanlayıcı başlatma ve tetikleme testleri.
* REST API uç noktaları testleri (`POST /api/v1/jobs/schedule`, `GET /api/v1/jobs`, `GET /api/v1/jobs/:id`, `DELETE /api/v1/jobs/:id`).
* MCP JSON-RPC `schedule_job`, `list_jobs`, `cancel_job` çağrı testleri.
* `tests/protokol-mcp-server.test.ts` araç sayısı güncellemesi (39 araç).

### Faz 7: Doğrulama ve Süreç Kapanışı
* `npm test`, `npm run lint`, `npm run verify`, `npm run connectome` kontrolleri.
* `context/architecture-schema.md` ve `TASKS.md` güncellemeleri.
* Git Commit Convention v1.0 ile işleme.
