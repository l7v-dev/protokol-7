---
name: normalize-document
version: "1.0.0"
category: ops
description: Metni canonicalization sürümüyle normalize edip içerik kimliği üret.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# normalize-document

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. `src/pipeline/processors/text-normalizer.ts` arayüzünü oku. Mevcut varsayılan NFKC politikasıdır; nfc-lf-strip-v1 olarak etiketleme. İstenen politika ile uygulama eşleşmiyorsa `blocked` döndür.
2. Normalizasyon yapılandırmasını sabitle. Aynı politika altında normalize edilmiş UTF-8 metnin SHA-256 değeri document_id olur; ham bayt SHA-256 ayrı korunur.
3. Canonicalization sürümünü her kayıtla taşı. Politika değişince kimlikler değişebilir; eski kimliği ve raw_artifact_id bağlantısını koru.
4. Boş veya metin alanı bulunmayan kaydı başarılı belge sayma. Yeni türev yaz, ham kaynağı değiştirme.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
