# Ilham Analizi Faz 6

Tarih: 2026-10-06. Tier 2. Kod ve izole dogrulama tamamlandi; uretim kapali.

`adr-wal-checkpoint.md` SQLite WAL dosyasinin elle kesilmesini reddeder; kayit sayisi yerine WAL boyutu, gecikme, okuyucu ve checkpoint olcumlerini esas alir. `adr-lineage-graph.md` mevcut occurrence/run/raw artifact baglarini korur; bulunmayan provenance_events tablosu veya yeni graph migration'i tamamlanmis sayilmaz. Kaynaklar ADR'lerde kayitlidir; orijinal Meltano/NiFi analiz dosyasi degistirilmedi.

## Yardimcilar ve sinirlar

| Modul | Davranis |
|---|---|
| condition_wait | Monotonic deadline, sinirli poll, secili gecici exception; predicate kendi IO timeout'unu saglar |
| domain_rate_limiter | Ilk eslesen host kurali, mevcut AdaptiveRateLimiter pacing, caller-owned DiskUrlDedup receipt; URL tekrar goruldu diye kaynak ledger verification atlanmaz |
| extraction_tier | Byte esikleri ve caller-supplied maliyet/butce; varsayilan sadece TEXT, OCR/FULL backend kurulmus sayilmaz |
| cli_validation | Pydantic 2.13.5; pozitif resource limit, nonnegative count/rate/reserve, finite sayi ve target<=maximum |
| daemon_run backfill | Dedicated katalogda nullable start/end/current; timezone zorunlu, UTC normalize, bounded monotonic progress, immutable bounds, active run; source checkpoint degismez |
| shutdown_coordinator | Graph once dogrulanir; dependent once kapanir, basarili close tekrarlanmaz; drain hatasinda dependencies acik kalir ve sonraki close tekrar deneyebilir |
| step_context | Yalniz ${input.key.nested} tam ifadesi, mapping keys; eval, method veya attribute erisimi yok |
| cache_mode | Enabled/disabled/read_only/write_only/bypass erisim politikasi; backend veya CLI cache entegrasyonu yok |
| format_extractor | PDF text-layer default; ek format acik parser registration gerektirir, unsupported format reddedilir |
| actor_telemetry | Kilitli token sayaclari, Decimal caller-supplied per-million price; bilinmeyen cost null, ucret API'si veya LLM aktoru eklenmez |

CLI validation DOAJ, Aperta metadata, DergiPark fulltext, Aperta assets ve HF girislerinde kaynak/catalog construction oncesindedir. Diger yardimcilar bagimsiz API'dir; runtime wiring yapilmis kabul edilmez. `requirements-validation.txt` sabitlenmistir; yerel venv'e kuruldu. [Resmi paket](https://pypi.org/project/pydantic/) ve [field constraints](https://pydantic.dev/docs/validation/latest/concepts/fields/) dogrulandi.

`0010-pipeline-backfill.sql` yalniz monitoring catalog icindir. DaemonRun mevcut dedicated katalog kolonlarini idempotent ekler; SQL dosyasi bir defalik migration'dir. Canli katalogda calistirilmadi.

## Dogrulama

- Faz 6: 22 test; her yardimci en az iki boundary testi, ek shutdown cycle ve bes CLI icin ayri subprocess resource-construction denetimi.
- Tum shared unittest discovery: 153 test basarili; subprocess crash/IPC, HTTP, state, queue ve checkpoint testleri dahil.
- Kaynak regresyonlari: DOAJ 8, Aperta 11, DergiPark pytest 24, HF 13; toplam 56 basarili.
- Health/reaper/worker TS: 15 test basarili.
- npm run typecheck, npm run verify (383 dosya), Python compile ve git diff --check basarili.

Genis discovery ilk denemesinde iki eski test beklentisi bulundu: dry-run purge ve pii_status'suz schema. Mevcut sozlesmeye gore dry-run dosya icerigi korunmasi ve 12 kaydin unchecked string pii_status'u dogrulandi; production davranisi test gecirmek icin degistirilmedi. CLI integration testleri legacy sibling importlari nedeniyle ayri subprocess'te yuklenir. DergiPark pytest kullanir; unittest discovery'deki sifir test sonucunu basari olarak saymadik.

Son /proc kontrolunde uretim pipeline sureci yok. Uretim start, live API/Drive, katalog migration, orphan silme, commit/push yapilmadi. Faz 1-6 kodu tamamlandi; sonraki ayri asama kullaniciyla backup/migration/env/pilot/resume kabuludur. Tum fazlarin canli kabul kosullari rollout'a kadar bekler.
