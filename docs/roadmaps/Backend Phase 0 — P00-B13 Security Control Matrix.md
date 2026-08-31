# Backend Phase 0 — P00-B13 Security Control Matrix

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Faz:** Phase 0 — Architecture & Specification  
**Task:** P00-B13 — Secret, credential, SSRF, egress, webhook ve worker isolation kararlarını yaz  
**Sürüm:** 1.0.0  
**Durum:** In Progress  
**Bağımlılık:** P00-B12 — Accepted  
**Owner:** Security Lead

## 1. Amaç

Bu belge, P00-B12'de onaylanan güvenlik baseline'ını uygulanabilir backend kontrollerine, sahiplerine ve test kanıtlarına dönüştürür. Kontroller; sırların korunması, hedef/egress güvenliği, webhook doğrulaması, queue/worker izolasyonu, browser context güvenliği ve veri sızıntısının önlenmesine odaklanır.

## 2. Kontrol sınıfları

| Sınıf | Anlam |
|---|---|
| `PREVENT` | Güvensiz eylemi gerçekleşmeden engeller |
| `DETECT` | Güvensiz davranışı veya anomalini görünür kılar |
| `RESPOND` | Olay/ihlal sonrası sınırlama veya düzeltme uygular |
| `GOVERN` | Kural, sahiplik, onay ve kanıt gerektirir |

## 3. Secret ve credential kontrol matrisi

| ID | Kontrol | Tür | Uygulama kararı | Owner | Kanıt |
|---|---|---|---|---|---|
| SEC-CTRL-001 | Raw secret database'e yazılmaz | PREVENT | `secretRef`/credential ID saklanır; raw değer yalnızca secret provider üzerinden resolve edilir | Security + Backend | DB secret scan |
| SEC-CTRL-002 | Secret log/trace/audit'te maskelenir | PREVENT | Key-name ve pattern tabanlı redaction; nested JSON dahil | Security + SRE | Redaction test logu |
| SEC-CTRL-003 | API response secret döndürmez | PREVENT | Credential resource yalnız metadata/status döner | Backend | Contract/security test |
| SEC-CTRL-004 | Queue payload secret taşımaz | PREVENT | Token/cookie/session yerine reference ve checksum kullanılır | Backend | Envelope schema test |
| SEC-CTRL-005 | Credential tenant ve resource scope ile kullanılır | PREVENT | `credential:use` authorization + target/provider match | Security + Backend | Negative auth test |
| SEC-CTRL-006 | Credential rotation desteklenir | RESPOND | `ACTIVE → ROTATING → ACTIVE/REVOKED` lifecycle | Security + SRE | Rotation runbook/test |
| SEC-CTRL-007 | Credential expiry/revoke sonrası kullanım reddedilir | PREVENT | Resolve öncesi status/expiry kontrolü | Backend | Expiry/revoke test |
| SEC-CTRL-008 | Secret erişimi audit edilir | DETECT | Actor/service, credential ID, resource ve result kaydı; raw değer yok | Security + Audit | Audit query |
| SEC-CTRL-009 | Provider token process/env scope'unda sınırlanır | PREVENT | Gerekli adapter process'i dışında paylaşılmaz | SRE | Runtime permission review |
| SEC-CTRL-010 | Secret scanning CI kalite kapısıdır | DETECT | Repo, config, artifact ve log fixture'larında secret pattern taraması | Security | CI report |

## 4. SSRF ve egress kontrol matrisi

| ID | Kontrol | Tür | Uygulama kararı | Owner | Kanıt |
|---|---|---|---|---|---|
| SEC-CTRL-011 | URL scheme allowlist | PREVENT | Yalnız policy'nin izin verdiği scheme'ler | Security + Backend | URL validation test |
| SEC-CTRL-012 | Host allowlist | PREVENT | Target `allowedHosts` veya tenant policy ile eşleşme | Backend | Host boundary test |
| SEC-CTRL-013 | Port allowlist | PREVENT | Beklenmeyen/internal/admin portlar reddedilir | Security + SRE | Port test matrix |
| SEC-CTRL-014 | Private/loopback/link-local IP engeli | PREVENT | Resolve sonrası yasak IP sınıfları dış çağrıdan önce reddedilir | Security + SRE | SSRF negative test |
| SEC-CTRL-015 | Metadata endpoint engeli | PREVENT | Cloud/container metadata adresleri ayrı blocklist ve IP policy ile reddedilir | Security | SSRF test evidence |
| SEC-CTRL-016 | DNS rebind kontrolü | PREVENT | Resolve edilen adres ve bağlantı hedefi policy ile doğrulanır | SRE | DNS consistency test |
| SEC-CTRL-017 | Redirect her hop'ta doğrulanır | PREVENT | Yeni scheme/host/port/IP için policy yeniden çalışır | Backend | Redirect escape test |
| SEC-CTRL-018 | Response size ve decompression limiti | PREVENT | Compressed/decompressed byte limiti ve total deadline | Backend | Large response test |
| SEC-CTRL-019 | Egress network policy | PREVENT | Worker yalnız izinli çıkış katmanı/portlarına erişebilir | SRE | Network policy evidence |
| SEC-CTRL-020 | Target URL log redaction | PREVENT | Query token/credential maskelenir; host dışında minimum metadata | SRE | Log fixture scan |
| SEC-CTRL-021 | Webhook destination private IP engeli | PREVENT | Webhook URL için SSRF kontrolleri target fetch ile aynı uygulanır | Security + Backend | Webhook SSRF test |
| SEC-CTRL-022 | Egress exception yönetimi | GOVERN | Exception; gerekçe, owner, süre ve approval ile kayıtlıdır | Security + Compliance | Exception register |

## 5. Webhook kontrol matrisi

| ID | Kontrol | Tür | Uygulama kararı | Owner | Kanıt |
|---|---|---|---|---|---|
| SEC-CTRL-023 | Webhook endpoint doğrulaması | PREVENT | Scheme/host/port/IP/redirect policy | Backend | Config validation test |
| SEC-CTRL-024 | Payload imzası | PREVENT | Shared secret reference ile HMAC/eşdeğer imza; raw secret loglanmaz | Backend + Security | Signature test |
| SEC-CTRL-025 | Replay önleme | PREVENT | Timestamp, nonce/event ID ve kabul penceresi | Backend | Replay test |
| SEC-CTRL-026 | Delivery idempotency | PREVENT | Event ID ve delivery attempt ile duplicate callback kontrolü | Backend | Duplicate delivery test |
| SEC-CTRL-027 | Webhook retry sınırlaması | RESPOND | Backoff, max attempt, DLQ/delivery failure status | SRE | Delivery runbook |
| SEC-CTRL-028 | Webhook secret rotation | RESPOND | Active/previous secret overlap ve revoke policy | Security | Rotation evidence |
| SEC-CTRL-029 | Webhook response handling | PREVENT | Response body loglanmaz; status/latency/size sınırlı telemetry | SRE | Redaction test |

## 6. Worker ve browser isolation matrisi

| ID | Kontrol | Tür | Uygulama kararı | Owner | Kanıt |
|---|---|---|---|---|---|
| SEC-CTRL-030 | Worker least privilege | PREVENT | API/worker/migration service account'ları ayrıdır | SRE + Security | IAM matrix |
| SEC-CTRL-031 | Worker task capability | PREVENT | Worker yalnız desteklediği task type'ı claim eder | Backend | Capability test |
| SEC-CTRL-032 | Tenant context doğrulama | PREVENT | Envelope tenant/resource tenant eşleşmesi zorunlu | Backend | Cross-tenant test |
| SEC-CTRL-033 | Task lease/fencing | PREVENT | Eski worker result'ı yeni attempt state'ini ezemez | Backend + SRE | Stale result test |
| SEC-CTRL-034 | CPU/memory/time limit | PREVENT | Task, worker ve browser process resource budget'i | SRE | Load/resource test |
| SEC-CTRL-035 | Browser context isolation | PREVENT | Her context tek tenant/attempt; context reuse yasak | Browser Worker | Isolation test |
| SEC-CTRL-036 | Session cleanup | RESPOND | Ephemeral session/context terminal attempt'te dispose edilir | Browser Worker | Cleanup evidence |
| SEC-CTRL-037 | Browser action allowlist | PREVENT | Declarative action DSL; serbest privileged script yok | Backend + Security | DSL validation test |
| SEC-CTRL-038 | Artifact access scope | PREVENT | Artifact URI tenant/job/attempt authorization ile açılır | Storage + Backend | Presigned URL test |
| SEC-CTRL-039 | Process crash recovery | RESPOND | Worker crash lease timeout/reclaim/retry ile sonuçlanır | SRE | Failure injection |
| SEC-CTRL-040 | Worker image/dependency integrity | GOVERN | Pinned build, dependency scan ve release evidence | SRE + Security | CI/release report |

## 7. Queue ve payload kontrolleri

| ID | Kontrol | Tür | Uygulama kararı | Owner | Kanıt |
|---|---|---|---|---|---|
| SEC-CTRL-041 | Queue authenticated connection | PREVENT | Environment-scoped credential ve network restriction | SRE | Connection/IAM review |
| SEC-CTRL-042 | Message schema validation | PREVENT | messageType/schemaVersion/payload doğrulanır | Backend | Contract test |
| SEC-CTRL-043 | Message integrity | DETECT | Payload hash veya imza; mismatch quarantine | Backend + Security | Tamper test |
| SEC-CTRL-044 | Message size limit | PREVENT | Büyük body artifact reference olarak taşınır | Backend | Oversized message test |
| SEC-CTRL-045 | DLQ access control | PREVENT | Replay ve DLQ read yalnız ops scope | SRE + Security | RBAC test |
| SEC-CTRL-046 | Queue log redaction | PREVENT | Payload tamamı loglanmaz; ID/hash kullanılır | SRE | Log scan |

## 8. Control evidence standardı

Her kritik kontrol aşağıdaki kanıtlardan en az biriyle doğrulanır:

| Kanıt türü | Kullanım |
|---|---|
| Architecture/ADR | Tasarım ve sahiplik kararı |
| Unit test | Parser, policy, classifier, redaction gibi saf kurallar |
| Integration test | API/DB/queue/storage ve tenant scope |
| E2E test | Job/worker/browser/export akışı |
| Security test | SSRF, auth, secret, isolation, tamper |
| Runtime evidence | Metric, log, trace, alarm ve dashboard |
| Runbook | Olay veya cleanup müdahalesi |
| Approval record | Risk acceptance/exception/sign-off |

## 9. Faz bazlı uygulama planı

| Faz | Bu matristeki kontrol grubu | Uygulama hedefi |
|---|---|---|
| Phase 0 | Mimari, threat, owner ve test baseline | Kontrol kararı ve kanıt planı |
| Phase 1 | Auth context, DB/queue/storage temel guard'ları | Temel prevent kontrolleri |
| Phase 2 | HTTP URL/redirect/response/egress | HTTP güvenlik testleri |
| Phase 3 | Browser context/session/action/isolation | Browser güvenlik ve cleanup |
| Phase 4 | Provider/credential/lease | Provider secret ve access controls |
| Phase 5 | Retry/circuit/quarantine | Kontrollü reliability ve abuse sınırı |
| Phase 9 | Lifecycle/fencing/reconciliation | Stale result ve recovery |
| Phase 11 | Dataset/export/artifact | Lineage, presigned access, retention |
| Phase 15 | Hardening/pentest/scan/go-live | Tüm kritik kontroller için release gate |

## 10. P00-B13 kabul kriterleri

P00-B13 `Accepted` sayılması için:

1. Secret ve credential değerlerinin saklama, kullanım, rotation ve redaction kuralları tanımlıdır.
2. SSRF/egress; scheme, host, port, IP, metadata, DNS, redirect ve response boyutu seviyelerinde kontrol edilir.
3. Webhook destination, signature, replay, idempotency ve retry kontrolleri yazılıdır.
4. Worker, browser context, session, artifact ve queue payload izolasyonu belirlenmiştir.
5. Her kontrolün türü, owner'ı, doğrulama kanıtı ve hedef fazı vardır.
6. Kontrol exception'ı için owner, süre ve approval şartı tanımlıdır.
7. P00-B12 baseline, P00-B06 execution domain ve P00-B11 reliability policy ile çelişki yoktur.
8. Security Lead, Backend Lead, SRE, Compliance ve QA review'ü tamamlanmıştır.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: ../07-security-rbac.md "Genel güvenlik ve RBAC dokümanı"
[3]: phase-0-m0-backend-security.md "Backend security baseline"
[4]: phase-0-m0-execution-domain.md "Extended execution domain"
[5]: phase-0-m0-queue-contract.md "Queue topology ve message contract"
[6]: phase-0-m0-reliability-policy.md "Reliability policy"
[7]: phase-0-m0-backend-requirements.md "Backend gereksinim register'ı"
