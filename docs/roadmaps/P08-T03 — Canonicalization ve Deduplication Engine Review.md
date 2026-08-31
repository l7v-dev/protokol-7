# P08-T03 — Canonicalization ve Deduplication Engine Review

**Program:** Scraping Platform  
**Phase:** 8 — Crawler Engine  
**Task:** P08-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, deterministic URL identity ve process-local semantic dedupe  
**Bağımlılık:** P08-T02 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P08-T03, crawler URL’leri için conservative canonical identity üretir ve P08-T01 frontier enqueue yolunu bu identity ile semantic deduplication’a bağlar. Canonicalizer HTTP(S)/egress güvenlik kontrolünü uygular, protocol/hostname değerlerini lowercase yapar, default port’u kaldırır, fragment’i siler ve query parameter’larını key/value sıralamasıyla deterministic biçimde yazar. Eşdeğer canonical URL’ler aynı tenant/job frontier entry altında birleşir.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| URL identity contract | `src/crawler/url-identity.ts` | Canonical URL ve SHA-256 fingerprint |
| Query policy | `src/crawler/url-identity.ts` | Yalnız explicit configured key ignore; diğer query semantics korunur |
| Frontier integration | `src/crawler/frontier.ts` | Canonical URL üzerinden idempotent entry/partition/entryId |
| Unit acceptance | `test/crawler/url-identity.test.ts` | Standard equivalence, explicit query ignore, unsafe target reject |
| Integration acceptance | `test/crawler/frontier.test.ts` | Host case/default-port/fragment semantic duplicate collapse |

## 2. Canonicalization policy

Canonicalizer yalnız web-standard, düşük-riskli equivalence dönüşümlerini uygular. Path üzerine ürün-spesifik varsayım yapılmaz; query parameter silme yalnız explicit `ignoredQueryParamNames` listesi ile mümkündür. Böylece crawler sırf canonicalization amacıyla hedefin uygulama semantics’ini bozmaz.

| Dönüşüm | Davranış |
|---|---|
| HTTP(S) protocol | Lowercase normalize edilir |
| Hostname | Lowercase normalize edilir |
| Default port | `http:80` ve `https:443` kaldırılır |
| Fragment | URL identity’den çıkarılır |
| Query parameter order | Key, sonra value ile sort edilir |
| UTM vb. key | Sadece explicit ignore configuration varsa çıkarılır |
| Path / non-default port / non-ignored query | Korunur |

> **Conservative semantics:** `https://example.com/catalog?b=2&a=1#details` ve `https://EXAMPLE.com:443/catalog?a=1&b=2` aynı identity olur. Buna karşılık `utm_source` ancak policy explicit olarak izin verirse çıkarılır; aksi halde URL semantics’inin parçası olarak kalır.

## 3. Deduplication ve güvenlik sınırı

P08-T01 frontier artık raw input yerine canonical URL saklar; aynı tenant/job scope içinde canonical URL ile existing entry aranır. Entry ID ve partition hash’i canonical URL’den türetilir. Tenant/job isolation korunur. Canonicalizer URL fetch, DNS request, robots request, queue publish veya storage write yapmaz.

| Kontrol | Davranış |
|---|---|
| Unsafe target | Private/loopback/link-local, credential-bearing veya non-HTTP(S) target reject |
| Ignore key input | En fazla 50; safe key character/length bound |
| Canonical identity | SHA-256 fingerprint, safe deterministic evidence |
| Frontier dedupe | Aynı tenant/job canonical URL için idempotent existing entry dönüşü |
| Source lineage | P08-T02 parent task/attempt link metadata korunur; burada queue integration yok |

## 4. Acceptance kanıtı

Dar kapsam suite’i iki test dosyasında altı testle standart URL equivalence, conservative explicit query ignore, unsafe URL/configuration reject ve frontier semantic duplicate collapse behavior’ını doğrular. Dar kapsam sonucu `2 test files / 6 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **56 test dosyası / 247 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| robots.txt / allowlist / denylist / domain restriction | P08-T04 sorumluluğu |
| Configured depth, page limit ve pagination | P08-T05 sorumluluğu |
| Product-specific canonical rules | Explicit target policy olmadan uygulanmaz |
| Durable dedupe index / concurrency transaction | Postgres/persistence hardening sorumluluğu |
| Discovery → canonical → enqueue execution wiring | Queue/worker crawler integration sorumluluğu |
| Sitemap / priority queue | P08-T06 sorumluluğu |
| Checkpoint, pause/resume, recovery | P08-T07 sorumluluğu |

## 6. Review kararı talebi

P08-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P08-T04 — Robots/Policy, Allowlist/Denylist & Domain Restriction olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ./phase-8-crawler-engine-p08-t01-review.md "P08-T01 frontier contract"
[3]: ./phase-8-crawler-engine-p08-t02-review.md "P08-T02 discovery contract"
[4]: ../src/security/egress-policy.ts "Outbound egress guard"
[5]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
