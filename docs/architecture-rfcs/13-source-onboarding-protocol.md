# 13 — AI/LLM yeni kaynak ekleme protokolü
Bu belge repository becerisinin ayrıntılı spesifikasyonudur. ChatGPT'ye kişisel skill kurulmadı. Repo alındığında AGENTS.md ve mevcut data-ingestion-protocol önce okunur; ekip bu protokolü .agents/skills/source-onboarding altında uygular.

## Zorunlu sıra
1. Purpose, source/account/resource scope, veri türü, freshness ve request/bytes/runtime/cost budget tanımla. Belirsiz kapsam için bounded plan çıkar; tahminle geniş crawl başlatma.
2. Resmi güncel API/bulk/export dokümanı, auth/quota/rights evidence incele. Erişim izni, training izni ve redistribution ayrı. Private endpoint/challenge bypass tasarlama.
3. Mevcut source/transport/parser/storage capabilities kontrol et. Yeni source için ortak downloader'a source-name branch ekleme.
4. source descriptor JSON Schema + field mapping hazırla. Upstream ID, parent/version, pagination, watermark, source delete, schema drift, MIME, retention, rights ayrı.
5. Unit fixtures ve sample-based schema test yap; sentetik fixture'ı gerçek data diye etiketleme.
6. Yetkili bounded pilot: raw immutable, cursor yalnızca durable commit sonrası, count reconciliation, duplicates/rejects kaydı.
7. DNS/HTTP/rate/auth/worker crash/lease/cursor replay/cancel/credential revoke testleri. Secret/signed URL log kontrolü.
8. Kalite, lineage, PII/purpose rights, retention ve release gate'i değerlendir. Pending/unknown haklar training release'e geçmez.
9. Adapter version, evidence, ölçülmüş pilot sonucu, owner/runbook, monitoring kaydıyla operational status ver. Eksik testleri açıkça bırak.

## Agent teslimi
Descriptor; mapping; adapter diff; fixture/tests; bounded pilot report; evidence URLs+date+verification level; schema compatibility; error mapping; rollout/rollback; permissions; retention; source completeness report. Code commit gerçek repo'da kaydedilir, olmayan commit/hash uydurulmaz. Validator geçmesi network adapter'ın çalıştığını kanıtlamaz.

## Facebook gibi kaynaklar
Bu pakette Facebook working connector yok. Data scope (yetkili Page, kullanıcı export'u vb.) önce belirlenir. Güncel resmi ürün/account permissions incelemeden API alanı veya availability garantisi verilmez. Shared core record identity+version kullan; platform-specific fields typed extension/mapping'de tutulur. Engagement sayıları varsa observed_at ile observation tablosuna; upstream delete/update/tombstone ayrıca. Hesap/person/media verisinde veri minimizasyonu ve purpose rights gate'i. Kaynak dosya erişimi training izni sayılmaz.

## Record alan sözleşmesi
source_id + external_id + record_type logical kimlik; record_version internal immutable ID; upstream_version nullable; observed_at required; source_created_at/source_modified_at nullable+unknown reason; canonical_url redacted/secret-free; parent relationship separate; deletion tombstone; raw artifact reference; normalized payload schema version; parser/adapter/pipeline version; rights and quality references. Content hash bibliyografik/platform kimliği değildir.
