# Walkthrough — Proje Denetim ve Mimari İyileştirme Paketi (T1.1 - T3.4)

Bu doküman, `proje-denetim-tasklist.md` denetim raporunda tespit edilen 10 adet yapısal, dayanıklılık, test ve dokümantasyon açığının giderilme sürecini ve doğrulama sonuçlarını belgeler.

---

## 1. Düzeltme Matrisi ve Genel Bakış

| Madde | Kategori | Çözülen Problem | Yapılan Değişiklik | Durum |
|---|---|---|---|---|
| **T1.1** | Dayanıklılık | `scheduled_jobs` tablosunda `pipeline`/`actor` konfigürasyonu ve hata durumları saklanmıyordu; çökme sonrası kurtarma imkansızdı | `pipeline_config_json`, `actor_config_json`, `last_error`, `fail_count` kolonları eklendi. `JobRouter` başlatılırken aktif işleri yeniden ayağa kaldıran `restoreActiveJobs()` mekanizması kuruldu. | Çözüldü |
| **T1.2** | Şema Senkronizasyonu | `context/schema.sql` SQLite DDL'i (`registry-database.ts`) ile senkronize değildi | Seçenek A uygulandı: `src/api/registry-database.ts` tek doğruluk kaynağı (source of truth) kabul edildi, `context/schema.sql` birebir güncellendi. | Çözüldü |
| **T2.1** | Dokümantasyon | `architecture-schema.md` içinde eski `src/core/` yolları bulunuyordu | Tüm `src/core/*` referansları `src/api/*` olarak düzeltildi. | Çözüldü |
| **T2.2** | Mimari Harita | `src/telemetry/anomalies.ts` ve `src/utils/terminal-theme.ts` mimari şemada eksikti | Bölüm 1.12 (`anomalies.ts`) ve 1.13 (`terminal-theme.ts`) olarak şemaya eklendi. | Çözüldü |
| **T2.3** | Mimari Harita | `wikisource_pipeline` ve `wiktionary_pipeline` şemada eksikti | Bölüm 4.9 ve 4.10 olarak `architecture-schema.md` içine eklendi. | Çözüldü |
| **T2.4** | Test & Paket | `wikisource_pipeline` ve `wiktionary_pipeline` için testler ve package.json scriptleri eksikti | `test_wikisource_pipeline.py` (5 test) ve `test_wiktionary_pipeline.py` (5 test) yazıldı; `package.json`'a `wikisource:pipeline`, `wiktionary:pipeline`, `test:wikisource`, `test:wiktionary` ve güncel `test:wikimedia` eklendi. | Çözüldü |
| **T2.5** | Katalog Senkronizasyonu | Aktör sayısı dokümanda (57/60) gerçeği (69) yansıtmıyordu | `context/architecture-schema.md` ve `src/actors/README.md` içinde aktör sayısı 69 olarak senkronize edildi. | Çözüldü |
| **T3.1** | Mimari Temizlik (DI) | `ProtokolMcpServer` içinde `getDefaultRegistryDatabase()` doğrudan çağrılarak katman sızıntısı yapılıyordu | Constructor'a opsiyonel `db?: RegistryDatabase` eklendi; 4 doğrudan çağrı `this.db` üzerinden yönlendirildi. | Çözüldü |
| **T3.2** | Test İzolasyonu | `getDefaultRegistryDatabase` singleton'ı testler arası sıfırlanamıyordu | `resetDefaultRegistryDatabase()` export edildi ve test süitlerinde doğrulandı. | Çözüldü |
| **T3.3** | Veri Bütünlüğü (CRUD) | `RegistryDatabase` üzerinde delete metodları eksikti | `deleteScheduledJob`, `deleteDataset`, `deleteDatasetShard`, `deleteDatasetSnapshot` metodları eklendi. | Çözüldü |
| **T3.4** | Dizin Temizliği | `wikisource_harvest.log` ve `wiktionary_harvest.log` repo kök dizinindeydi | Dosyalar `ledger/logs/` altına taşındı. | Çözüldü |
| **T4.2** | Hata & Halka Toleransı | Zamanlanmış iş yürütme hataları DB'ye yansıtılmıyordu | Handler reddedildiğinde `lastError` ve artan `failCount` DB'ye işlenir hale getirildi. | Çözüldü |

---

## 2. Detaylı Teknik Değişiklikler

### 2.1. `scheduled_jobs` Tablosu ve Kurtarma Mekanizması
- **DDL Genişletmesi**: `scheduled_jobs` tablosuna `pipeline_config_json TEXT`, `actor_config_json TEXT`, `last_error TEXT`, `fail_count INTEGER DEFAULT 0` kolonları eklendi. Mevcut veritabanları için `PRAGMA table_info` kontrolüyle runtime otomatik kolon göçü sağlandı.
- **ScheduleBroker**: `scheduleJob` imzası `jobConfig` parametresi alacak şekilde genişletildi. İş yürütme hatasında `failCount` artırılarak `updateScheduledJobFailure` ile kaydedildi.
- **JobRouter Otomatik Kurtarma**: Constructor'a eklenen `restoreActiveJobs()` fonksiyonu, servis ayağa kalktığında `running=1` olan işleri veritabanından okur; `createExecutionHandler` ile pipeline veya aktör yürütme işlevini bağlayarak cron zamanlayıcısını otomatik olarak devreye alır.

### 2.2. Modülerlik & Bağımlılık Enjeksiyonu (DI)
- **`ProtokolMcpServer`**: `new ProtokolMcpServer(actorRegistry?, db?)` şeklinde `RegistryDatabase` örneğini dışarıdan kabul edecek hale getirildi. Testlerde in-memory DB izolasyonu sağlandı.
- **`RegistryDatabase` Reset & Silme**: Singleton yaşam döngüsü için `resetDefaultRegistryDatabase()` sağlandı. `scheduled_jobs`, `datasets`, `dataset_shards` ve `dataset_snapshots` tabloları için `DELETE` prepared statement'ları ve güvenli CRUD fonksiyonları eklendi.

### 2.3. Dokümantasyon ve Mimari Şema Senkronizasyonu
- `context/schema.sql`: `registry-database.ts` ile birebir hizalandı (`dataset_snapshots` eklendi, `pipeline_runs` kaldırıldı, `scheduled_jobs` kolonları güncellendi).
- `context/architecture-schema.md`: `src/core/` kalıntıları temizlendi, aktör sayısı 69 yapıldı, telemetri/anomali ve terminal modülleri ile `wikisource_pipeline` ve `wiktionary_pipeline` eklendi.
- `src/actors/README.md`: Aktör envanteri 69 olarak güncellendi.

### 2.4. Boru Hattı Testleri ve Paket Betikleri
- `scripts/wikisource_pipeline/test_wikisource_pipeline.py`:
  - `test_downloader_url_resolution`
  - `test_cleaner_verse_and_text_formatting`
  - `test_stream_wikisource_articles_with_synthetic_bz2`
  - `test_parquet_sharder_packaging`
  - `test_ledger_manager_initialization`
  - **Sonuç: 5/5 PASSED (0.06s)**
- `scripts/wiktionary_pipeline/test_wiktionary_pipeline.py`:
  - `test_downloader_url_resolution`
  - `test_cleaner_text_and_template_formatting`
  - `test_stream_wiktionary_entries_with_synthetic_bz2`
  - `test_parquet_sharder_packaging`
  - `test_ledger_manager_initialization`
  - **Sonuç: 5/5 PASSED (0.11s)**
- `package.json`: `wikisource:pipeline`, `wiktionary:pipeline`, `test:wikisource`, `test:wiktionary` ve güncellenmiş 5 boru hatlı `test:wikimedia` eklendi.

---

## 3. Doğrulama ve Test Sonuçları

### 3.1. Python Boru Hattı Testleri
```bash
npm run test:wikimedia
# Wikibooks (5/5 PASS)
# Wikiversity (5/5 PASS)
# Wikivoyage (5/5 PASS)
# Wikisource (5/5 PASS)
# Wiktionary (5/5 PASS)
# TOPLAM: 25/25 PASSED
```

### 3.2. TypeScript Birim & Entegrasyon Testleri
```bash
# tests/registry-database.test.ts (26/26 PASS)
# tests/job-scheduler-and-api.test.ts (17/17 PASS - restart recovery dahil)
# tests/protokol-mcp-server.test.ts (30/30 PASS - DB DI dahil)

npm test
# ℹ tests 884
# ℹ suites 192
# ℹ pass 884
# ℹ fail 0
```

### 3.3. Statik Analiz & Doğrulama Hattı
```bash
npm run typecheck    # 0 hata (tsc --noEmit)
npm run lint         # 0 hata (biome check)
npm run lint:naming  # 0 hata (yasaklı pazarlama terimi yok)
npm run verify       # [PASS] Tüm 6 doğrulama katmanı onaylandı (7899ms)
```

---

## 4. Sonuç ve Mühür

`proje-denetim-tasklist.md` içindeki tüm bulgular mimari kural setlerine (`AGENTS.md`, `GEMINI.md`, `rules/trust-tiers.md`, `rules/failure-checklist.md`, `rules/logging-discipline.md`) harfiyen uyularak giderilmiştir. Kod tabanı sıfır artık, sıfır emoji ve tam tip güvenliğiyle kararlı hale getirilmiştir.
