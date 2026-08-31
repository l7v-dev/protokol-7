# P06-T06 — Extraction Evidence ve Field-Level Diagnostics Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T06  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic, local-projection-only, tenant/attempt-scoped, secret-safe ve non-dispatching diagnostics reference contract

## 1. Amaç ve kabul sınırı

P06-T06, extraction evidence ve field-level diagnostics modelini secret-safe biçimde sunma kabul hedefini karşılar.[1] `ExtractionDiagnosticsRegistry`, local selector result ve optional normalization result fixture’larından value/selector saklamayan diagnostics projection üretir. Report, tenant/attempt scope altında immutable plan/artifact fingerprint ve count/status evidence taşır.

Contract target/API/browser fetch, provider/proxy çağrısı, artifact storage read/write, credential kullanımı, queue/worker dispatch, persistence veya external network call yapmaz.

## 2. Execution boundary ve output minimizasyonu

| Boundary | Sabit değer | Etki |
|---|---:|---|
| `executionMode` | `LOCAL_PROJECTION_ONLY` | Yalnız caller-provided local result projection |
| `allowsTargetFetch` | `false` | URL/target isteği yok |
| `allowsArtifactStorageRead/Write` | `false` / `false` | Storage I/O yok |
| `allowsProviderCall` | `false` | Provider/proxy çağrısı yok |
| `allowsBrowserExecution` | `false` | Browser/runtime execution yok |
| `allowsCredentialMaterial` | `false` | Credential materyali kabul edilmez |

Report yalnız scope, plan ID/version/fingerprint, artifact type/content type/size/checksum, fixed field status/error code, selected/normalized/redacted count ve hashed selector/evidence fingerprint taşır. Selected raw value, normalized value, selector string veya artifact storage key report'a eklenmez.

## 3. Field diagnostics doğrulaması

Her plan field için tam olarak bir output zorunludur. Output value sayısı 100’ü, individual UTF-8 value 64 KB’ı aşamaz. Status vocabulary `EXTRACTED`, `EMPTY`, `ERROR` veya `REDACTED` ile sınırlıdır. `ERROR` status bir safe uppercase error code gerektirir; diğer status’lerde error code verilmesi geçersizdir.

| Kontrol | Fail-closed davranış |
|---|---|
| Plan dışı/duplicate/missing field | `EXTRACTION_DIAGNOSTICS_INVALID` |
| Invalid tenant/attempt scope veya checksum | `EXTRACTION_DIAGNOSTICS_INVALID` |
| Status/error code inconsistency | `EXTRACTION_DIAGNOSTICS_INVALID` |
| Value count/byte sınırı | `EXTRACTION_DIAGNOSTICS_INVALID` |
| Normalization fingerprint drift | `EXTRACTION_DIAGNOSTICS_INVALID` |
| Aynı tenant/attempt farklı report | `EXTRACTION_DIAGNOSTICS_CONFLICT` |

Registry aynı report için idempotent clone döndürür; farklı report aynı tenant/attempt altında yeniden yazılamaz. Bu, process-local referans davranışıdır; distributed atomicity veya durable audit/evidence store kanıtı değildir.

## 4. Secret safety, lineage ve determinism

Selector string yerine SHA-256 fingerprint, raw/normalized values yerine yalnız count/status kullanılır. Artifact storage key output’a taşınmaz. Normalization redaction count field diagnostics’te `REDACTED` status’a projekte edilir. Bu, secret-safe diagnostic visibility sağlar; real DLP, secret scanner, storage authorization veya persistent artifact integrity enforcement değildir.

Aynı validated input aynı report ID ve summary ile sonuçlanır. Report tenant ID, job/task/attempt scope’uyla bağlıdır; farklı tenant aynı attempt ID için report’u göremez. Bu test, real multi-node tenant authorization veya database persistence testinin yerine geçmez.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/diagnostics.test.ts` | Başarılı — 1 dosya / 4 test | Boundary clone, deterministic provenance/minimization, redaction count, completeness, idempotency/conflict, tenant retrieval ve status/error consistency rejection |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 427 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. Real target/API/browser fetch, provider/proxy/credential/account integration, storage I/O, queue/worker dispatch veya external network call.
2. Persisted diagnostics/audit store, distributed idempotency/transactionality, real DLP, storage checksum/object verification veya external observability export.
3. AI extraction; P06-T07 kapsamındadır. M6 fixture/drift acceptance ise P06-T08 kapsamındadır.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, quota/policy bypass veya unauthorized data collection.
5. Dashboard/frontend/UI ve `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P06-T06, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız local diagnostics projection contract ve sandbox regression/build kanıtıdır; real extraction evidence storage, distributed tenant enforcement veya production go-live kanıtı değildir. M15 güvenlik kararının **Accepted — CONDITIONAL NO-GO** kısıtı yürürlüktedir; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off eksikleri bu paketle kapanmaz. P06-T07 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T06 kabul kriteri"
