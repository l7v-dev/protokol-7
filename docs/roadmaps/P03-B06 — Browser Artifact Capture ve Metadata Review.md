# P03-B06 — Browser Artifact Capture ve Metadata Review

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Task:** P03-B06  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P03-B05 — kullanıcı onaylı

## 1. Teslim özeti

Browser artifact capture katmanı screenshot, DOM, PDF ve network event çıktılarının tenant/job/task/attempt scope'unda private storage'a yazılmasını sağlar. `BrowserArtifactCapturer`, browser page adapter'ından bounded çıktı alır; `BrowserArtifactWriter` checksum, size, content type ve storage key metadata'sı üretir. Queue result'a raw screenshot, DOM, PDF veya network body konmaz; yalnız artifact reference ve güvenli metadata taşınmalıdır.

Network event capture URL credential, query ve fragment bilgilerini temizler; method/resource type/status/body byte gibi sınırlı metadata'yı JSON artifact olarak yazar. Böylece network diagnostic değeri korunurken raw authorization veya query token sızıntısı azaltılır.

> **Temel kural:** Artifact raw response veya browser state içerebilir; bu nedenle yalnız tenant-scoped private storage'da tutulur, queue/log/trace içinde reference metadata dışında yayınlanmaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/browser/artifacts.ts` | Screenshot/DOM/PDF/network capture, bounded writer ve metadata |
| `test/browser/artifacts.test.ts` | Capture, sanitization, tenant key, checksum, unsupported API ve size limit testleri |
| `docs/phase-3-browser-engine-task-board.md` | Phase 3 task durumu ve kanıt kaydı |

## 3. Artifact türleri ve formatları

| Tür | Content type | Storage suffix | Kaynak |
|---|---|---|---|
| Screenshot | `image/png` | `.png` | Page screenshot adapter |
| DOM | `text/html` | `.html` | Page content adapter |
| PDF | `application/pdf` | `.pdf` | Page PDF adapter |
| Network | `application/json` | `.json` | Sanitized network event list |

Artifact key formatı şöyledir:

```text
tenants/{tenantId}/jobs/{jobId}/tasks/{taskId}/attempts/{attemptId}/{kind}.{suffix}
```

Storage provider checksum ve size metadata'sı authoritative kabul edilir. Artifact writer ayrıca artifact type, tenant, job, task ve attempt metadata'sını storage object metadata'ya koyar; raw secret değerleri bu alanlara alınmaz.

## 4. Güvenlik davranışı

Network event URL'lerinde username/password temizlenir; query ve hash çıkarılır. Invalid URL event'i `[invalid-url]` olarak bounded metadata'ya dönüşür. Cookie, authorization, proxy credential, session state ve page body log/trace veya queue result'a taşınmaz.

Artifact writer'ın maximum byte sınırı capture öncesi ve storage write öncesi kontrol edilir. Unsupported browser page API explicit `BROWSER_ARTIFACT_UNSUPPORTED`, limit aşımı `BROWSER_ARTIFACT_TOO_LARGE`, storage failure `BROWSER_ARTIFACT_WRITE_FAILED` olarak sınıflandırılır. Storage failure retryability üst reliability controller tarafından yönetilir.

## 5. Test kanıtı

Bu pakette **3 yeni artifact testi** eklendi. Testler screenshot, DOM, PDF ve sanitized network capture; credential/query redaction; tenant/attempt-scoped key; checksum metadata; unsupported capture API ve byte limit davranışını doğrular.

Tam backend regression çalışmasında **26 test dosyası / 125 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler fake page adapter ve InMemory storage kullanır; gerçek Playwright screenshot/PDF/DOM capture M3 browser environment acceptance'ında doğrulanacaktır.

## 6. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Gerçek Playwright capture | Page capture adapter contract hazır, gerçek binary pending | P03-B08 |
| Artifact queue integration | Reference metadata API hazır, BrowserWorker result integration pending | P03-B07/P03-B08 |
| S3-compatible storage | Phase 1 filesystem/InMemory adapter sınırı | Storage hardening |
| Network event source | Sanitizer/writer hazır, real route/response event hook pending | P03-B05/P03-B08 |
| Signed URL/export | Kapsam dışı; private storage key kullanılır | Dataset/Export phase |
| DOM/PDF secret DLP | Raw artifact private, content DLP scanner pending | Security hardening |

## 7. Review kararı talebi

P03-B06 browser artifact capture ve metadata implementation paketi review'a sunulmuştur. Onay sonrasında P03-B07 HTTP-to-browser fallback strategy kararı ve worker/orchestrator bağlantısı hazırlanacaktır. Gerçek Playwright capture, network event hook, S3 storage ve artifact DLP kontrolleri M3 gate açık koşullarıdır.

## References

[1]: ./phase-3-browser-engine-p03-b05-review.md "P03-B05 browser network/resource policy"
[2]: ./phase-3-browser-engine-p03-b04-review.md "P03-B04 declarative browser action DSL"
[3]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
