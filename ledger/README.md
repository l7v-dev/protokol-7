# Archive — Sıkıştırılmış Uzun Süreli Depo

Bu klasördeki hiçbir dosya **agent tarafından varsayılan olarak
okunmaz.** Sadece `index.jsonl`'daki bir kayda bakılarak, gerçekten
gerekliyse tek tek açılır. Amaç: context'e hiçbir zaman girmeyen ama
kaybolmayan bir hafıza katmanı.

## Yapı

```
archive/
  index.jsonl              <- tek gerçek giriş noktası, her zaman küçük
  sessions/
    2026-09-10--faz2.md.gz <- ham oturum transkripti, gzip
    2026-09-14--faz3.md.gz
```

## index.jsonl formatı

Her satır bağımsız bir JSON — tabular/Parquet değil, çünkü bu veri
serbest metin özet taşıyor ve satır sayısı bu ölçekte küçük kalacak
(yüzlerce satır, milyonlarca değil). Ölçek gerçekten patlarsa (binlerce
oturum) bu dosya Parquet'e taşınabilir — ama şu an için JSONL'i
Parquet'e çevirmek, boyutu 50 KB'den 30 KB'a indirip okumayı
zorlaştırmakla eş değer bir kazanım olurdu. Yani şimdilik gerekli değil.

```json
{"tarih": "2026-09-10", "faz": "Faz 2", "konu": "Skills, context, docs altyapısı kuruldu", "dosya": "sessions/2026-09-10--faz2.md.gz", "tier_max": 2}
{"tarih": "2026-09-14", "faz": "Faz 3", "konu": "Beyin ilhamlı mimari: TASKS, trust-tiers, failure-checklist eklendi", "dosya": "sessions/2026-09-14--faz3.md.gz", "tier_max": 1}
```

## Ne zaman buraya taşınır

`TASKS.md`'deki "Son tamamlananlar" 5 kaydı geçtiğinde: en eski
kayıtlar `progress-tracker.md`'ye özet olarak, ham oturum transkripti
varsa (kullanıcı ile geçen konuşmanın tamamı) `archive/sessions/`'a
gzip'lenerek taşınır ve `index.jsonl`'a tek satır eklenir.

## Ne zaman geri açılır

Neredeyse hiçbir zaman. Gerçek kullanım durumu: bir kararın "neden"
öyle alındığını `docs/adr/` yeterince açıklamıyorsa, o dönemin ham
konuşmasına bakmak gerekebilir. Bu, ayda birkaç kez olması beklenen,
insan tetikli bir eylemdir — ajan kendiliğinden buraya dalmaz.
