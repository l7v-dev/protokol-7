# Uretici provenance ve runtime gecisi

2026-10-06; Tier 2. Kullanici API/WorkerPool ortak izleme aktivasyonu, tum ureticilerin merkezi provenance/raw evidence gecisi ve commit/push istedi. Kaynak plan: `docs/plans/uretici-provenance-ve-runtime-plani.md`. Orijinal Ilham plani korunur.

## Sonuc ve kapsam

API, WorkerPool, Aperta asset ve DergiPark fulltext user systemd servisleri aktif ve enabled. Ortak ayarlar `data/maintenance/pipeline-runtime.env`: daemon monitor, merkezi provenance katalogu, raw evidence dizini ve 25 GiB disk rezervi. API yalniz 127.0.0.1:4000 uzerinde; health healthy, monitor ready, stale_runs bos. Worker bos kuyrukta kapanmaz; SIGTERM aktif isi drain eder. Restart=no ve swap=0; kaynak/worker bellek sinirlari unit dosyalarindadir. Enabled user servisleri kullanici systemd oturumunda baslar; sistem geneli linger ayari degistirilmedi.

Aperta, DergiPark, DOAJ, PubMed, bioRxiv, Semantic Scholar, Binance, Gutenberg, StackExchange, sekiz Wikimedia ureticisi, HuggingFace, corpus, OpenAlex API/snapshot/CDC kod yollarina ortak uretici kaydi baglandi. DOAJ kapali kalir. OpenAlex kod gecisi kapsamda, canli aktivasyon onceki kullanici kararina gore kapsam disinda. Diger kaynaklarin yeni indirme isleri baslatilmadi; tamamlanmis HuggingFace yeniden indirilmedi. Elle baslatilan ureticiler icin ortak env dosyasi shell'e aktarilmalidir; merkezi yazici env yokken kapali kalir.

## Veri sozlesmesi

- HTTP cevabinin, PDF'in, dump'in veya kaynak dosyanin gercek baytlari parsing oncesi korunur. SHA-256 adresli blob atomik hardlink/fsync ile yayimlanir. Temizlenmis JSON raw evidence olarak kullanilmaz.
- Gercek metin varsa Python ve TypeScript ayni TextNormalizer canonicalization politikasi/surumu ile document identity uretir. Metadata-only veya sayisal satirlar yapay belgeye donusturulmez. Varsayilan PII unchecked, split unassigned, rights unknown kalir.
- Raw artifact/location/acquisition ve document/occurrence/run baglari FK ve transaction ile yazilir. Tekrar ayni receipt yeni occurrence yaratmaz; mevcut PII/rights karari ezilmez. URI query sirleri saklanmaz.
- Python manifesti gercek monitor run UUID'sini kullanir; terminal success/partial/failed/aborted sonuc, counts ve hata turu kaydeder. Yonetilmis kaynak hatalari partial olur. Kanit depolama arizasi saglam kaynak kaydini failed'e cevirmeden yukselir.
- Worker raw-only indirmeleri de acquisition ve manifest alir. Extraction ayri job run'ina baglidir. Terminal sonuc control-plane job defterinden tekrar okunur; merkezi katalog arizasi tamamlanmis job'i geri cevirmez. Bekleyen sonuc periyodik olarak yeniden denenir.
- Aperta asset ham receipt'i ancak TAR kapandiktan sonra kaydedilir. Kaynak file association ve raw outbox ayni transaction'dadir; uye adi packer ile ortaktir. Dogrulanmis Drive konumu outbox'tan tekrar oynatilabilir. Unsealed staging kaniti tamamlanmis artifact gibi raporlanmaz.
- Corpus batch run'lari `corpus_pipeline_runs`, shard iliskileri `corpus_shard_runs` tablosundadir; daemon/YAML run tablolariyla karistirilmaz. Merkezi dataset_shards sozlesmesi korunur. Kanit arizasinda corpus run FAILED, raw dosya korunur.

## Migration ve canli kanit

0011 immutable online backup + ayri rehearsal + tekrar uygulama/integrity/FK kaniti sonrasi uygulandi: `data/maintenance/producer-migration-20261006T071233Z/activation.json`. 0012 ayni yontemle: `data/maintenance/producer-migration-20261006T072133Z/activation.json`. Eski tablo satir sayilari korunmus, backup SHA degismemis, integrity ok ve FK ihlali 0.

Worker activation oncesi sourceId'siz example.com fixture URL'leri tasiyan sekiz pending download isi, online backup ve audit receipt sonrasi quarantined yapildi. Kanit: `data/maintenance/runtime-activation-20261006T065306Z/`. Gercek kaynak isleri yeniden kuyruga alinmadi.

Aperta/DergiPark SIGTERM ile dosya/batch sinirinda kapandi; kapanis timeout'u infinity yapildi. Aperta p00008 (2.628 uye, 1.157,77 MB), DergiPark p00018 (1.105 metin) ve p00006 PDF arsivi (5.105 PDF, 4.652,07 MB) checksum dogrulamasi sonrasi Drive'a gitti. Zorla kill veya arsiv silme yapilmadi.

Aperta pilot: kayit 270412, 223 bayt gercek TXT, p00009 tek uyeli TAR. Drive MD5 90c4d1c5354a2b425242648e6ad643a0; merkezi raw acquisition=1, document occurrence=0 ve manifest success. Asset bir metin uretim hattindan gecmedigi icin yapay document yaratilmadi.

DergiPark pilot: 1 makale, 19 sayfa, 51.728 karakter; p00019 Parquet ve p00007 PDF TAR ayri checksumlarla Drive'a gitti. Merkezi raw PDF SHA-256 yerel content-addressed blobdan tekrar dogrulandi; occurrence/run bagi ve success manifest mevcut. Pilot memory peak 113,6 MiB. Tam isci eski iki-worker ayarlariyla yeniden baslatildi.

HuggingFace'in mevcut remote_verified defterinden 565 SHA-256/size/Drive/source receipt merkezi acquisition'a tasindi. Indirme sayisi 0; belge sayisi 0. Bu islem onceki remote verification kaydina dayanir, yeni remote recheck yapildigi iddia edilmez. Iki erisim engelli depo onceki kapsam kisiti olarak kalir.

Pilot lineage kaniti: `data/maintenance/producer-runtime-proof/pilot-lineage.json`. Guncel process/unit snapshot: `data/maintenance/pipeline-stop.json`. PID dosyalari otorite degildir.

## Dogrulama

- Tum TypeScript paketi: 1.013 test, 0 fail. Python/TS canonical identity ve Worker raw acquisition/replay/terminal outcome testi ayrica gecti.
- Shared Python discovery: 168 test, OK. 22 kaynak test dosyasi: 220 test, 0 fail. Corpus evidence-fault, Binance iki dosyali checksum/batch ve Aperta disk/TAR regresyonlari dahil.
- Worker gercek subprocess bos kuyrukta 4 saniye aktif kaldi; SIGTERM temiz exit=0.
- CLI entrypoint'ler /tmp cwd'den --help ile kontrol edildi; compileall, typecheck, npm run verify ve git diff --check basarili.
- bioRxiv eski dry-run testi dosya silinmesini bekliyordu; shared sozlesmedeki gercek bayt koruma beklentisine duzeltildi. Corpus'un mevcut duckdb gereksinimi 1.5.6 sanal ortama kuruldu; yeni paket gereksinimi eklenmedi.

## Standards incelemesi

Onceki canonicalization, TAR uye adi ve corpus FAILED durum bulgulari duzeltildi. Son bagimsiz incelemede acik kesin standart ihlali yok; diff whitespace denetimi basarili.

## Spec incelemesi

Metadata-only belge uretimi, kaynak/merkez hata ayrimi, archive outbox association ve yonetilen kaynak hatalarinin yanlis success olmasi duzeltildi. Binance checksum dali ve her dosyanin batch icinde islenmesi regresyonla kanitlandi. Son bagimsiz incelemede acik spec bulgusu yok.

Toplam acik bulgu: Standards 0, Spec 0. Commit/push hedefi `codex/mimari-canli-gecis`; merge bu gorevin kapsaminda degildir. Croissant/public release ve OpenLineage genisleme kosullari ayri mimari yol haritasi gorevleri olarak kalir.

## Canli izleme

```bash
journalctl --user -fu protokol-7-aperta-assets.service
journalctl --user -fu protokol-7-dergipark.service
journalctl --user -fu protokol-7-api.service -u protokol-7-worker.service
curl -fsS http://127.0.0.1:4000/health
```
