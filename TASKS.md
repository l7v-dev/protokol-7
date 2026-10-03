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

- [x] **DergiPark URL Eşleme ve Geriye Dönük Doldurma (Madde A)** — `Tier: 1` — `downloader.py` (`setSpec` başlık ayrıştırması) ve `cleaner.py` (`article_url`, `pdf_url` ve DOI fallback) modülleri güncellendi, 9/9 Python ve 11/11 TS testi yeşil geçti. `scripts/backfill_dergipark_urls.py` ile veritabanındaki 131.127 makalenin 126.953 adedine (%96.82) doğrudan DergiPark iniş URL'si ve kalıcı DOI linki atandı. Walkthrough: [`docs/walkthroughs/dergipark-url-esleme-ve-geriye-donuk-doldurma-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/dergipark-url-esleme-ve-geriye-donuk-doldurma-walkthrough.md).

- [x] **Atıl Beceri Seti Temizliği ve Ortam Konsolidasyonu** — `Tier: 1` — `.agents/skills/` altındaki Eylül 2024 tarihli 15 atıl/şablon beceri (`grill-me`, `to-spec`, `triage`, `handoff` vb.) `ledger/legacy-skills/` dizinine arşivlendi; aktif çekirdek 16 beceri korundu. `rules/failure-checklist.md` ve `rules/task-discipline.md` çapraz referansları güncellendi. `~/.gemini/config/skills/` ve `~/.gemini/skills/` altındaki 30 mükerrer eski kopya arşivlenerek prompt context budget limits aşımı engellendi ve eklenti standardı sağlandı. Walkthrough: [`docs/walkthroughs/beceri-seti-temizligi-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/beceri-seti-temizligi-walkthrough.md).

- [x] **Boru Hattı Entegrasyonu ve İşçi CLI Daemon'ı (Faz 4)** — `Tier: 1` — `ControlRouter` HTTP REST yönlendiricisi (`/api/v1/control/jobs`, `/api/v1/control/sources`, `/api/v1/control/leases/reap`), `scripts/run-worker.ts` bağımsız işçi CLI daemon'ı (`npm run worker`), `package.json` CLI betiği ve 5 HTTP REST birim testi (954/954 test yeşil) tam başarıyla tamamlandı. Walkthrough: [`docs/walkthroughs/boru-hatti-ve-isci-daemon-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/boru-hatti-ve-isci-daemon-walkthrough.md).

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
