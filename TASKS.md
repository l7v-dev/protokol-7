# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [ ] **DOAJ Canlı Tam Katalog Akışı ve Parquet Paketleme (`doaj`)** — `Tier: 1`
  - **Durum:** Canlı OAI-PMH servisi üzerinden tam DOAJ veritabanı (13,7M+ makale) arka plan daemon'ı olarak yürütülüyor.
  - **Süreç:** `python -u pipelines/api_stream/doaj/orchestrator.py --all --max-records 0 --batch-size 1000 --max-shard-records 50000 --shard-size-mb 512`
  - **İlerleme:** ~65-75 rec/s akış hızıyla makaleler çekiliyor, `data/catalogs/doaj_catalog.sqlite` tablosuna ACID indeksleniyor, 50.000'er kayıtta veya 512 MB eşiğinde Zstandard Parquet shard'ları oluşturulup Google Drive `DOAJ/` klasörüne uzaktan MD5 doğrulamasıyla aktarılıyor ve yerel disk sıfırlanıyor.
  - **Takip:** `tail -f logs/doaj.log`

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Sağlamlaştırma bekleyen görev bulunmuyor)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Atıl Beceri Seti Temizliği ve Ortam Konsolidasyonu** — `Tier: 1` — `.agents/skills/` altındaki Eylül 2024 tarihli 15 atıl/şablon beceri (`grill-me`, `to-spec`, `triage`, `handoff` vb.) `ledger/legacy-skills/` dizinine arşivlendi; aktif çekirdek 16 beceri korundu. `rules/failure-checklist.md` ve `rules/task-discipline.md` çapraz referansları güncellendi. `~/.gemini/config/skills/` ve `~/.gemini/skills/` altındaki 30 mükerrer eski kopya arşivlenerek prompt context budget limits aşımı engellendi ve eklenti standardı sağlandı. Walkthrough: [`docs/walkthroughs/beceri-seti-temizligi-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/beceri-seti-temizligi-walkthrough.md).

- [x] **Boru Hattı Entegrasyonu ve İşçi CLI Daemon'ı (Faz 4)** — `Tier: 1` — `ControlRouter` HTTP REST yönlendiricisi (`/api/v1/control/jobs`, `/api/v1/control/sources`, `/api/v1/control/leases/reap`), `scripts/run-worker.ts` bağımsız işçi CLI daemon'ı (`npm run worker`), `package.json` CLI betiği ve 5 HTTP REST birim testi (954/954 test yeşil) tam başarıyla tamamlandı. Walkthrough: [`docs/walkthroughs/boru-hatti-ve-isci-daemon-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/boru-hatti-ve-isci-daemon-walkthrough.md).

- [x] **İşçi Havuzu ve Görev Yürütücüsü Köprüsü (Faz 3)** — `Tier: 1` — `src/workers/` modülü altında RFC 03 ve RFC 05 şartnamelerine tam uyumlu `TaskWorker` (bounded execution, `leaseSeconds / 3` periyodunda arka plan heartbeat, tam jitter'lı exponansiyel backoff, terminal ve karantina hata yönetimi), `WorkerPool` (eşzamanlı işçi koordinasyonu, periyodik lease reaper, graceful drain), `DownloadJobHandler` (SSRF korumalı güvenli indirme, `ObjectStore.putStream`, SHA-256 doğrulama, child extract işi üretimi) ve `ExtractJobHandler` (`ObjectStore.openStream` ile okuma, metin/HTML damıtma, türetilmiş artifact ve outbox bildirimi yayımı) geliştirildi. 9 birim testi ile %100 yeşil tamamlandı (949/949 test geçildi). Walkthrough: [`docs/walkthroughs/isci-havuzu-ve-gorev-yurutucusu-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/isci-havuzu-ve-gorev-yurutucusu-walkthrough.md).

- [x] **Kontrol Düzlemi ve Defter Deposu (Faz 2)** — `Tier: 1` — `contracts/ledger.ts` sözleşmesine tam uyumlu `SqliteLedgerRepository` (ACID işlemler, `lease_epoch` atomik kilit, periyodik lease reaper) ve `OutboxDispatcher` (en az bir kez teslimat garantisi, aboneye bildirim ve epoch korumalı onay) geliştirildi. 5 birim testiyle kaynak, bölüm, doküman, içerik nesnesi, atomik kiralama/heartbeat/finalize, outbox kuyruğu ve expired lease kurtarma %100 doğrulandı (940/940 test yeşil). Walkthrough: [`docs/walkthroughs/kontrol-duzlemi-ve-defter-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/kontrol-duzlemi-ve-defter-walkthrough.md).

- [x] **Nesne Deposu ve Adaptör Uyumluluğu (Faz 1)** — `Tier: 1` — `contracts/storage.ts` sözleşmesine tam uyumlu `LocalObjectStore` ve `R2ObjectStore` sınıfları TypeScript (`src/storage/adapters/`) ve Python (`pipelines/shared/object_store_base.py`) katmanlarında geliştirildi. Yol geçişi (path traversal), sembolik bağ kaçışı, atomik fsync, değişmezlik çakışma kontrolü (ImmutableConflict) ve aralıklı okuma (ranged read) doğrulandı. 10 TS birim testi (935/935 test) ve 6 Python birim testi (15/15 paylaşımlı test) %100 yeşil tamamlandı. Walkthrough: [`docs/walkthroughs/nesne-deposu-ve-adaptor-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/nesne-deposu-ve-adaptor-walkthrough.md).

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
