# Ledger — Kayit Kutugu ve Denetim Defteri

Bu klasor, `protokol-7` projesinde tamamlanan gorevlerin, mimari asamalarin ve telemetri kayitlarinin **append-only (yalnizca ekleme yapilabilen), degistirilemez ve sikistirilmis** kayit defteridir.

Bu klasordeki hicbir dosya **ajan tarafindan varsayilan olarak dogrudan preload edilmez.** Yalnizca `npm run memory "<kavram>"` calistirildiginda veya `ledger/index.jsonl` uzerinden cerrahi arama yapildiginda erisilir.

## Dizin Yapisi

```text
ledger/
  index.jsonl              <- Tek gercek fihrist (BM25 semantik arama burayi tarar)
  sessions/
    *.md.gz                <- Gzip ile sikistirilmis tamamlanan gorev bloklari
  telemetry.jsonl          <- 9 katmanli span ve islem telemetrisi
  checkpoints/             <- Sistem guvenlik kontrol noktalari
```

## index.jsonl Formati

Her satir bagimsiz, deterministik bir JSON nesnesidir:

```json
{"tarih": "2026-09-28", "faz": "Ledger-Muhur", "konu": "13 gorev konsolide edildi: Yerel Wikipedia Veri Cekme...", "dosya": "sessions/2026-09-28--session-1790590415505.md.gz", "tier_max": 2}
```

## Ne Zaman Buraya Muhurlenir?

`TASKS.md` dosyasindaki tamamlanmis gorevler biriktiginde `npm run consolidate` calistirilarak en son 3 referans gorev disindakiler buraya gzip ile paketlenir ve `ledger/index.jsonl`'e tek satirlik ozet eklenir. `TASKS.md` calisan bellegi her zaman < 30 satir tutulur.
