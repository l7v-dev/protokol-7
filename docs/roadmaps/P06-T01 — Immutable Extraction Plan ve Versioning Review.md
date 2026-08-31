# P06-T01 — Immutable Extraction Plan ve Versioning Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T01  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic, tenant-scoped, secret-safe, process-local ve non-dispatching extraction plan reference contract

## 1. Amaç ve kabul sınırı

P06-T01, extraction plan modelini versioned, immutable ve job/attempt ile izlenebilir hâle getirme kabul hedefini karşılar.[1] `ExtractionPlanRegistry`, tenant ve plan ID kapsamında plan taslağını kaydeder; her kayıt yeni bir immutable version, canonical-field fingerprint'i ve timestamp üretir.

Bu registry process-local reference implementation’dır. Extraction çalıştırmaz; URL/target fetch, provider/credential kullanımı, queue/worker dispatch, artifact storage, persistence veya external network call yapmaz.

## 2. Immutable versioning modeli

| Contract öğesi | Davranış |
|---|---|
| Plan scope | `tenantId` + `planId` |
| Version | Her başarılı register işleminde pozitif, artan version |
| Fingerprint | Canonical field sırası üzerinden SHA-256 |
| Defensive copy | Register, resolve ve returned plan nested field/transform değerlerini kopyalar |
| Attempt binding | Tenant/attempt başına tek resolved plan version ve fingerprint |
| Drift koruması | Aynı attempt farklı version’a bağlanırsa `EXTRACTION_PLAN_BINDING_CONFLICT` |

Caller register sonrasında kendi draft field’ını değiştirirse stored version etkilenmez. Resolve sonucunda yapılan nested-field değişiklikleri de registry içindeki immutable sürümü değiştirmez. Böylece plan version, job/task/attempt bağlamı için deterministic fingerprint ile izlenebilir kalır.

## 3. Tenant isolation, validation ve secret safety

Plan resolve/binding yalnız aynı tenant scope içinden bulunabilir. Başka tenant ile aynı plan ID için resolve çağrısı `EXTRACTION_PLAN_NOT_FOUND` ile fail-closed kapanır. Attempt binding key’i de tenant + attempt ID olduğundan farklı tenant attempt kayıtları birbiriyle çakışmaz.

| Kontrol | Fail-closed davranış |
|---|---|
| Safe ID sınırı | Tenant/project/plan/user/job/task/attempt ID 1–128 karakter bounded identifier olmalıdır |
| Source/selector vocabulary | Sadece fixed `HTML`/`JSON`/`TEXT` ve `CSS`/`XPATH`/`JSONPATH` |
| Field sınırı | 1–100 unique field ID/output key |
| Transform sınırı | En çok 10, fixed transform vocabulary |
| `createdAt` | Verilmişse finite Date olmalıdır |
| Sensitive/unsafe plan surface | Secret-like output key veya JavaScript/script/eval selector reddedilir |

Contract provider credential, token, password, cookie, authorization header, endpoint, proxy IP, target URL, raw response veya artifact payload kabul etmez ya da döndürmez. Fingerprint yalnız validated plan metadata'sı için internal integrity referansıdır; secret hashleme/depolama değildir.

## 4. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/plan.test.ts` | Başarılı — 1 dosya / 3 test | Immutable version/fingerprint, caller/resolve mutation isolation, attempt idempotency/drift, tenant isolation, unsafe selector/output key ve invalid date rejection |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 422 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 5. Bilinçli kapsam dışları

1. CSS/XPath/JSONPath extraction yürütmesi; bu yüzeyler sonraki P06 paketlerinin konusudur.
2. URL/HTTP/browser fetch, target dispatch, provider/proxy usage, queue/worker scheduling veya persistent database/artifact storage.
3. Credential/account/endpoint yönetimi, external service integration veya live model call.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, quota/policy bypass veya unauthorized data collection.
5. Dashboard/frontend/UI ve `/home/ubuntu/scraping-platform-operations-site` projesi.

## 6. Review kararı

P06-T01, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız process-local immutable plan/versioning reference contract ile sandbox regression/build kanıtıdır; real extraction, distributed persistence veya production go-live kanıtı değildir. M15 güvenlik kararının **Accepted — CONDITIONAL NO-GO** kısıtı yürürlüktedir; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off eksikleri bu paketle kapanmaz. P06-T02 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T01 kabul kriteri"
