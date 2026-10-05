---
name: score-quality
version: "1.0.0"
category: ops
description: Korpus kalitesini ölçerken kayıt bazında FineWeb/Gopher metrikleri ve eşikleri raporla.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# score-quality

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. `src/pipeline/processors/quality-filter.ts` içindeki QualityFilter ve QualityGateConfig arayüzlerini oku; kullanılan eşikleri yapılandırmadan al.
2. Her kayıt için metrik, passed ve reasons alanlarını türev çıktıya ekle; ham içeriği değiştirme.
3. Boş veya okunamayan kayıtları başarılı sayma. Toplam kayıt sayısını geçen ve reddedilen kayıtlarla uzlaştır.
4. Kalite kararını PII, lisans veya contamination kararından ayrı raporla; quality_gate yalnız bu ölçümün kanıtını taşır.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
