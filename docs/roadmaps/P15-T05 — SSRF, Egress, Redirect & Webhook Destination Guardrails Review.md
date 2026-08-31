# P15-T05 — SSRF, Egress, Redirect & Webhook Destination Guardrails Review

**Program:** Scraping Platform  
**Milestone / Phase:** M15 / Phase 15 — Security  
**Task:** P15-T05  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, secret-safe, bounded, fail-closed ve non-dispatching network destination guardrail contract

## 1. Amaç ve kabul sınırı

P15-T05, SSRF, egress, redirect ve webhook destination kontrollerini `network-guardrails/v1` contract'ı üzerinden harden eder. Authoritative task register, private/metadata target'ların ve unsafe webhook redirect'lerinin engellenmesini kabul kriteri olarak belirtir.[1]

`src/security/network-guardrails.ts`, mevcut private/loopback/link-local egress policy'sini kapalı allowlist, direct-IP yasağı, secret-bearing query yasağı, webhook HTTPS-only, default-port ve bounded redirect-chain kuralları ile sarar. Contract destination'a network request göndermez; yalnız safe outcome/fingerprint döndürür.

| Guardrail | Kural | Fail-closed sonucu |
|---|---|---|
| Host allowlist | 1–100 safe public hostname zorunlu | Empty/unsafe/not-allowed host reddedilir |
| Private/metadata/loopback | Mevcut egress policy ile bloklu | Destination reddedilir |
| Direct IP | IPv4/IPv6 destination kabul edilmez | Destination reddedilir |
| URL credentials | Mevcut egress policy ile bloklu | Destination reddedilir |
| Secret-bearing query | `token`, `cookie`, `authorization`, `secret`, `api_key` vb. reddedilir | Destination reddedilir |
| Webhook transport | Yalnız `https:` | HTTP webhook reddedilir |
| Port | Protocol default (HTTP 80/HTTPS 443) | Custom port reddedilir |
| Redirect | Maksimum 5 destination; her hop tekrar validasyon | Chain/hop reddedilir |

## 2. Safe output ve side-effect sınırı

Başarılı outcome, raw URL/host/path/query yerine yalnız protocol, default port, redirect depth ve authority tabanlı SHA-256 destination fingerprint'i döndürür. `allowNetworkDispatch: false` ve `allowBypass: false` sabittir.

| Output alanı | Güvenlik amacı |
|---|---|
| `destinationFingerprintSha256` | Raw destination saklamadan deterministik ilişki |
| `destinationKind` | `FETCH` veya `WEBHOOK` bağlamı |
| `protocol` / `port` / `redirectDepth` | Bounded validation evidence |
| `allowNetworkDispatch: false` | Contract HTTP/webhook gönderimi yapmaz |
| `allowBypass: false` | Policy/anti-bot/CAPTCHA/WAF bypass yetkisi vermez |

> P15-T05 network destination policy decision contract'ıdır. DNS resolution/rebinding defense, gerçek socket/connect, redirect takip, webhook dispatch, retry, proxy selection veya egress firewall değişikliği yapmaz.

## 3. Doğrulama kanıtı

Dar kapsam test paketi allowlisted public fetch outcome'unu, webhook HTTPS kuralını, direct IP, secret query, custom port, unsafe/empty allowlist ve redirect chain limit redlerini kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/security/network-guardrails.test.ts` | Başarılı — 1 dosya / 3 test | Safe fingerprint/no-dispatch; destination/redirect fail-closed kontrolleri |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 102 dosya / 385 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Real DNS lookup/rebinding defense, socket/connect, HTTP fetch, webhook delivery, redirect follow veya firewall/proxy/egress network enforcement.
2. DNS/IP allowlist resolution, certificate validation, real TLS handshake, WAF/CAPTCHA/anti-bot interaction veya bypass/stealth/fingerprint evasion.
3. Webhook payload serialization, signature verification, delivery retry/DLQ, destination registration/persistence veya external destination integration.
4. Private endpoint scanning, port probing, credential discovery, policy override, automatic bypass retry veya active exploitation.
5. Dashboard/frontend/UI ve abandoned `/home/ubuntu/scraping-platform-operations-site` projesi.

## 5. Review kararı

P15-T05 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız non-dispatching network destination guardrail contract ve sandbox regression/build doğrulamasını kanıtlar; real DNS/rebinding defense, socket/connect/fetch/webhook delivery, egress firewall enforcement veya production SSRF assurance iddiası değildir. Sıradaki bounded paket P15-T06 — Worker/Browser Isolation Hardening olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 15 Security — P15-T05 kabul kriteri"
