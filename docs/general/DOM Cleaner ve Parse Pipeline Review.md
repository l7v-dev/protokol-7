# P06-T04 — HTML/DOM Cleaner ve Parse Pipeline Review

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Task:** P06-T04  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P06-T03 — kullanıcı onaylı

## 1. Teslim özeti

P06-T04, HTTP response parsing ile extraction selector yürütmesi arasına bounded bir HTML/DOM clean pipeline ekler. `HtmlParsePipeline`, mevcut HTTP content-type parse contract'ını kullanır ve yalnız `text/html`/XHTML parse sonucunu `HtmlDomCleaner`a iletir. Cleaner, raw response body'yi geri döndürmek yerine yalnız doğrulanmış tenant/job/task/attempt scoped raw artifact reference'ını, temizlenmiş HTML/text'i ve checksum/removed-redacted sayacı üretir.

`HtmlDomCleaner`, executable, hidden ve yüksek riskli DOM bölümlerini selector ortamından kaldırır. Source process memory içinde transient kalır; cleaner storage okuma/yazma, network çağrısı, browser yürütmesi veya queue publish işlemi yapmaz.

> **Lineage kuralı:** Her cleaner output'u, aynı tenant/job/task/attempt storage prefix'iyle doğrulanmış bir raw artifact reference taşır. Raw artifact içeriği pipeline result'una kopyalanmaz.

## 2. Uygulanan pipeline

| Aşama | Sorumluluk | Çıktı |
|---|---|---|
| 1. Parse | Mevcut `parseHttpResponse` ile content type kontrolü | HTML string veya terminal rejection |
| 2. Scope validate | Tenant/job/task/attempt formatı | Güvenli extraction scope |
| 3. Artifact validate | Artifact type, checksum, size ve storage prefix | Immutable raw lineage reference |
| 4. DOM remove | Script, style, noscript, template, iframe, object, embed, hidden input vb. | Daha dar selector yüzeyi |
| 5. Attribute sanitize | Event handler, `srcdoc`, `javascript:` href | Executable attribute yok |
| 6. Sensitive element remove | Credential/cookie/token/password benzeri attribute'lar | Sensitive DOM hedefi yok |
| 7. Inline redact | Bearer/API key/password vb. inline value | `[REDACTED]` output |
| 8. Checksum/text | Cleaned HTML/text ve source/cleaned SHA-256 | Selector/diagnostic için safe input |

## 3. Bounded ve secret-safe davranış

| Kontrol | Varsayılan | Sonuç |
|---|---:|---|
| Raw HTML source limiti | 1 MB UTF-8 | `HTML_SOURCE_UNSUPPORTED` |
| Cleaned HTML limiti | 750 KB UTF-8 | `CLEANED_OUTPUT_TOO_LARGE` |
| Storage key scope | Tenant/job/task/attempt prefix | Scope dışı ref reddedilir |
| Artifact checksum | 64 hex SHA-256 | Geçersiz ref reddedilir |
| Raw response result output | Yok | İçerik tekrar dönmez |
| Executable node | Kaldırılır | Selector hedefi olmaz |
| Secret-like inline value | Maskelenir | `[REDACTED]` |

Cleaner output'unda sadece `rawArtifact` metadata ref'i, cleaned content, normalleştirilmiş text ve checksum'lar vardır. `rawHtml`, cookie, authorization, credential, target URL/query veya response header alanı yoktur. Storage key de secret-shaped bir segment taşıyorsa rejected edilir.

## 4. Test kanıtı

`test/extraction/html-cleaner.test.ts` üç fixture senaryosu içerir. İlk senaryo script/iframe/hidden input/sensitive token/event handler removal ile faydalı ürün içeriğinin korunmasını; ikinci senaryo tenant/attempt artifact lineage, cleaned/source limitlerini; üçüncü senaryo HTTP parse pipeline'ın yalnız HTML kabul etmesini ve raw response alanı döndürmemesini doğrular.

P06-T04 değişiklikleri sonrası tam backend regression sonucu **44 test dosyası / 205 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 5. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| CSS/XPath execution | P06-T02'de var, cleaner ile wiring yok | Extraction orchestration |
| JSONPath execution | P06-T03'te var | Extraction orchestration |
| Content-type charset normalize | Mevcut HTTP parser exact content-type contract'ı korunur | HTTP parser hardening |
| Transform chain | Basic text normalization ile sınırlı | P06-T05 |
| Field evidence/diagnostics | Yok | P06-T06 |
| Persistent artifact repository | Mevcut storage abstraction dışında yok | DB/storage integration |
| Raw artifact write | `HttpArtifactWriter` sorumluluğunda; cleaner write yapmaz | Mevcut Phase 2 wiring |
| AI extraction | Yok | P06-T07 |
| Live DB/Redis/storage E2E | Sandbox dependency yok | M6 open condition |

## 6. Review kararı talebi

P06-T04 HTML/DOM cleaner ve parse pipeline review'a sunulmuştur. Kullanıcı onayı sonrasında P06-T05 normalize transform kütüphanesi hazırlanacaktır. Bu paket mevcut artifact storage abstraction'ın canlı S3 üzerinde çalıştığını veya HTTP worker'ın cleaner'ı production queue zincirine bağladığını iddia etmez.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 task board"
[2]: ./phase-6-extraction-engine-p06-t02-review.md "P06-T02 CSS/XPath extraction"
[3]: ./phase-6-extraction-engine-p06-t03-review.md "P06-T03 JSONPath/API extraction"
[4]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T04 task register"
[5]: ./phase-5-reliability-engine-p05-t02-review.md "Compliance guardrail policy"
[6]: ./phase-4-proxy-intelligence-operations.md "Operations runbook"
