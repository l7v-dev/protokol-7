---
name: profile-dataset
version: "1.0.0"
category: ops
description: Dataset shardlarının kayıt, boyut, dil ve kalite dağılımını ölç.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# profile-dataset

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. `src/dataset/types.ts` ve dataset_shards kayıtlarını oku; immutable shard manifestini ölçüm kapsamı olarak sabitle.
2. Parquet metadatası ve gerektiğinde bounded record batchleriyle kayıt sayısı, null oranları ve dil dağılımını hesapla; tüm dosyaları belleğe yükleme.
3. Katalog ile fiziksel dosya sayımlarını karşılaştır. Kalite alanları yoksa ilgili metriği eksik olarak bildir; boş değeri sıfır olarak yorumlama.
4. Token sayılarını tahmin veya ölçüm olarak etiketle. Örnekleme varsa örnek boyutu ve kapsamı statistics artifact'ında kaydet.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
