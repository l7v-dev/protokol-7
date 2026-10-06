# Ilham Analizi Faz 1 Yurutme Kaydi

Tarih: 2026-10-05
Kapsam: Adim 1.1 migration, Adim 1.2 HeartbeatWriter ve Adim 1.3 Python detector; Tier 2.

`docs/plans/meltano-nifi-ilham-analizi-plani.md` Bulgu A ve uygulama faz plani temel alindi.
Alembic altyapisi bulunmadigi icin mevcut SQL migration dizini kullanildi.

## Degisiklikler

- `0005-pipeline-heartbeat.sql`: nullable `last_heartbeat_at` ve varsayilani 60 olan,
  pozitif `heartbeat_interval_seconds`. Mevcut run durumlari degismez.
- `heartbeat_migration.py`: mevcut dosyayi rw modunda acar; eksik katalog olusturmaz.
  `BEGIN IMMEDIATE` ile iki kolon atomik eklenir; hata halinde rollback yapilir.
  Uyumlu mevcut kolonlar atlanir; uyumsuz tip veya NOT NULL kolon reddedilir.
- Canli katalogda SQL uygulanmadi; daemon durdurma veya restart yapilmadi.

## Dogrulama

`.venv/bin/python -m unittest pipelines.shared.test_heartbeat_migration`: 6 test basarili.
Eski kayit/INSERT uyumu, idempotence, pozitif interval, eksik katalog/tablo,
uyumsuz kolon ve ikinci ALTER hatasinda rollback test edildi.
Gercek corpus schema.sql ile integrity ve foreign key kontrolleri gecti.
`npm run verify`: alti dogrulama katmani basarili; Biome 381 dosyayi kontrol etti.

Failure checklist tarandi: yeni bagimlilik yok, mevcut runtime kodu degismedi;
migration aktivasyonu ve heartbeat entegrasyonu tamamlanmis sayilmadi.

## Siradaki is

Faz 2 HTTP guvenligi ve retry politikasi sirada. Faz 1 kodu ve izole dogrulama
tamamlandi; uretim activation bekliyor. Pipeline'lar bakim nedeniyle kapali;
tum isler ve dogrulama bitmeden baslatilmayacak.

## Adim 1.2

`heartbeat_writer.py` eklendi. Ilk heartbeat thread baslamadan senkron yazilir;
eksik katalog, migration veya run kaydi baslangicta hata verir. Her ping kendi
SQLite baglantisini acar ve kapatir; ayni yazicinin ping'leri lock ile siralanir.
UTC timestamp ve interval disinda run alanlari degismez. `stop()` event ile
periyodik beklemeyi keser, thread'i join eder ve son heartbeat'i yazar.
Arka plan hatasi `error` alanina kaydedilir ve ping/stop tarafindan yukseltilir.
Context body exception'i, kapanma hatasi olsa bile korunur ve hata notu eklenir.

Salt okunur SQLite envanteri: `data/catalog.sqlite`, `data/catalogs/doaj_catalog.sqlite`,
`data/catalogs/dergipark_catalog.sqlite`, `data/catalogs/aperta_catalog.sqlite` ve
`data/huggingface/catalog.sqlite` dosyalarinin hicbirinde `pipeline_runs` yok.
Bu nedenle mevcut ALTER migration'i canliya uygulanmadi. Runtime run sozlesmesi
eslestirilmeden Faz 1 tamamlanmis kabul edilmez.

`.venv/bin/python -m unittest pipelines.shared.test_heartbeat_migration pipelines.shared.test_heartbeat_writer`:
16 test basarili (6 migration, 10 writer). Periyodik gercek thread yazimi,
join/final ping, context hata akisi, eksik katalog/run/migration, hedef satir
izolasyonu ve arka plan hatasi test edildi. Yeni bagimlilik eklenmedi.
Adim 1.2 sonrasi `npm run verify` ve `git diff --check` basarili.

## Adim 1.3 Python detector

`registry-database.ts` semasi ve `pipeline-runner.ts` kayit cagrilari incelendi.
`pipeline_executions` tamamlanmis sonuc kaydidir; status CHECK yalniz succeeded/failed
kabul eder ve completed_at zorunludur. Daemon heartbeat/cursor tablosuna donusturulmedi.

`stale_detector.py` mevcut corpus run sozlesmesini kullanir. Salt okunur sorgu,
UTC ve saat dilimi farklarini SQLite julianday ile hesaplar. NULL/gecersiz timestamp,
terminal run ve gelecekteki heartbeat stale kabul edilmez. Varsayilan esik interval'in
uc katidir; esige esit kayit korunur. `mark_stale` tek UPDATE ile aktif durum ve
esigi tekrar kontrol eder, FAILED/completed_at/error_message yazar. Arada heartbeat
yenilenmesi veya run tamamlanmasi kaydi korur. Process sinyali gonderilmez.

Canli daemon run uretimi, REST health ve WorkerPool reaper entegrasyonu yapilmadi;
Adim 1.3 ve Faz 1 butun olarak tamamlanmis sayilmadi. Yeni detector testleri gercek
corpus semasi uzerinde esik, NULL/terminal/future, interval/grace, saat dilimi,
atomik mark, yenilenen heartbeat ve tamamlanma yarislari, eksik katalog ve gecersiz
parametreleri kapsar. `npm run verify` basarili; failure checklist tarandi.
Son regresyon: migration/writer/detector toplami 26 Python testi basarili;
`git diff --check` temiz.

## Runtime entegrasyonu ve bakim (2026-10-06)

`daemon_run.py` ayri monitoring katalogunun semasini ve run lifecycle'ini sahiplenir.
`daemon_monitor_schema` kimligi olmayan mevcut katalog reddedilir; kaynak katalogu
degistirilmez. Her baslangic UUID run acip senkron heartbeat yazar; kapanma thread join
sonrasi COMPLETED/FAILED yazar. Exception mesaji yerine yalniz sinif adi tutulur.
Stale reaper'in FAILED durumunu kapanma veya heartbeat geri alamaz.

DOAJ, Aperta, DergiPark fulltext ve HuggingFace harvesting fonksiyonlari opt-in
decorator ile baglandi. CLI help once argparse'da islenir; status/sync/flush
komutlari harvesting izleme run'i olusturmaz. `PROTOKOL_DAEMON_RUN_DB` ayarlanmadiginda
onceki davranis surer. Ayarlanacak dosya kaynak katalogundan ayri olmali; ornek:
`data/monitoring/daemon-runs.sqlite`. Ayni mutlak yol daemon/API/worker'a verilir.

`daemon-run-monitor.ts` Python katalogunu okur. /health ve /api/v1/health
`daemonMonitoring` ve `stale_runs` doner; stale veya kullanilamaz izleme degraded
sonuc verir. Yeni run eski pipeline stale alarmindan once gelir; gecmis korunur.
WorkerPool opsiyonel reaper callback'i worker CLI'da ayni env ile baglandi.
UPDATE esigi tek SQL icinde yeniden denetler; sinyal gondermez veya process oldurmez.
OpenAPI health sozlesmesi ve alias guncellendi.

Dogrulama:
- 34 shared Python testi (migration, writer, detector, daemon lifecycle).
- 51 kaynak testi: DOAJ 8, Aperta 11, DergiPark 22, HuggingFace 10.
- 15 TS testi: Python->TS katalog sozlesmesi, threshold/NULL/terminal,
  worker timer callback, yeni run'in eski alarmi kapatmasi, iki HTTP health yolu
  ve mevcut WorkerPool regresyonlari.
- Dort orchestrator py_compile; uc kaynak CLI --help import smoke basarili.
- Son typecheck, npm run verify (383 dosya), hedef Biome kontrolu ve
  git diff --check basarili. HTTP testinde registry ve control ledger in-memory;
  daemon monitoring katalogu gecici dizindedir.

Kullanici sistem restart'ini bildirdi; /proc taramasinda pipeline Python sureci
bulunmadi. Eski PID dosyasinin varligi canli process sayilmadi. Force kill, restart,
shard temizligi veya uretim veri ag istegi yapilmadi. Yerel bakim kaydi:
`data/maintenance/pipeline-stop.json`. Tum isler ve dogrulama tamamlanana kadar
uretim daemon'lari kapali tutulacak. Bos process listesinden cokme nedeni cikarilmadi.

## State merge ve cursor fencing (2026-10-06)

`state_merge.py`, `state_migration.py`, `offset_context.py` ve 0006 migration
eklendi. Yeni daemon run'leri migration'i idempotent olarak uygular. Stream state
run UUID'sinden bagimsiz stable key'de saklanir; her checkpoint run kanitini da
ayni SQLite transaction'inda yazar. JSON object deep merge, array/scalar/null
replace semantigiyle completed baseline korunur. Version/owner CAS ikinci
yaziciyi reddeder. Fresh owner devralinamaz; expired owner claim transaction'inda
atomik reaped edilir. `RunCheckpoint` expected_version'i son basarili yazidan tasir.

DOAJ token'i kapanmis shard callback'inde sayfa baslangicina baglandi. Maksimum
record limiti doğal snapshot tamamlanmasi sayilmaz. Replay kapanmis shard'in
son sayfasini tekrar okuyabilir; exact-once iddiasi yoktur. Aperta token'i indexed
SQLite verisine baglandi; resume oncesi bu kayitlar bounded batch ile paketlenir.
Upsert eski sharded kaydi yeniden indexed yapar; unsealed guncelleme skip edilmez.
DergiPark extracted status'unun kapanmamis shard/archive referansi pending'e
doner; scalar article ID cursor'u ile paralel sonuclar atlanmaz. Legacy NULL
output referanslari ve kapanmis output'lar korunur. HF verified ledger ve pinned
revision inventory'den devam eder; state yazma hatasi remote_verified kaydi bozmaz.

`shard_namespace.py` mevcut yerel dosyalarin part index'lerini reserve eder;
katalogda olmayan yarim Parquet veya ham TAR dosyasi yeni writer tarafindan
ezilmez. Uretim dosyasi silinmedi veya tasinmadi.

Dogrulama:
- Shared: 52 Python testi (onceki 34, state/migration/crash/CAS 12,
  source checkpoint seam 4, namespace 2).
- Kaynak: DOAJ 8, Aperta 11, DergiPark 23, HF 13; toplam 55.
- TS: 15 daemon monitoring/health/WorkerPool regresyonu; yeni state semasi
  Python->TS katalog sozlesmesini bozmaz.
- Typecheck, verify, py_compile ve diff check basarili.

Subprocess os._exit ile gercek crash; ayni expected_version kullanan iki thread;
run mirror trigger hatasinda rollback; gercek corpus semasinda legacy row ve FK
korunumu test edildi. Mocked DOAJ main yeniden baslangicta saved token'i kullanir,
yetim/onceki output'u ezmez. Mocked Aperta main shard kapanmasi hatasindan sonra
indexed kaydi once paketler, sonra sonraki sayfaya gecer. HF iki run limit/restart,
remote verification hatasi ve checkpoint hatasi testleri gecti.

Uretim migration'i/daemon restart'i yapilmadi; canli activation kriterleri acik.
Yeni tarih tabanli CDC/delta politikasi etkinlestirilmedi. Failure checklist
tarandi; kabul kod+izole test seviyesindedir. Uretim pipeline'lari kapali kalir.
