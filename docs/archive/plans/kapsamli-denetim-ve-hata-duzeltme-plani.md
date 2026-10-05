# Kapsamlı Proje Denetimi, Hata Düzeltme ve Mimari Senkronizasyon Planı

Bu plan, **protokol-7** kod tabanında gerçekleştirilen kapsamlı teknik denetim sonucunda tespit edilen 6 ana bulgunun giderilmesini ve sistem bütünlüğünün sağlanmasını hedefler.

- **Güven Kademesi:** `Tier: 2` (Mevcut çekirdek dosyalarda hata düzeltme ve mimari senkronizasyon)
- **Tarih:** 2026-09-27
- **Kapsam:** `src/pipeline/`, `src/network/`, `src/api/`, `scripts/corpus_pipeline/`, `src/actors/`, `tests/`

---

## 1. Tespit Edilen Bulgular ve Eylem Adımları

### Adım 1: `ScheduleBroker` Zamanlayıcı Kilitleme Hatasının Giderilmesi
- **Dosya:** `src/pipeline/schedule-broker.ts`
- **Sorun:** `lastCheckedMinute` yerel dakika (0..59) saklamakta ve sadece cron eşleştiğinde güncellenmektedir. Dakika $M$'de bir kez çalışan iş, bir sonraki gün veya saatte dakika $M$ olduğunda `currentMinute === lastCheckedMinute` şartı nedeniyle döngüden erken çıkmakta ve kalıcı olarak kilitlenmektedir.
- **Eylem:** `Math.floor(now.getTime() / 60000)` mutlak dakika damgası (epoch minute) kullanılacak; dakikalık kontrol güvene alınacak. Birim testi eklenecektir.

### Adım 2: `PipelineRouter` Asenkron Görev `runId` Senkronizasyonu ve `PipelineRunner` Veritabanı Düzeltmesi
- **Dosyalar:** `src/pipeline/pipeline-runner.ts`, `src/api/routers/pipeline-router.ts`
- **Sorun 1:** `PipelineRouter.handleRunPipeline` asenkron çağrıda (`async: true`) sahte bir `estimatedRunId` üretip 202 ile dönmekte, ancak `runner.runConfig` kendi bağımsız `runId`'sini üretmektedir. İstemci 404 almaktadır.
- **Eylem 1:** `PipelineRunner.runConfig` metoduna opsiyonel `customRunId?: string` desteği eklenecek, asenkron yürütmede üretilen `runId` koşucuya geçirilecektir.
- **Sorun 2:** `PipelineRunner.getRunHistory` limit belirtilmediğinde veritabanını atlayıp belleğe bakmaktadır.
- **Eylem 2:** Limit tanımsız olduğunda varsayılan 50 ile veritabanından çekilmesi sağlanacaktır.

### Adım 3: Python `corpus_pipeline` İç İçe Geçmiş Kırık Importların Onarılması
- **Dosyalar:**
  - `scripts/corpus_pipeline/storage/cloudflare_r2.py`
  - `scripts/corpus_pipeline/storage/__init__.py`
  - `scripts/corpus_pipeline/verifier.py`
  - `scripts/corpus_pipeline/orchestrator.py`
  - `scripts/corpus_pipeline/test_corpus_pipeline.py`
  - `scripts/corpus_pipeline/requirements.txt`
- **Sorun:** `bigdata_pipeline` ad alanından kalan tüm importlar `ModuleNotFoundError` fırlatmaktadır; `requirements.txt` dosyasında `pyarrow` eksiktir.
- **Eylem:** Tüm importlar `scripts.corpus_pipeline.*` olarak güncellenecek; `requirements.txt`'ye `pyarrow>=15.0.0` eklenecektir.

### Adım 4: `safeRedirectFetch` Çapraz Köken (Cross-Origin) Yetki Başlığı Güvenliği
- **Dosya:** `src/network/safe-redirect-fetcher.ts`
- **Sorun:** Yönlendirmelerde köken değiştiğinde `Authorization` başlığı silinmemektedir (RFC 9110 / token leakage riski).
- **Eylem:** `new URL(nextUrl).origin !== new URL(currentUrl).origin` olduğunda `currentHeaders.delete("authorization")` ve `currentHeaders.delete("cookie")` uygulanacaktır. Test yazılacaktır.

### Adım 5: `src/api/server.ts` Wikipedia Rotası, Takma Adlar ve Hata Yakalama
- **Dosyalar:** `src/api/server.ts`, `src/api/openapi-spec.ts`
- **Eylem:**
  - `POST /api/v1/wikipedia` ve `POST /wikipedia` doğrudan rotası eklenecektir.
  - Dokümantasyonda geçen takma ad rotaları (`/api/v1/markdown`, `/api/v1/intercept`, `/api/v1/serp`, `/api/v1/document`, `/api/v1/archive`) tanımlanacaktır.
  - `InteractiveBrowserController.executeAction` istemci kaynaklı parametre hataları yerel `try/catch` ile yakalanıp `400 BROWSER_ACTION_FAILED` olarak döndürülecektir.
  - OpenAPI 3.1.0 şemasına `/api/v1/wikipedia` eklenecektir.

### Adım 6: Dokümantasyon ve Mimari Şema Senkronizasyonu
- **Dosyalar:** `src/actors/README.md`, `context/architecture-schema.md`, `TASKS.md`
- **Eylem:** Aktör sayısı 32 olarak güncellenecek, rota tabloları senkronize edilecek, `TASKS.md` aktif görev bilgisi güncellenecektir.

### Adım 7: Doğrulama ve Test
- Tüm testler (`npm run test`), tip denetimi (`npm run typecheck`), kod analizi (`npm run lint`), ve deterministik doğrulama hattı (`npm run verify`) çalıştırılacaktır.
