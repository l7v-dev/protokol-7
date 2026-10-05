---
name: deduplicate-corpus
version: "1.0.0"
category: ops
description: Exact veya yakın kopya korpus kayıtlarını ayırırken kaynak oluşumlarını koru.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# deduplicate-corpus

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. `src/pipeline/processors/dedup-filter.ts` içindeki DedupFilter arayüzünü oku. Mevcut yakın kopya algoritması SimHash'tir; MinHash servisi varsayma.
2. Exact karşılaştırmayı aynı canonicalization_version ile hesaplanmış içerik SHA-256 üzerinden yap. Yakın eşleşme canonical document_id birleştirmek için yeterli değildir.
3. Kaynak kimliği, source_record_id, URI, acquired_at ve raw_artifact_id alanlarını her occurrence için ayrı koru.
4. Bellek içi hash kümesinin kapsamını raporla. Veri ölçeği bu kapsamı aşıyorsa kalıcı indeks sağlanmadan küresel tekilleştirme tamamlandı deme.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
