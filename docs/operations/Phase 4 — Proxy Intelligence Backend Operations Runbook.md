# Phase 4 — Proxy Intelligence Backend Operations Runbook

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Kapsam:** Backend-only  
**Durum:** P04-B08 review paketi  
**Owner:** SRE/Platform Lead

## 1. Runbook amacı

Bu runbook, provider-neutral Proxy Intelligence backend'inin kontrollü onboarding, health izleme, lease/quarantine yönetimi, maliyet takibi, failure response ve rollback prosedürlerini tanımlar. Operasyonların tamamı tenant, target policy, provider capability ve lease scope sınırları içinde yürütülür.

> **Production guardrail:** Gerçek provider credential'ı, endpoint auth değeri, cookie, authorization header veya session materyali database, queue, log, trace, artifact ya da incident çıktısına yazılmaz. Provider credential yalnız opaque reference üzerinden resolver boundary içinde kullanılır.

Mevcut P04-B08 kanıtı provider-neutral `FakeProxyProvider` ve kontrollü failure injection'dır. Bu runbook canlı vendor onboarding'inin tamamlandığını veya production trafiğinin güvenli olduğunu göstermez.

## 2. Provider onboarding

Yeni provider önce `ProxyProvider` contract'ına adapter olarak bağlanır. Core selection, lease manager veya worker içine provider-specific branch eklenmez. Adapter; `providerId`, immutable `version`, `capabilities`, `health`, `acquire`, `release`, `quarantine` ve destekleniyorsa `rotate` operasyonlarını sağlar.

| Kontrol | Beklenen kanıt | Başarısızlık davranışı |
|---|---|---|
| Capability | Protocol, class, country/region, sticky/rotation, metering ve max lease bildirimi | `PROXY_CAPABILITY_MISMATCH`, retry yok |
| Credential | Opaque reference resolve/revoke/rotate testi | Credential error terminal; raw secret yok |
| Acquire | Lease tenant/project/target/job/task/attempt scope'u ile döner | Scope mismatch terminal policy refusal |
| Release | Idempotent veya güvenli release davranışı | Lease state korunur, unsafe reuse yok |
| Quarantine | Provider'a reason code ile bildirim | Candidate yeniden seçilmez |
| Health | Safe provider health snapshot | Health unavailable bounded retry sinyali |
| Meter reference | Opaque ve deterministic kullanım reference'ı | Raw tenant/credential/endpoint eklenmez |

Onboarding önce fake provider conformance suite'i ile, sonra staging credential reference ve staging endpoint ile yapılmalıdır. Production enablement için provider health, quota/rate, tariff, contract version ve incident contact kayıtları ayrıca onaylanır.

## 3. Credential ve secret operasyonu

Credential değeri yalnız secret resolver sınırında erişilir. Provider adapter operation callback'ine resolved material verilir; callback tamamlandıktan sonra materyal referansı dışına çıkmaz. Credential rotate işleminde yeni opaque reference önce doğrulanır, provider health smoke testi geçtikten sonra eski reference revoke edilir.

| Olay | Operasyon | Audit metadata'sı |
|---|---|---|
| Create | Opaque reference kaydet; secret value kaydetme | providerId, reference version, actor |
| Resolve/use | Sadece adapter callback scope'unda kullan | providerId, operation, correlationId |
| Rotate | Yeni reference doğrula; cutover; eskiyi revoke et | old/new reference ID değil, yalnız version/status |
| Revoke | Provider kullanımını durdur; catalog entries disable/quarantine | reason code, actor, occurredAt |
| Leak şüphesi | Reference revoke, provider credential rotate, affected proxy quarantine | incident ID, severity |

Loglarda secret pattern görüldüğünde olay **SEV-1 security incident** olarak ele alınır. Secret value'ı logdan silmeye çalışmak yerine ilgili log/artifact erişimi kısıtlanır, credential revoke/rotate edilir ve forensic retention politikasına göre incident kaydı tutulur.

## 4. Health, capacity ve quarantine

Health registry provider ve proxy scope'unda bounded rolling sample tutar. Success rate, latency ve failure signals composite score'a dönüşür. Sample olmayan candidate neutral health ile değerlendirilir; quarantine recommendation üreten candidate selection tarafından varsayılan olarak dışlanır.

| Sinyal | Eşik/karar | Operasyon aksiyonu |
|---|---|---|
| Repeated acquire timeout | Provider/proxy threshold aşımı | Candidate quarantine recommendation, bounded retry |
| Low success rate | Rolling success threshold altı | Trafiği azalt, provider health doğrula |
| High latency | Policy latency budget üstü | Cost/health selection sinyalini izle |
| Capacity zero | Provider available capacity sıfır | Yeni lease alma; mevcut lease expiry/release bekle |
| Target-specific failure | Aynı target/geo/class üzerinde yoğunlaşma | Target policy ve geo route incele; unsafe failover yapma |
| Manual incident | SRE kararı | Provider disable veya proxy quarantine; audit üret |

Quarantine sonrası lease yeniden kullanılamaz. Rotation yalnız aynı tenant/target/job/task/attempt scope'u ve provider capability izin veriyorsa çalışır; rotation anti-bot bypass veya sınırsız retry mekanizması değildir.

## 5. Cost ve quota operasyonu

Her proxy kullanımında request, GB ve lease hour ölçümleri ayrı immutable usage event olarak üretilir. Event, tariff snapshot, source, provider/proxy ve attempt/job attribution taşır. Aynı tenant + idempotency key + category combination'ı yeniden işlendiğinde ilk event korunur; duplicate maliyet üretilmez.

| Kontrol | Beklenen davranış |
|---|---|
| Request | Gerçek request count ölçülür |
| GB | Byte miktarı binary GB'a normalize edilir |
| Lease | Lease seconds hour'a normalize edilir |
| Tariff | Event oluşumundaki rate snapshot korunur |
| Job summary | Attempt event'leri tenant/job scope'ta toplanır |
| Quota breach | Yeni acquire/usage policy tarafından durdurulur; bypass retry yok |
| Missing tariff | Operasyonel uyarı; production enablement öncesi registry tamamlanır |

Cost record failure'ı provider policy, private target veya authentication barrier'ını aşmak için route/engine değiştirme gerekçesi değildir. P04-B07 reference meter process-local'dir; distributed Postgres repository ve transactional job rollup henüz gate koşuludur.

## 6. Failure response matrisi

| Failure | Retry | Failover | İlk aksiyon |
|---|---:|---:|---|
| `PROXY_ACQUIRE_TIMEOUT` | Bounded, policy ile | Yalnız eligible candidate varsa | Health sample yaz, lease üretme |
| `PROVIDER_TRANSPORT_FAILED` | Bounded | Unsafe provider swap yok | Provider/proxy score düşür, incident severity değerlendir |
| `PROVIDER_HEALTH_UNAVAILABLE` | Bounded probe | Quarantine recommendation | Provider health stale olarak işaretle |
| `PROVIDER_CREDENTIAL_INVALID` | Otomatik credential retry yok | Yok | Reference revoke/rotate ve provider disable |
| `PROXY_CAPABILITY_MISMATCH` | Yok | Yok | Selection/catalog policy düzelt |
| `PROXY_LEASE_EXPIRED` | Yok | Yeni policy-controlled acquire | Eski lease reuse etme |
| `PROXY_LEASE_NOT_FOUND` | Yok | Yok | Lease state/reconciliation incele |
| Private/forbidden target | Yok | Yok | Policy violation terminal |
| CAPTCHA/anti-bot barrier | Yok | Yok | Bypass/automation deneme; sonucu audit et |

Failure injection yalnız test ortamında ve açık test fixture üzerinden çalıştırılır. Production provider operation'ına runtime failure injection eklenmez. Failure injection testleri bounded count, retryable flag, recovery ve raw failure material'in event/log state'e yazılmadığını kanıtlamalıdır.

## 7. Rollback ve disable prosedürü

Provider veya tariff değişikliğinde önce yeni version disable durumda tutulur. Health ve conformance kanıtları geçmeden catalog entry `AVAILABLE` yapılmaz. Sorun halinde yeni provider version disable edilir, active lease'ler expiry/release akışına bırakılır, sticky binding yeni acquire için kullanılmaz ve eski güvenli version'a kontrollü rollback uygulanır.

Rollback sırasında mevcut lease'i başka tenant, target veya attempt'e taşımak yasaktır. Proxy catalog status, provider status, credential reference version ve audit reason aynı correlation/incident scope'u ile kaydedilir. Cost event'ler immutable olduğundan geçmiş event overwrite edilmez; düzeltmeler yeni adjustment event sözleşmesiyle yapılmalıdır.

## 8. Gözlemlenebilirlik ve audit

Minimum operasyon sinyalleri provider health, proxy health, acquire latency, acquire failure code, active lease count, expiry/quarantine count, request/GB/lease usage ve estimated cost'tur. Bu sinyaller raw endpoint, credential, cookie, authorization veya response body içermeyen structured metadata olarak tutulur.

| Alarm | Öncelik | Müdahale |
|---|---|---|
| Credential invalid veya suspected leak | SEV-1 | Revoke/rotate, provider disable, security incident |
| Provider health unavailable | SEV-2 | Health probe ve dependency incelemesi |
| Acquire timeout spike | SEV-2 | Capacity/quota/latency incelemesi, bounded traffic reduction |
| Cost rate missing/mismatch | SEV-2 | Tariff registry durdurma, yeni allocation'ı review'a alma |
| Lease expiry/quarantine spike | SEV-2 | Target/provider ayrıştırması ve catalog review |
| Normal isolated proxy failure | SEV-3 | Rolling health update ve routine follow-up |

## 9. Reliability telemetry ve incident triage

P05-T07 ile backend, raw response veya secret taşımadan reliability olaylarını metric counter ve bounded recent-event projection olarak toplar. Minimum counter seti `reliability_events_total`, `reliability_failures_total`, `reliability_retries_total`, `reliability_escalations_total` ve `reliability_circuit_blocks_total` değerlerini içerir. Label'lar sabit allowlist'ten üretilir; tenant/job/task/attempt identifier'ları attribution için kullanılabilir ancak URL, query, response body, cookie, authorization, credential veya endpoint değeri metric label'ı olamaz.

| Sinyal | Triage sorusu | İlk aksiyon |
|---|---|---|
| `reliability_failures_total` artışı | Failure access class ve target/provider scope'u nedir? | Classifier, egress policy ve health sample'ı karşılaştır |
| `reliability_retries_total` artışı | Retry budget ve backoff sınırları korunuyor mu? | `retryDelaySource`, budget remaining ve circuit state'i kontrol et |
| `reliability_circuit_blocks_total` artışı | Provider/target tekrar eden failure nedeniyle mi açık? | Quarantine kaynağı, expiry ve half-open probe durumunu incele |
| `reliability_escalations_total` artışı | Browser/proxy recommendation policy ve budget ile uyumlu mu? | Recommendation'ı icra etmeden önce policy, lease ve target scope doğrula |
| `ESCALATION_BUDGET_EXHAUSTED` | Unsafe repeated engine/provider transition var mı? | Yeni escalation'ı durdur, incident scope'unda incele |
| `ANTI_BOT_BARRIER` / `POLICY_BLOCKED` | Bypass denemesi veya yanlış route var mı? | Terminal sonucu koru; browser/proxy bypass çalıştırma |

Incident çıktısı yalnız normalized code, access class, strategy, outcome, safe scope ID'leri, timestamp ve metric counter taşımalıdır. Secret veya raw response sızıntısı şüphesinde olay SEV-1 kabul edilir; log/artifact erişimi kısıtlanır, credential reference revoke/rotate edilir ve forensic retention uygulanır.

### 9.1 Operasyonel alarm ve recovery

Alert routing process-local collector'a değil, production'da merkezi metrics backend'ine yapılmalıdır. Counter reset/restart sonrası geçmiş alarm durumu kaybolmamalı; Postgres/Redis veya eşdeğer durable telemetry pipeline'ı production enablement öncesi doğrulanmalıdır. Circuit block alarmı açıldığında otomatik provider rotation yapılmaz; operatör ilgili tenant/target/provider scope'unu inceleyip manual quarantine veya kontrollü clear kararı verir.

Retry ve escalation bütçeleri tenant/job/task scope'unda izlenir. Budget exhaustion recovery için yeni bir job/attempt açılması, eski attempt'in maliyet ve audit bağını silmez. Cost event'ler immutable kalır; düzeltme gerekiyorsa adjustment event üretilir.

## 10. M4 öncesi canlıya alma kontrol listesi

M4 gate kapatılmadan önce gerçek provider conformance, staging credential lifecycle, Postgres usage insert/idempotency, Redis/BullMQ worker event flow, distributed lease/catalog/health state, cost rollup, alert routing ve rollback drill kanıtlanmalıdır. Sandbox'ta Postgres ve Redis bulunmadığı için bu maddeler mevcut review'da **açık koşul** olarak kalır.

## References

[1]: ./phase-4-proxy-intelligence-p04-b01-review.md "P04-B01 ProxyProvider contract"
[2]: ./phase-4-proxy-intelligence-p04-b02-review.md "P04-B02 opaque credential lifecycle"
[3]: ./phase-4-proxy-intelligence-p04-b04-review.md "P04-B04 lease lifecycle"
[4]: ./phase-4-proxy-intelligence-p04-b05-review.md "P04-B05 health registry"
[5]: ./phase-4-proxy-intelligence-p04-b07-review.md "P04-B07 cost metering"
[6]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[7]: ../../scraping-platform-docs/docs/09-deployment-operations.md "Deployment ve operasyon baseline"
[8]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
