# Ilham Analizi kontrollu yeniden baslatma

Tarih: 2026-10-06. Tier 2. Kullanici eski 11.173 Aperta archived kaydin yeniden kuyruga alinmasini ve DOAJ'in kapali kalmasini secti.

## Katalog ve cikti kaniti

Kanıt deposu `data/maintenance/restart-preflight-20261005T222633Z/` altindadir. Merkez/control kataloglarinin ve Aperta/DergiPark/HF kaynaklarinin SQLite backup API kopyalarinda integrity_check=ok ve FK ihlali=0; SHA-256 kayitlidir. DOAJ 4,7 GB kopyasi korunur, quick_check=ok ve SHA-256 vardir. DOAJ tam index integrity taramasi yuksek IO nedeniyle ve kullanicinin DOAJ'i kapsam disi tutmasi sonrasi ertelendi; tamamlanmis sayilmaz. Ilk denetim sureci durduruldu, kaynak veya yedek silinmedi.

Salt okunur Parquet denetimi: eski DOAJ p00108 ve Aperta p00000 okunabilir; DOAJ p00142 ve iki DergiPark fulltext dosyasi footer olmadan kalmis. Aperta 8.489.994.144 bayt ve DergiPark 8.569.430.929 bayt ham gzip/tar kapanmamis; tum dosyalar korunur. Aperta arşivinde 1.251 tam payload ve 1.252 member header goruldu. 11.173 archived kayit ile kapali arşiv receiptlerinin 9.914 kaydi arasinda 1.259 fark vardir; 7 kayit header ile bile kesin eslestirilemedi. Kullanicinin tam yeniden kuyruklama secimi bu belirsizligi kapsar.

## Kurtarma ve regresyon

Aperta eski kodu dosyayi arşiv kapanmadan archived yapiyor ve ayni klasorde p00000'i yeniden yazabiliyordu. Gercek subprocess os._exit regresyonu iki sorunu once kirmizi, sonra yesil gosterdı. Yeni nullable archive_shard_name yazma bagini append'den once kaydeder; downloaded durumu ancak kapali shard receipt'i sonrasi archived olur. Yeni run, mapped fakat kapanmamis yazilari pending yapar. Yerel eski dosyalar next_part_index ile reserve edilir ve tar dosyasi exclusive x:gz modunda acilir. DergiPark tar acilisi da exclusive'dir.

Kopya provasi sonrasi file_id SHA-256/count ve durum toplam kontroluyle canli Aperta'da 11.173 archived -> pending uygulandi. Pending 50.274 -> 61.447, failed 34.954 degismedi. Ham arşiv korunur. DergiPark kopya provasi ve canli uygulamada 10.854 unsealed-output makalesi tekrar pending oldu; ikinci recovery idempotent'tir. Integrity/FK denetimleri gecti.

Pilot sonrasinda Aperta'nin yerelden evict edilmis uzak shard numarasini saymadigi goruldu. Isci graceful durduruldu; ledger.get_next_part_index minimumu eklendi ve dorduncu regresyon testi eski kodda kirmizi, yeni kodda yesil oldu. Iki farkli Drive dosyasi ayni p00005 adini tasimisti; hicbiri silinmedi. Taze katalog backup'i, uzak size/MD5/SHA-256 kontrolu sonrasi ikinci dosya p00006 olarak yeniden adlandirildi; 29 kaynak bagi yeni receipt'e tasindi, ilk pilotun p00005 receipt'i dogru hash/remote ID ile geri getirildi. Merkez katalog yeniden senkronize edildi; integrity/FK gecti. Yeniden baslayan isci p00007'yi kullanir. Ayrintili kanit `aperta-namespace-repair.json` icindedir; [Drive files checksum alanlari](https://developers.google.com/workspace/drive/api/reference/rest/v3/files) kullanildi.

## Canli pilot ve calisan surecler

- Aperta assets: bir gercek dosya, kapali tar, Drive MD5 verification ve catalog receipt basarili.
- Aperta metadata: 100 kayitlik sinirli pilot, Parquet ve Drive verification basarili. Eski final cursor 91.100/91.188 olsa da token bos string'di; IS NOT NULL testi devam token'i kaniti degildir. 91.173 temiz kayit zaten sharded idi. Pilot yeni snapshot'in ilk 100 kaydini aldi; metadata surekli daemon olarak baslatilmadi, partial state korunur.
- DergiPark ilk pilot: bir makale HTTP yonlendirmesiyle baska domain'e gidiyordu; HTTPS kopyasinda hostname certificate mismatch goruldu. Guvenlik kontrolleri korunur, bu makale resolve_error_UnsafeAddressError olarak reddedilir. Ikinci pilot uc makale/91 sayfa/197.364 karakter basarili, Parquet ve ham PDF Drive verification gecti.
- HF uretim baslangici: ilk 4.845.702.047 bayt dosya MD5 verification/catalog commit sonrasi remote_verified oldu; siradaki dosyaya gecti. Eski 547 remote_verified dosya yeniden indirilmez.

Calisan systemd user transient unit'leri: protokol-7-aperta-assets (2 GiB MemoryMax), protokol-7-dergipark (1 GiB), protokol-7-huggingface (1 GiB). MemorySwapMax=0, Restart=no, TimeoutStopSec=180, KillMode=mixed. Sinirlar tum host yerine ilgili unit'i kapsar; otomatik crash retry yoktur. Unit'ler bu oturum icin transient'tir, reboot sonrasi otomatik baslangic kurulmaz. Uretim async-upload/impersonation/near-duplicate flag'leri varsayilan kapali kalir.

Tum ureticiler ayni `data/catalogs/daemon_monitor.sqlite` yolunu kullanir. Dedicated schema/state/retry/stats/backfill prova ve activation gecti; bu SQL'ler merkez/source kataloglarina uygulanmadi. TS getDaemonRunHealth gercek monitoring katalogunu okur. API/global WorkerPool servisi baslatilmadi; queued control-plane gorevleri bu rollout'ta calistirilmaz. Sonraki API/worker start'i icin ortak env `data/maintenance/pipeline-runtime.env` dosyasindadir.

Takip: `systemctl --user status protokol-7-aperta-assets protokol-7-dergipark protokol-7-huggingface`; loglar `journalctl --user -u <unit> -f`. Guvenli operator stop: `systemctl --user stop <unit>`; eski PID dosyalari otorite degildir.

## Dogrulama ve kalanlar

Tum shared 157 unittest, Aperta 11 regresyon ve DergiPark 24 pytest basarili; compile/diff kontrolu gecti. Verify tekrar calistirildi. Onceki 15 TS ve typecheck sonucu bu Python degisikliginden etkilenmez; canli health consumer ayrıca denetlendi.

DOAJ kullanici karariyla kapali, eski kaynak katalogunda durable OAI continuation token'i yok. Merkezi occurrence/raw evidence uretici gecisi ve API/worker environment aktivasyonu ayri mimari rollout isidir. Kaynak toplam indirme isi arka planda surer; dataset tamamlandi denmez. Commit/push yapilmadi.

## 2026-10-06 son durum

HF 565 remote_verified dosyayla tamamlandi. DergiPark aktif. Aperta OOM sonrasi disk streaming duzeltmesi, 5.448 unsealed requeue ve 486 MB gercek dosya checksum/TAR provasi sonrasinda yeniden aktif. Dedicated heartbeat reaper dakikalik. DOAJ kapali. Ayrinti ve backup kisiti: [Aperta bellek kurtarma](aperta-asset-bellek-kurtarma-walkthrough.md).
