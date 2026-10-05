# Kapsamlı Proje Denetimi, Hata Düzeltme ve Mimari Senkronizasyon Walkthrough

Bu belge, **protokol-7** kod tabanında gerçekleştirilen kapsamlı teknik denetim sonucunda tespit edilen 6 kritik bulgunun çözümlerini, mimari gerekçelerini ve uçtan uca doğrulama sonuçlarını belgeler.

- **Güven Kademesi:** `Tier: 2` (Çekirdek altyapı, zamanlayıcı, rota yönlendirici ve veri ambarı motoru düzeltmeleri)
- **Tarih:** 2026-09-27
- **Durum:** Tamamlandı (515/515 Node.js testi, 8/8 Python corpus testi, 6 katmanlı doğrulama ve 7 aşamalı doctor kontrolleri başarılı)

---

## 1. Tespit Edilen ve Giderilen Bulgular

### 1.1 `ScheduleBroker` Zamanlayıcı Kilitleme Hatası
- **Bulgu:** `lastCheckedMinute` yerel dakika (0..59) saklamaktaydı ve yalnızca cron eşleştiğinde güncelleniyordu. Belirli bir dakikada ($M$) bir kez çalışan bir iş, ertesi gün veya saatte yine dakika $M$ olduğunda `currentMinute === lastCheckedMinute` şartı nedeniyle zamanlayıcı döngüsünden erken çıkıyor ve periyodik yürütmeyi kalıcı olarak kilitliyordu.
- **Çözüm:** `src/pipeline/schedule-broker.ts` içinde `Math.floor(now.getTime() / 60000)` mutlak zaman damgası (epoch minute, `lastCheckedMinuteEpoch`) formatına geçildi. Ayrıca zamanlayıcı sayacına `timer.unref()` eklenerek arka plan işlemlerinin host sürecin kapanmasını engellemesi önlendi.
- **Doğrulama:** `tests/scheduler-and-remote.test.ts` dosyasına çoklu döngü epoch-dakika testi eklendi.

### 1.2 `PipelineRouter` Asenkron Görev `runId` Senkronizasyonu & DB Sorgulama
- **Bulgu:** `PipelineRouter.handleRunPipeline` metoduna `{ async: true }` ile istek atıldığında HTTP 202 yanıtı olarak `run_async_...` formatında bir `runId` dönüyordu; ancak `runner.runConfig` arka planda bağımsız bir rastgele ID (`run_...`) üretiyordu. İstemci kendisine verilen ID ile `GET /api/v1/pipelines/runs/:id` sorguladığında 404 alıyordu.
- **Çözüm:**
  - `src/pipeline/pipeline-runner.ts` içindeki `runFile`, `runYaml` ve `runConfig` imzalarına `PipelineExecutionOptions { runId?: string }` eklendi.
  - `PipelineRouter.handleRunPipeline` içinde üretilen `estimatedRunId` yürütme motoruna aktarıldı.
  - `runner.getRunById(runId)` metodu eklenerek bellek ve SQLite geçmişi birleşik arama altına alındı.
  - `handleGetRun` metodu `runner.getRunById(runId)` üzerinden temiz ve tutarlı hale getirildi.
- **Doğrulama:** `tests/pipeline-api-and-mcp.test.ts` dosyasına `GET /api/v1/pipelines/runs/:id` entegrasyon testi eklendi.

### 1.3 Python `corpus_pipeline` Kırık Importları ve SQLite `dataset_name` Kısıtı
- **Bulgu 1:** `scripts/corpus_pipeline/` modülleri (`orchestrator.py`, `verifier.py`, `storage/__init__.py`, `cloudflare_r2.py`, `test_corpus_pipeline.py`) eski `scripts.bigdata_pipeline` ad alanından import yapıyordu ve `ModuleNotFoundError` veriyordu.
- **Bulgu 2:** `scripts/corpus_pipeline/requirements.txt` dosyasında `pyarrow` bağımlılığı eksikti.
- **Bulgu 3:** `dataset_shards` SQLite tablosunda `dataset_name TEXT NOT NULL` kolonu bulunmasına rağmen, `metadata_catalog.py` içindeki `register_shard` metodunda `dataset_name` eklenmiyordu; bu durum `sqlite3.IntegrityError` oluşturuyordu.
- **Çözüm:**
  - Tüm importlar `scripts.corpus_pipeline.*` olarak güncellendi.
  - `requirements.txt` dosyasına `pyarrow>=15.0.0` eklendi.
  - `metadata_catalog.py` içindeki `register_shard` metoduna `dataset_name` parametresi eklendi; sağlanmadığı durumlarda `pipeline_runs` tablosundan otomatik çözümlenmesi sağlandı.
  - `package.json` içindeki `test:corpus` betiği `uv run` desteği ile ortam bağımsız hale getirildi.
- **Doğrulama:** `npm run test:corpus` çalıştırıldı; 8/8 test başarıyla geçti.

### 1.4 `safeRedirectFetch` Çapraz Köken (Cross-Origin) Başlık Güvenliği
- **Bulgu:** HTTP 301/302/303 yönlendirmelerinde farklı bir kökene (origin/host) gidildiğinde `Authorization`, `Cookie` ve `Proxy-Authorization` başlıkları silinmeden taşınıyordu (RFC 9110 / token leakage güvenlik riski).
- **Çözüm:** `src/network/safe-redirect-fetcher.ts` içinde yönlendirme kökeni `new URL(nextUrl).origin !== new URL(currentUrl).origin` olduğunda hassas kimlik doğrulama başlıkları silindi.
- **Doğrulama:** `tests/safe-redirect-fetcher.test.ts` dosyasına iki farklı HTTP sunucu portu üzerinden çapraz köken başlık silinme testi eklendi.

### 1.5 `src/api/server.ts` Wikipedia Rotası, Rota Takma Adları ve Hata Yakalama
- **Bulgu 1:** `WikipediaActor` kayıtlı olmasına rağmen `src/api/server.ts` içinde yalnızca `POST /api/v1/wikimedia` rotası bulunuyordu; `POST /api/v1/wikipedia` veya `/wikipedia` 404 dönüyordu.
- **Bulgu 2:** Dokümantasyonda geçen takma ad rotaları (`/markdown`, `/intercept`, `/serp`, `/document`, `/archive`) sunucu yönlendiricisinde eksikti.
- **Bulgu 3:** `InteractiveBrowserController.executeAction` istemci parametre hatalarında fırlattığı istisnalar yerel olarak yakalanmıyor, 500 dönebiliyordu.
- **Bulgu 4:** `src/api/openapi-spec.ts` içinde `/api/v1/wikipedia` eksikti.
- **Çözüm:**
  - `POST /api/v1/wikipedia` ve `POST /wikipedia` yönlendiriciye eklendi.
  - Tüm takma ad rotaları ana rotalarla eşlendi.
  - `executeAction` bloğu `try/catch` ile sarmalanarak `400 BROWSER_ACTION_FAILED` biçimli hata döndürmesi sağlandı.
  - `src/api/openapi-spec.ts` içine OpenAPI 3.1.0 şeması eklendi.
- **Doğrulama:** `tests/wikipedia-actor.test.ts` ve `tests/server.test.ts` testleri ile doğrulandı.

### 1.6 Dokümantasyon ve Mimari Şema Senkronizasyonu
- `src/actors/README.md` dosyasındaki aktör sayısı 31'den 32'ye çıkarıldı; `wikipedia` aktörü hızlı referans tablosuna ve detay bölümüne eklendi; rota takma adları düzeltildi.
- `context/architecture-schema.md` dosyasında aktör sayıları 32 olarak güncellendi.
- `context/connectome.md` sistem haritası `npm run connectome` ile yeniden derlendi.

---

## 2. Doğrulama Özeti

| Doğrulama Aşaması | Çalıştırılan Komut | Sonuç |
|---|---|---|
| Tip Denetimi | `npm run typecheck` | 0 Hata / Başarılı |
| Kod Formatlama & Lint | `npm run lint` | 233 dosya / 0 Hata / Başarılı |
| İsimlendirme Disiplini | `npm run lint:naming` | Sıfır pazarlama jargonu / Başarılı |
| Node.js Test Paketi | `npm test` | **515/515 Başarılı** (77 suite, 0 fail) |
| Python Corpus Paketi | `npm run test:corpus` | **8/8 Başarılı** |
| 6 Aşamalı Doğrulama Hattı | `npm run verify` | **6/6 [PASS]** |
| 7 Aşamalı Depo Sağlık Testi | `npm run doctor` | **7/7 [PASS]** |
