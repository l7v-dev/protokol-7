# P04-B01 — ProxyProvider Interface ve Capability Model Review

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Task:** P04-B01  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** GATE-P03-M3 — `CONDITIONAL GO`, kullanıcı onaylı

## 1. Karar özeti

Proxy Intelligence provider-specific credential, API, endpoint veya response formatını platform core'undan ayıran ortak bir `ProxyProvider` adapter sözleşmesiyle başlar. Core yalnız opaque provider reference, capability filtresi, access requirement, lease request ve safe health/cost metadata görür. Provider raw secret'i adapter sınırında çözülür ve adapter call süresince memory'de tutulur; persistence, queue, log, trace veya artifact'e yazılmaz.

> **Temel kural:** Platform proxy seçer ve lease lifecycle'ını yönetir; provider-specific authentication ve endpoint ayrıntıları yalnız adapter sınırında kalır.

## 2. Provider interface

```ts
export type ProxyCapability = {
  protocols: Array<'http' | 'https' | 'socks5'>;
  proxyClasses: Array<'datacenter' | 'residential' | 'mobile' | 'isp'>;
  countries: string[];
  regions: string[];
  supportsStickySession: boolean;
  supportsRotation: boolean;
  maxLeaseSeconds?: number;
  metering: {
    request: boolean;
    bytes: boolean;
    lease: boolean;
  };
};

export type ProxyProvider = {
  providerId: string;
  version: string;
  capabilities(): Promise<ProxyCapability>;
  health(): Promise<ProxyProviderHealth>;
  acquire(request: ProxyAcquireRequest): Promise<ProxyLease>;
  release(lease: ProxyLease): Promise<void>;
  quarantine(lease: ProxyLease, reason: ProxyQuarantineReason): Promise<void>;
};
```

`ProxyProvider` method'ları provider raw response'unu core'a taşımaz. `ProxyLease` yalnız safe proxy endpoint reference, lease ID, expiry, provider ID, proxy class, country/region, sticky key hash ve cost meter reference içerebilir. Username/password/token değerleri interface result'ında bulunmaz.

## 3. Capability ve access request sözleşmesi

| Alan | Kural |
|---|---|
| `protocols` | Target access plan ile kesişim alınır; unsupported protocol seçilemez |
| `proxyClasses` | Target policy'nin izin verdiği class ile kesişim alınır |
| `countries/regions` | Geo requirement ile deterministic filtrelenir |
| `supportsStickySession` | Sticky policy izin vermiyorsa kullanılmaz |
| `supportsRotation` | Rotation policy ile birlikte değerlendirilir |
| `maxLeaseSeconds` | Target/job deadline'dan uzun lease verilemez |
| `metering` | Request/bytes/lease cost event capability ile işaretlenir |
| `providerId/version` | Health, audit ve cost lineage için safe metadata |

`ProxyAcquireRequest` tenantId, projectId, targetId, jobId, taskId, attemptId, protocol, class, geo, sticky policy, lease deadline ve correlation/trace scope'u taşır. Raw target URL query veya raw credential request'e yazılmaz; provider'a yalnız gerekli egress target bilgisi geçirilir.

## 4. Health ve hata sözleşmesi

| Sonuç | Sınıf | Retry |
|---|---|---:|
| Provider health unavailable | `PROVIDER_HEALTH_UNAVAILABLE` | Bütçeli |
| Capability mismatch | `PROXY_CAPABILITY_MISMATCH` | Hayır |
| Credential reference invalid | `PROVIDER_CREDENTIAL_INVALID` | Hayır |
| Acquire timeout | `PROXY_ACQUIRE_TIMEOUT` | Bütçeli |
| No eligible proxy | `NO_ELIGIBLE_PROXY` | Hayır |
| Lease expired | `PROXY_LEASE_EXPIRED` | Hayır/yeniden planlama |
| Provider policy refusal | `PROVIDER_POLICY_REFUSED` | Hayır |
| Provider transport failure | `PROVIDER_TRANSPORT_FAILED` | Bütçeli |

Provider error message'ları secret value, provider request URL, authorization header veya raw response body içeremez. Provider failure platformu anti-bot bypass için sınırsız rotation'a sokmaz.

## 5. Security ve ownership

Provider adapter credential çözümleme ve release sorumluluğuna sahiptir; platform lease, attempt association, expiry, quarantine, usage event ve audit metadata'sının sahibidir. Tenant scope'u provider catalog, lease request/result ve cost event'te zorunludur.

Proxy kullanımı target egress policy'yi kaldırmaz. Proxy ile erişilen host, port, redirect ve resource policy yine platform tarafından uygulanmalıdır. Sticky key raw session value değil, tenant/job/target policy'den türetilmiş non-reversible identifier olmalıdır.

## 6. Test baseline'ı

Bu task için zorunlu contract testleri provider adapter'ın capability response, acquire/release, health, timeout, credential invalid, capability mismatch, provider failure ve secret redaction davranışını kapsamalıdır. İlk implementation package yalnız interface/types ve deterministic fake provider ile başlayacaktır; gerçek Bright Data/Oxylabs/Zyte onboarding bu task'ın kapsamında değildir.

## 7. Açık kararlar

| Konu | P04-B01 kararı | İleri task |
|---|---|---|
| Provider model | Provider-neutral adapter | P04-B02 |
| Credential | Opaque reference + resolver boundary | P04-B02 |
| Capability | Protocol/class/geo/sticky/rotation/metering | P04-B03 |
| Lease | Attempt-scoped provider lease | P04-B04 |
| Health | Safe provider health result | P04-B05 |
| Selection | Deterministic scoring/filtering | P04-B06 |
| Cost | Request/bytes/lease meter flags | P04-B07 |
| Concrete providers | Deferred; no vendor coupling | P04-B08/P16 |

## 8. Review kararı talebi

P04-B01 ProxyProvider ortak interface ve capability modeli review'a sunulmuştur. Onay sonrasında P04-B02 provider credential ve adapter lifecycle implementation paketi hazırlanacaktır. Gerçek provider secret, vendor adapter ve network lease bu review'ın dışında tutulur.

## References

[1]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[2]: ../phase-3-m3-browser-engine-gate.md "Phase 3 M3 Browser Engine gate"
[3]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[4]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[5]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
