# P15-T06 — Worker/Browser Isolation Hardening Review

**Program:** Scraping Platform  
**Milestone / Phase:** M15 / Phase 15 — Security  
**Task:** P15-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, secret-safe, bounded, non-sandboxing worker/browser isolation hardening reference contract

## 1. Amaç ve kabul sınırı

P15-T06, worker/browser sandbox, resource limit ve tenant isolation hardening için `runtime-isolation/v1` reference posture contract'ını tanımlar. Authoritative task register, worker compromise blast radius ve cross-tenant leakage riskinin testlerle kontrol edilmesini kabul kriteri olarak belirtir.[1]

`src/security/runtime-isolation.ts`, gerçek worker/browser runtime başlatmaz veya sandbox oluşturmaz. Caller'ın sağladığı safe scope, pool ID, bounded resource cap ve closed posture signal'larını değerlendirerek `REFERENCE_READY` ya da `BLOCKED` kararı üretir.

| Kontrol | Bounded rule |
|---|---|
| Worker tenant boundary | `worker.tenantId` request scope tenant'ı ile exact eşleşmeli |
| Browser tenant boundary | `browser.tenantId` request scope tenant'ı ile exact eşleşmeli |
| Worker memory cap | Integer 64–16.384 MB |
| Worker CPU / wall-clock cap | Her biri integer 1–86.400 saniye |
| Worker posture | Network `ISOLATED_REFERENCE`; filesystem `EPHEMERAL_REFERENCE` |
| Browser capacity | Context/page limitleri her biri integer 1–100 |
| Browser state posture | `EPHEMERAL_REFERENCE` |

## 2. Posture ve hardening kararı

Tenant mismatch veya unconfirmed isolation posture, `BLOCKED` sonucu ve yalnız fixed `IsolationControlId` değerleriyle sonuçlanır. Input'ta unsafe identifier, bound dışı resource limit veya unknown posture signal'ı varsa `RUNTIME_ISOLATION_INVALID` ile fail-closed ret uygulanır.

| Output flag | Sabit değer | Anlamı |
|---|---:|---|
| `allowsRuntimeExecution` | `false` | Contract worker/browser başlatmaz veya task çalıştırmaz |
| `allowsSandboxProvisioning` | `false` | Container/namespace/cgroup/sandbox provision etmez |
| `missingControlIds` | Fixed identifier listesi | Ham runtime/session/resource detail sızdırmaz |

> `REFERENCE_READY`, yalnız supplied cap ve posture **reference** sinyallerinin tamlığını ifade eder. Gerçek worker/browser sandbox isolation, OS/container resource enforcement, network namespace, ephemeral storage temizliği veya compromise blast-radius garantisi değildir.

## 3. Veri minimizasyonu

Contract safe tenant/project/job/task/attempt ve pool ID'leri ile numeric resource cap'leri kullanır. Browser session/cookie, credential/token, authorization, target/URL, process/container ID, filesystem path, network interface, environment variable veya raw runtime diagnostic kabul etmez ya da döndürmez.

## 4. Doğrulama kanıtı

Dar kapsam test paketi complete reference-ready posture'ı, cross-tenant mismatch/unconfirmed posture `BLOCKED` kararını, fixed missing-control output'unu ve invalid bound/signal fail-closed yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/security/runtime-isolation.test.ts` | Başarılı — 1 dosya / 3 test | Tenant boundary, resource/posture controls ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 103 dosya / 388 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 5. Bilinçli kapsam dışları

1. Real worker/browser launch, container/VM/sandbox provisioning, namespace/cgroup/ulimit enforcement veya OS kernel isolation.
2. Process/container escape simulation, compromise exploitation, malware execution, filesystem/network inspection veya active penetration test.
3. Runtime resource telemetry/kill/throttle, browser session/cookie clearing, persistent storage cleanup veya cross-tenant production verification.
4. Kubernetes/Docker/Cloud IAM/firewall integration, database/Redis/S3 persistence, alert/on-call dispatch veya automatic remediation.
5. Dashboard/frontend/UI, abandoned `/home/ubuntu/scraping-platform-operations-site` projesi ve policy/anti-bot/CAPTCHA/WAF bypass desteği.

## 6. Review kararı

P15-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız runtime isolation posture reference contract ve sandbox regression/build doğrulamasını kanıtlar; real worker/browser sandbox, cgroup/namespace resource enforcement, runtime cleanup veya production isolation assurance iddiası değildir. Sıradaki bounded paket P15-T07 — Audit, Privacy & Data Access Governance olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 15 Security — P15-T06 kabul kriteri"
