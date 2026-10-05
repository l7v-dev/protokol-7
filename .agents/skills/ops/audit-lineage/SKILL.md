---
name: audit-lineage
version: "1.0.0"
category: ops
description: Bir run veya dataset sürümünün kaynak ve artifact zincirini denetle.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# audit-lineage

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. Registry'yi salt okunur aç. Faz 2 tabloları pipeline_run_manifests, document_provenance ve document_occurrences yoksa `blocked` döndür.
2. Run, parent_run_id ve storage_replicas bağlantılarını takip et; döngü, eksik run ve eksik ham artifact kimliklerini listele.
3. Katalog hashlerini erişilebilir artifact baytlarının SHA-256 değeriyle karşılaştır; erişilemeyen dosyayı doğrulanmış sayma.
4. Bir belge birden fazla kaynaktan geliyorsa tüm occurrence kayıtlarını incele. Eksik linkleri raporla; denetim sırasında katalog onarma.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
