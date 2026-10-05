---
name: publish-dataset
version: "1.0.0"
category: ops
description: Dataset sürümünü beş release kapısının kanıtıyla yayımlama prosedürünü uygula.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# publish-dataset

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. `src/dataset/dataset-publisher.ts` ve `src/dataset/types.ts` arayüzlerini oku. Mevcut publishSnapshot tek başına beş kapıyı enforce etmez; Faz 3 enforcement uygulanmamışsa `blocked` döndür.
2. Aynı snapshot için schema, quality, privacy, contamination ve rights kanıtlarının güncel olduğunu doğrula. Unknown veya eksik kanıt geçer sayılmaz.
3. Hashleri, manifest ve shard kayıtlarını karşılaştır. Atomik release geçişi desteklenen platform API'siyle yapılır; doğrudan SQL ile kapıları atlama.
4. Sonucu platformdan tekrar oku; yalnız doğrulanmış released durumunu başarı olarak bildir. Artifact yükleme, gate değerlendirmesi ve release durumunu ayrı tut.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
