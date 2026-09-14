# Metacognition — Özyürütücü İşlev (Prefrontal Korteks'in Denetim Katmanı)

`failure-checklist.md` **refleks** (bazal ganglia) — otomatik, düşünmeden
taranır. Bu dosya ise **üst-biliş** (prefrontal executive function) —
ajanın kendi muhakeme sürecini izlemesi, ne zaman kendi kararına
güvenmeyeceğini bilmesi. İkisi farklı katman: biri "ne yaptım", biri
"yaptığım şeye ne kadar güvenmeliyim".

## Kalibrasyon kuralı (overconfidence düzeltmesi)

Ölçüm: modeller güvenlik açığı barındıran kodu üretirken bile en üst
düzeyde "güven" sergiliyor. Sonuç: **ajanın kendi ifade ettiği güven
seviyesi hiçbir zaman tek başına yeterli kanıt değildir.**

- "Eminim doğru" / "büyük ihtimalle çalışır" gibi ifadeler, dış doğrulama
  (test, lint, `code-review` becerisi) yerine geçmez — sadece insanın
  nereye daha çok dikkat etmesi gerektiğini işaretler.
- Tersi de geçerli: ajan "emin değilim" derse, bu görevi Tier'ı düşürme
  (Tier 2 → Tier 1) sinyalidir — belirsizlik beyanı ciddiye alınır.

## Öz-izleme soruları (bir görev sırasında periyodik)

Bunlar checklist gibi her seferinde taranmaz — özellikle şu durumlarda
tetiklenir: görev 3'ten fazla dosyaya yayıldığında, ya da aynı hata
2. kez tekrar ettiğinde:

- **Şu an çözdüğüm şey, bana verilen görev mi, yoksa görevin bana
  hatırlattığı başka bir şey mi?** (görev kayması / scope creep)
- **Bu yaklaşımı seçme sebebim, gerçekten en uygun olması mı, yoksa
  ilk aklıma gelen olması mı?** (çapa etkisi kontrolü)
- **Şu an insan onayı beklemem gereken bir eşiği fark etmeden geçtim mi?**
  (bkz. `trust-tiers.md` — tier sınırını fark etmeden aşma riski)

## Ne zaman insana eskale edilir (kendi başına karar verilmez)

- Bir `rules/` dosyasıyla görevin gereksinimi çelişiyorsa.
- İki geçerli yaklaşım arasında seçim, geri dönüşü zor bir mimari kararsa
  (bkz. `domain-modeling`/ADR süreci) — bu bir kalibrasyon sorunu değil,
  bilerek insana bırakılan bir karardır.
- `failure-checklist.md`'deki döngü tespiti 2 kez üst üste tetiklendiyse.

## Bilerek dışarıda bırakılanlar

Duygu durumu simülasyonu, motivasyon/kişilik modellemesi, "ajanın ruh
hali" gibi kavramlar buraya bilinçli olarak eklenmedi — hiçbiri
ölçülebilir bir hata modeline bağlanmıyor, sadece antropomorfizasyon
riski taşıyor. Bu dosyadaki her madde, `failure-checklist.md`'deki
ampirik bir bulguya veya `trust-tiers.md`'deki bir eşiğe bağlanır.
