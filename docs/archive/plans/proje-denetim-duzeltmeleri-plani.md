# Plan: Proje Denetim ve Mimari İyileştirme Paketi

**Referans:** `/home/l7v/.gemini/antigravity/brain/9ef0f466-7fb2-45a3-9d01-c684c33961fc/proje-denetim-tasklist.md`  
**Tarih:** 2026-09-30  
**Kapsam:** Protokol-7 ACID kalıcılık, MCP bağımlılık enjeksiyonu, SQLite şema senkronizasyonu, dokümantasyon kayması ve Python test otomasyonu.

---

## 1. Amaç ve Kapsam

Proje denetim raporundaki eksiklik ve mantıksal açıkları gidermek üzere aşağıdaki 10 operasyonel adım atomik olarak uygulanacaktır:

1. **T1.1 & T4.2: Zamanlanmış İşlerin Kalıcılığı ve Hata Kaydı (`scheduled_jobs`)**
   - SQLite `scheduled_jobs` tablosuna `pipeline_config_json TEXT`, `actor_config_json TEXT`, `last_error TEXT` ve `fail_count INTEGER DEFAULT 0` kolonlarının eklenmesi.
   - Mevcut veritabanları için idempotent şema göç mekanizması.
   - `ScheduledJobInfo` arayüzünün güncellenmesi.
   - `ScheduleBroker` ve `JobRouter` modüllerinde servis yeniden başlama anında `running=1` olan işlerin in-memory zamanlayıcıya otomatik yeniden kaydedilmesi (crash recovery / restart persistence).
   - İş yürütme hatalarının `last_error` ve `fail_count` ile SQLite tablosuna yazılması.

2. **T3.1 & T3.2: MCP Sunucusu Bağımlılık Enjeksiyonu ve Test İzolasyonu**
   - `ProtokolMcpServer` constructor'ına `db?: RegistryDatabase` bağımlılık enjeksiyon parametresinin eklenmesi.
   - `getDefaultRegistryDatabase()` doğrudan çağrılarının `this.db` ile ikame edilmesi.
   - `resetDefaultRegistryDatabase()` fonksiyonunun export edilerek testler arası durum kirlenmesinin önlenmesi.

3. **T3.3: Veritabanı Silme (CRUD) Operasyonları**
   - `RegistryDatabase` sınıfına `deleteScheduledJob(jobId)`, `deleteDataset(datasetId)`, `deleteDatasetShard(shardId)`, `deleteDatasetSnapshot(snapshotId)` metodlarının ve prepared statement'larının eklenmesi.

4. **T1.2: Şema Senkronizasyonu (`context/schema.sql` vs `registry-database.ts`)**
   - Seçenek A uyarınca `context/schema.sql` dosyasının `registry-database.ts` ile eşitlenmesi.
   - `dataset_shards` tablosunun TypeScript tarafındaki gerçek alanlara göre güncellenmesi (`pipeline_run_id`, `dataset_name`, `file_name`, `storage_uri`, `storage_backend`, `record_count`, `size_bytes`, `sha256_hash`, `compression_codec`, `created_at`).
   - `pipeline_runs` tablosunun kaldırılması.
   - `scheduled_jobs` tablosuna yeni konfigürasyon ve telemetri kolonlarının işlenmesi.

5. **T2.1, T2.2, T2.3 & T2.5: Mimari Şema ve Dokümantasyon Düzeltmeleri**
   - `context/architecture-schema.md` içindeki eski `src/core/server.ts` ve `src/core/store-router.ts` referanslarının `src/api/` yollarıyla güncellenmesi.
   - `src/telemetry/anomalies.ts` ve `src/utils/terminal-theme.ts` modüllerinin Bölüm 1.12 ve 1.13 olarak eklenmesi.
   - `scripts/wikisource_pipeline/` ve `scripts/wiktionary_pipeline/` kayıtlarının eklenmesi.
   - Aktör sayısının 69 olarak güncellenmesi (`context/architecture-schema.md` ve `src/actors/README.md`).

6. **T2.4: Wikisource ve Wiktionary Pipeline Testleri ve NPM Betikleri**
   - `package.json` dosyasına `wikisource:pipeline`, `wiktionary:pipeline`, `test:wikisource`, `test:wiktionary` betiklerinin eklenmesi.
   - `scripts/wikisource_pipeline/test_wikisource_pipeline.py` ve `scripts/wiktionary_pipeline/test_wiktionary_pipeline.py` test süitlerinin yazılması.

7. **T3.4: Kök Dizin Hasat Günlüklerinin Taşınması**
   - Kök dizindeki `wikisource_harvest.log` ve `wiktionary_harvest.log` dosyalarının `ledger/logs/` dizinine taşınması.

8. **Doğrulama ve Kabul**
   - Tüm Node.js testlerinin (`tsx --test`) çalıştırılması.
   - Deterministik doğrulama hattının (`npm run verify`) sıfır hata ile tamamlanması.
