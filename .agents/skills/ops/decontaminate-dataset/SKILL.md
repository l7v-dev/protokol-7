---
name: decontaminate-dataset
version: "1.0.0"
category: ops
description: Train verisindeki validation/test örtüşmesini ölç ve ayır.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# decontaminate-dataset

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. Validation/test manifestlerini ve canonicalization sürümlerini sabitle. Aynı kaydı tüm splitlerde karşılaştırabilecek hash alanı yoksa `blocked` döndür.
2. Exact içerik hashleriyle train/evaluation kesişimini ölç. Yakın kopya isteniyorsa algoritma ve eşiği ayrıca kaydet; exact taramayı near-duplicate garantisi olarak sunma.
3. Örtüşen train kayıtlarını yeni bir türevde quarantine et; evaluation ve ham artifactları koru. Occurrence bağlantılarını kaybetme.
4. Faz 4 decontaminate-filter uygulanmadan platform contamination_gate geçti deme. Kalan kesişimi tekrar ölç ve raporu immutable snapshot kimliğiyle bağla.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
