# Ilham Analizi yeniden baslatma

Tier 2. Uretim kapali tutulur; eski PID dosyalari surec kaniti sayilmaz.

1. Merkez/control/source kataloglarini SQLite backup API ile kopyala; integrity/FK ve SHA-256 kaydet.
2. Parquet footer ve ham gzip/tar butunlugunu salt okunur denetle; kapanmamis ciktilari koru.
3. Aperta append-before-seal crash ve ayni klasor archive overwrite sorunlarini subprocess regresyonuyla duzelt.
4. Kullanici secimi: eski 11.173 archived Aperta dosyasini yeniden pending yap. Taze backup ve kopya provasi sonrasinda ayni file_id digest/count kontroluyle uygula; failed/pending kayitlar degismez. Ham arşiv silinmez; yeni parca numarasi mevcut dosyalari reserve eder.
5. Dedicated monitoring schema/state/retry/stats/backfill provasini yap; merkez/source kataloglarina 0005-0010 SQL dosyalarini korlemesine uygulama.
6. DergiPark unsealed output recovery ve Aperta metadata indexed debt'i kopyada dogrula. HF remote_verified kayitlari tekrar islenmez.
7. DOAJ eski source katalogunda OAI continuation checkpoint yoktur; eski logdaki kayit sayisi token yerine gecmez. Tam replay maliyeti veya yeni devam politikasi restart oncesi netlesir.
8. Kaynak/env/supervisor/pilot planinin kabulunden sonra restart; tamamlanmamis audit veya recovery varken otomatik start yok.

Kanıt deposu: `data/maintenance/restart-preflight-20261005T222633Z/`.

## Uygulanan durum

Kullanici DOAJ'i kapali tutmayi secti. Diger kataloglar full integrity/FK ile dogrulandi; DOAJ backup quick_check/SHA-256 gecti, full index audit ertelendi. Aperta/DergiPark kurtarmasi uygulandi, pilotlar gecti. Ek Aperta remote-index cakismasi duzeltildi ve uzak receiptler korundu. Aperta assets, DergiPark ve HF calisiyor; metadata pilotundan sonra yeni tam snapshot otomatik baslatilmadi. Kayit: docs/walkthroughs/ilham-analizi-yeniden-baslatma-walkthrough.md.
