# Canli Bellek, Ledger ve Sistem Haritasi Mimarisi Plani

Bu plan, `protokol-7` projesinde calisan yapay zeka ajanlarinin ve gelistiricilerin token maliyetini minimize eden, calisan bellek kirliligini onleyen ve sistem durumuna cerrahi hizla erisim saglayan canli mimari donusumunu tanimlar.

## Hedefler
1. `archive/` dizinini `ledger/` (Kayit Kutugu / Denetim Defteri) olarak yeniden yapilandirmak.
2. `TASKS.md` calisan bellegini hiper-yalin (< 30 satir) hale getirmek ve gecmis 11 isi `ledger/`'a konsolide etmek.
3. `context/` altindaki atil ve eski dosyalari (`context/progress-tracker.md`) temizleyip operasyonel can damarlarini (DB, API, Depolama, Aktorler, Ortam Degiskenleri) ozetleyen `context/system-manifest.md` uretmek.
4. Anlik sistem durumunu 20 milisaniyede 25 satir ASCII olarak ekrana basan `npm run pulse` CLI aracini uygulamak.
5. `skills/` ve `.agents/skills/` ciftligini gidermek, ilgisiz egitim/yazarlik becerilerini temizlemek.
6. Dogrulama testlerini (`npm run verify`, `npm run doctor`, `npm test`) calistirip butunlugu muhurlemek.

## Adimlar
- [ ] Adim 1: `archive/` -> `ledger/` dizin donusumu ve bagli betiklerin (`consolidate-memory.mjs`, `omega-memory.mjs`, `doctor.mjs`, `verify-pipeline.mjs`) guncellenmesi.
- [ ] Adim 2: `TASKS.md` calisan belleginin konsolidasyonu ve `ledger/index.jsonl` senkronizasyonu.
- [ ] Adim 3: `context/progress-tracker.md` dosyasinin kaldirilmasi ve `context/system-manifest.md` uretimi.
- [ ] Adim 4: `scripts/pulse.mjs` betiginin yazilmasi ve `package.json`'a `npm run pulse` eklenmesi.
- [ ] Adim 5: `.agents/skills` icindeki ilgisiz becerilerin ayiklanmasi ve `skills/` kopyasinin symlink'e donusturulmesi.
- [ ] Adim 6: 6 asamali dogrulama hatti ve testlerin calistirilmasi.
