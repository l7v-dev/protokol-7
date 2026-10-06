# Aperta asset bellek kurtarma

2026-10-06: Eski asset unit OOM-kill ile durdu; 2 GiB MemoryMax ve swap=0. Eski run INGESTING kalmisti. DergiPark calisiyor, HF 565 dosyanin remote verification'ini bitirmis; DOAJ kullanici karariyla kapali.

## Kod ve kanit

`pdf_downloader.py` uretimde 1 MiB HTTP parcalariyla gecici disk dosyasina indirir. Challenge prefix, Content-Length ve maksimum asset boyutu denetlenir. Retry attempt staging dosyasini truncate eder. Yerel disk/bellek hatalari kaynak kaydini failed yapmadan run'i durdurur. Dosya tamamlaninca archive association commit edilir; TAR `append_path` ile dosya stream'ini okur. Append hatasi association'i pending'e geri alir. Maksimum shard sinirina gore rotasyon association commit'inden once yapilir. Eski bytes arayuzu 16 MiB ile sinirlidir.

384 MiB sentetik asset, ek 320 MiB adres alani butcesi altinda eski kodda MemoryError ile failed oldu; yeni kodda tam payload TAR'dan okunarak dogrulandi. Retry sonrasi onceki parcalar yok; eksik Content-Length ve challenge reddedilir; disk reserve hatasi yukari tasinir. Parent loss, crash recovery, remote index ve upload failure testleri korunur.

Canli Q14517.tar.gz: 485624563 byte; MD5 `a4ff443dc0495b19ceada47c338865da`, kaynak checksum'i eslesti. TAR roundtrip MD5 eslesti. 2 GiB/swap=0 izole systemd probe basarili: RSS 96008 KiB; page cache dahil unit peak 939 MiB. Probe 23 saniyede tamamlandi, sahip olunan gecici dosyalar temizlendi. Kanit: `data/maintenance/aperta-live-stream-probe.json`.

## Kurtarma ve sinir

Once: archived=30, downloaded=5448, failed=34976, pending=55947.
Sonra: archived=30, failed=34976, pending=61395. Prova ve canli requeue=5448. p00004 ve p00007 ham yarim arşivler korunur.

Kurtarma provasi icin alinan kopya dogrudan degistirildi; bu dosya orijinal association'lari koruyan bir backup olarak sunulamaz. `aperta-rehearsal.sqlite` adiyla saklandi; son durum ayrica `aperta-after.sqlite` olarak alindi. Eski rollout backup'lari ve ham arşivler korunur. Bu kisit ve gercek hash'ler `data/maintenance/aperta-stream-recovery-20261006T064342Z/recovery.json` dosyasinda aciktir.

`scripts/reap-daemon-runs.ts` mevcut schema-guard'li TS reaper'i cagirir. Kullanici systemd `protokol-7-daemon-reaper.timer` dakikada bir calisir; ilk cagrida expired_runs=1. Global WorkerPool baslatilmadi. Unit dosyalari `~/.config/systemd/user/` altindadir; DB yolu `pipeline-runtime.env` uzerinden gelir. Reaper process oldurmez, yalniz stale monitor satirini FAILED yapar.

Aperta ayni 2 GiB/swap=0/Restart=no/KillMode=mixed sinirlariyla yeniden baslatildi. Sonraki asset'ler p00008'e yazilir, p00007 ezilmez. Uzun sureli bellek birikmesi bu kisa probe ile dislanamaz; canli unit izlenebilir.

## Dogrulama

Son shared discovery 159 test; ardindan uc streaming testi (hard-limit rotation ve append failure ek regresyonu dahil) basarili; onceki hedef regresyon 8 test; Aperta kaynak 11 test; TS daemon monitor 6 test basarili. Typecheck, npm run verify (384 dosya), py_compile ve git diff --check basarili. Failure checklist: production fail/pending ayrimi, owned-temp cleanup, rotation/association sirasi, hard cap ve healthy heartbeat korunmasi kontrol edildi.

Canli log: `journalctl --user -u protokol-7-aperta-assets.service -u protokol-7-dergipark.service -f -o short-iso`.

Son canli kontrol 09:47 TRT: Aperta active/success, RSS disi cache dahil MemoryCurrent 410 MiB ve peak 613 MiB; heartbeat 06:46:20 UTC. Reaper sonraki cagrida expired_runs=0; DergiPark calismasi korunur.
