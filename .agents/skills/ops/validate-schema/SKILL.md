---
name: validate-schema
version: "1.0.0"
category: ops
description: Blueprint v1 sözleşmeleri veya ops girdi/çıktıları için JSON Schema doğrulaması yap.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# validate-schema

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. Şemayı contracts/schemas/ veya ilgili skill schemas/ dizininden seç. Draft 2020-12 destekleyen gerçek doğrulayıcı kullan; yalnız required alanlarını saymak yeterli değildir.
2. Meta-schema ve tüm yerel $ref bağlantılarını doğrula. URI/date-time formatlarını FormatChecker gibi format doğrulaması açık bir seçenekle kontrol et.
3. Tüm girdiyi nested alanlar, enumlar ve additionalProperties kısıtlarıyla değerlendir; error raporuna içerik veya kişisel veri kopyalama.
4. Doğrulayıcı yoksa `blocked` döndür. Şema doğrulaması hash doğruluğu, kaynak hakları veya release enforcement kanıtı değildir.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
