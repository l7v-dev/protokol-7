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

- [x] **DergiPark Tam Metin PDF İndirme ve Markdown Çıkarma Hattı (Madde D)** — `Tier: 1` — `pdf_extractor.py` (PyMuPDF ile Türkçe diyakritik korumalı tam metin çıkarıcı, sayfa etiketleyici, 50MB sınır koruyucu ve `ThreadSafeRateLimiter`), `ledger.py` (dinamik SQLite migrasyonu, `pdf_status`, `pdf_direct_url`, `page_count` alanları ve `pdf_stat` gruplamalı istatistik raporu), `fulltext_packer.py` (Zstandard seviye 6 Parquet sharder) ve `fulltext_runner.py` (paralel çoklu iş parçacıklı çıkarma orkestratörü) kuruldu. 18/18 Python, 22/22 TS testi ve canlı test yeşil geçti. Walkthrough: [`docs/walkthroughs/dergipark-tam-metin-pdf-cikarma-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/dergipark-tam-metin-pdf-cikarma-walkthrough.md).

- [x] **DergiPark V3 Kontrol Düzlemi Kaynak Tanımlayıcı Entegrasyonu (Madde C)** — `Tier: 1` — `contracts/source-descriptors/dergipark.json` (JSON Schema uyumlu) ve `contracts/field-mappings/dergipark.json` sözleşmeleri oluşturuldu. `dergipark-harvest-handler.ts` işleyici modülü kurularak `scripts/run-worker.ts` işçi daemon'ına entegre edildi. `scripts/register-source.ts` CLI aracı ile kaynak kaydı ve tarih bölüm işlerinin kuyruklanması tamamlandı. 8/8 contracts, 3/3 worker, 11/11 actor ve 12/12 pipeline testi yeşil geçti. Walkthrough: [`docs/walkthroughs/dergipark-v3-kontrol-duzlemi-entegrasyon-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/dergipark-v3-kontrol-duzlemi-entegrasyon-walkthrough.md).

- [x] **DergiPark Tarih ve Kapsam Bölümlemeli Toplama (Madde B)** — `Tier: 1` — DergiPark'ın 131K sınırını aşarak 800K+ külliyatına ulaşmak için `partitioner.py` (tarih yoğunluğuna duyarlı pencere üreteci), `ledger.py` (`dergipark_partitions` ACID durum tablosu, ilerleme takibi ve bellek içi tekilleştirme) ve `orchestrator.py` (`--auto-partition`, `--status`) modülleri kuruldu. 12/12 Python ve 11/11 TS testleri yeşil geçti. Walkthrough: [`docs/walkthroughs/dergipark-bolumlemeli-toplama-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/dergipark-bolumlemeli-toplama-walkthrough.md).

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
