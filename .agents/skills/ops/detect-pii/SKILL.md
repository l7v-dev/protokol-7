---
name: detect-pii
version: "1.0.0"
category: ops
description: Kayıtlarda kişisel veri taraması veya redaksiyon istendiğinde denetim kanıtı üret.
allowed-tools: [Read, Bash, Write]
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---

# detect-pii

Girdiyi [input schema](schemas/input.schema.json) ile, sonucu [output schema](schemas/output.schema.json) ile doğrula. İzinli araç listesi yeni yetki vermez; işlemler görev kapsamı ve kaynak izinleri içinde yürütülür. Yollar proje köküne göre çözülür.

## Prosedür

1. Politikanın kapsadığı kişisel veri sınıflarını ve dil kapsamını oku; tarayıcı uygulamasını tespit et. Repoda genel PII tarayıcısı henüz yoksa `blocked` döndür.
2. Taramayı kayıt bazında yürüt; loglara içerik veya eşleşen değer yazma. Bulgu raporuna kayıt kimliği ve sınıfı yaz.
3. Redaksiyonu yeni bir türevde yap; ham artifact değişmeden kalır. Redaksiyon metni değiştirdiğinde document_id yeniden hesaplanır, eski kimlikle bağlantı saklanır.
4. Yalnız taranmış kayıtları `clear` olarak işaretle. Politika kapsamı dışındaki kayıtları `unchecked` veya `quarantined` bırak.

## Tamamlanma

Yalnız doğrulanmış çıktılar için `success` döndür. Eksik uygulama veya erişim için `blocked`, yürütme hatası için `failed` kullan; `blockers` alanına somut koşulu yaz. Kanıt artifact URI'lerini `artifacts` alanına ekle.

[Platform policy](references/platform-policy.md) kod veya veri yazmadan önce okunur.
