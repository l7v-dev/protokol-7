# P04-B03 — Proxy Catalog ve Geo/Class Policy Review

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Task:** P04-B03  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P04-B02 — kullanıcı onaylı

## 1. Teslim özeti

Proxy catalog ve eligibility policy katmanı eklendi. `ProxyCatalog`, provider/proxy endpoint metadata'sını credential içermeyen bir catalog entry olarak tutar; `ProxyRequirement` ise tenant/target access plan'ından gelen protocol, proxy class, country/region, sticky ve rotation gereksinimlerini taşır. `listEligible` ve `select` sonuçları status, capability ve policy kesişimine göre deterministic biçimde üretilir.

Catalog entry içinde endpoint host yalnız hostname, port ayrı numeric alan ve lease/cost için safe metadata olarak tutulur. Kullanıcı adı, parola, token veya URL içinde `@`/gömülü credential kabul edilmez. Catalog state caller'a clone edilerek mutable internal state'in dışarıdan değiştirilmesi önlenir.

> **Temel kural:** Catalog seçim yapabilir; ancak target egress policy, lease lifecycle ve provider credential boundary'sini bypass edemez.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/proxy/catalog.ts` | Catalog entry, requirement, eligibility filter, deterministic selection ve status change |
| `test/proxy/catalog.test.ts` | Protocol/class/geo/sticky/rotation/status, deterministic ordering, invalid endpoint ve state clone testleri |
| `docs/phase-4-proxy-intelligence-task-board.md` | Phase 4 task durumu ve kanıt kaydı |

## 3. Catalog ve requirement sözleşmesi

| Alan | Kural |
|---|---|
| Provider identity | `providerId` ve version safe metadata olarak tutulur |
| Endpoint | Host credential içermez; port 1–65535 numeric olmalıdır |
| Protocol | Entry capability ve target requirement ile eşleşir |
| Proxy class | Datacenter/residential/mobile/ISP kesişiminden seçilir |
| Country/region | Requirement listesi varsa entry metadata eşleşmelidir |
| Sticky | `supportsStickySession` true değilse requirement karşılanmaz |
| Rotation | `supportsRotation` true değilse requirement karşılanmaz |
| Status | Yalnız `AVAILABLE` entries eligible'dır |
| Ordering | `proxyId` ile deterministic sıralama |
| Mutation | Returned entry/capability clone edilir |

Eligibility için entry protocol'ü requirement protocol ile, entry class'ı allowed class listesiyle ve capability listeleriyle eşleşmelidir. Country veya region gereksinimi verilmişse entry'de aynı değer bulunmalıdır. Sticky veya rotation zorunluysa provider capability bunu desteklemelidir.

## 4. Status ve quarantine sınırı

Catalog status'ları `AVAILABLE`, `IN_USE`, `QUARANTINED` ve `DISABLED` olarak ayrılır. Bu pakette status change yalnız catalog state'ini değiştirir; lease expiry, provider quarantine API, health score veya persistence audit bağlantısı P04-B04/P04-B05 kapsamındadır. `QUARANTINED` ve `DISABLED` entry'ler yeni selection'da kullanılmaz.

Eligible entry bulunamadığında `NO_ELIGIBLE_PROXY` terminal ve non-retryable catalog error üretilir. Bu sonuç provider failure ile karıştırılmaz; üst reliability katmanı yalnız provider transport/acquire gibi gerçekten retryable sınıfları bütçeli biçimde ele almalıdır.

## 5. Tenant ve security sınırı

`ProxyRequirement` tenant/target scope'u taşır; catalog entry global provider metadata'sı olsa bile selection caller'ın target policy'siyle yapılır. Gerçek persistence ve multi-tenant catalog partition sonraki storage integration kapsamındadır. Catalog hiçbir raw credential veya session material saklamaz.

Proxy selection sonucu target HTTP/Browser egress policy'sini devre dışı bırakmaz. Proxy üzerinden yapılacak navigation, redirect ve resource request'leri aynı host/port/private-IP policy'den geçmelidir. Geo country/region seçimi yalnız provider capability ve target policy'nin kesişiminde geçerlidir.

## 6. Test kanıtı

Bu pakette **4 yeni catalog testi** eklendi. Testler deterministic selection, clone/mutation koruması, protocol/class/geo/sticky/rotation/status filtreleri, no eligible proxy, embedded credential/invalid port rejection ve missing entry status error davranışını doğrular.

Tam backend regression çalışmasında **30 test dosyası / 138 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler in-memory catalog kullanır; provider persistence, distributed catalog lock, lease reservation ve gerçek provider discovery sonraki task'lardır.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Credential lifecycle | P04-B02 opaque resolver baseline | Provider integration hardening |
| Lease reservation | Catalog status baseline | P04-B04 |
| Sticky session binding | Capability filter | P04-B04 |
| Rotation/quarantine | Status API baseline | P04-B04 |
| Provider health | Henüz yok | P04-B05 |
| Scoring/selection cost | Lexicographic deterministic selection | P04-B06 |
| Persistence/audit | In-memory baseline | P04-B04/P04-B08 |

## 8. Review kararı talebi

P04-B03 proxy catalog, geo/class requirement ve policy implementation paketi review'a sunulmuştur. Onay sonrasında P04-B04 lease, sticky session, rotation, expiry ve quarantine lifecycle implementasyonu hazırlanacaktır. Gerçek provider endpoint veya credential bu review paketine alınmayacaktır.

## References

[1]: ./phase-4-proxy-intelligence-p04-b02-review.md "P04-B02 provider credential lifecycle"
[2]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[3]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[4]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[5]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
