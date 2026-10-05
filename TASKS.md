# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [ ] **Mimari yol haritası** — `Tier: 2` — `Blok: yok`
  - Bağlam: `docs/plans/mimari-analiz-airbyte-blueprint-2026-10.md` §15.
  - Kabul kriteri: Snapshot namespace atomik ayrılır ve artifact ezilmez; release beş kapı + manifest hash'ine bağlı reviewer kanıtı gerektirir; lineage/cursor/canonicalization arayüzleri ve ilgili testler, typecheck, npm run verify başarılıdır.
  - Durum: Faz 0 Compose doğrulandı, standart git gc tamamlandı. Remote feature/github-actions-wikipedia-etl birleşmiş, ancak GitHub varsayılan branch olduğu için silmeyi reddetti; main ve legacy korundu. Faz 1 beceriler, v1 şemalar, kaynak uzantıları, mimari belgeler ve ADR 0010 yazıldı. Faz 1 tamamlandı: 8 Python şema testi, 12 TS sözleşme testi, typecheck ve npm run verify başarılı; standards/spec incelemelerinde açık bulgu yok. Faz 2 uygulandı: 6 tablo, 9 kolon, atomik migration ve metadata-only OTel emitter. 63 TS regresyonu ve 8 Python şema testi geçti; inceleme bulgusu düzeltildi, typecheck ve npm run verify başarılı. Faz 2 tamamlandı. Canlı katalogda yeni tablolar olmadığı salt okunur doğrulandı; 4 Python pipeline çalışıyor ve durdurulmadı. Faz 3 kod uygulaması tamamlandı: atomik yayın namespace'i, immutable manifest, beş reviewer gate'i, kanıt URI'leri, gates/release/lineage REST yolları, occurrence/run bağları, normalizasyon politika sürümü, yerel stream cursor, tier prefix builder, Dataset Card ve statistics çıktıları eklendi. 83 TS testi, 2 cursor Python testi, typecheck ve npm run verify başarılı; iki eksenli inceleme bulguları kapatıldı. Canlı Faz 3 tabloları yok; migration ve Python üreticilerinin yeni provenance arayüzlerine geçirilmesi bakım penceresinde yapılacak. Faz 4 doğrudan uygulanabilir dört iş tamamlandı: OpenAlex metadata CDC, exact-hash train decontamination ve kalıcı quarantine/rapor receiptleri, TS/shared Python Parquet pii_status, opt-in collector. 75 TS, 9 CDC, 2 sharder ve 8 şema testi başarılı; typecheck geçti. Collector izole validate komutuyla doğrulandı; canlı API, collector başlatma veya katalog migration yapılmadı. Croissant/public yayın ve OpenLineage/ekip genişlemesi koşulları bekliyor; bağımsız eski packer geçişi bakım penceresine kaldı. Standards/spec incelemelerinde açık bulgu yok; npm run verify başarılı. 2026-10-05 canlı geçiş: kullanıcı OpenAlex sonraki işlerini kapsam dışı bıraktı. 0002–0004 canlı migration taze online backup ve prova sonrası uygulandı; integrity ok, FK ihlali 0. Collector ve read-only metadata exporter aktif; sentetik uçtan uca test geçti. 13 bağımsız non-OpenAlex packer typed pii_status alır; aktif Python importları restart bekler. Varsayılan GitHub branch main yapıldı ve birleşmiş feature branch temizlendi. Üreticilerin belge provenance/raw evidence geçişi ve güvenli süreç yeniden başlatma sıradaki iş; Binance asset ortasında zorla durdurulmayacak. Croissant/OpenLineage koşulları bekliyor. Son doğrulama: 80 TS ve 110 hedef Python testi, typecheck ve npm run verify geçti; iki incelemede açık kod bulgusu yok. Tam corpus suite inde mevcut pipeline_runs şema uyuşmazlığı ve duckdb eksikliği ayrı sorun olarak kaydedildi. Yerel codex/mimari-canli-gecis branch inde commit hazırlanıyor. Yürütme kaydı: docs/walkthroughs/mimari-faz-4-cdc-ve-veri-kapilari-walkthrough.md.

- [ ] **Hugging Face Veri Toplama ve Arşivleme (`huggingface`)** — `Tier: 1`
  - **Durum:** Kullanıcının Türkiye LLM araştırmasındaki 12 doğrudan dataset ve OttomanNLP kuruluşundaki 5 veri seti sabitlendi. Erişilebilir 15 kaynakta 565 dosya / 471.801.019.644 bayt keşfedildi. 30 dosyalık pilot Drive MD5/boyut doğrulamasıyla tamamlandı; kalan dosyalar arka planda tek işçi ve 25 GiB disk rezerviyle aktarılıyor.
  - **Süreç:** `.venv/bin/python -u pipelines/snapshot/huggingface/orchestrator.py run --min-free-disk-gb 25` (PID dosyası: `data/huggingface/runner.pid`).
  - **Takip:** `tail -f logs/huggingface.log`; durum: `.venv/bin/python pipelines/snapshot/huggingface/orchestrator.py status`.
  - **Arşiv:** Drive `protokol-object-vault/HuggingFace/`; katalog `data/huggingface/catalog.sqlite`; manifesto `data/huggingface/manifest.json`. Ham dosyalar korunuyor; normalizasyon yapılmadı.
  - **Erişim bekleyen:** `uonlp/CulturaX` ve `yagmurtuncer/turkasr-bench`, mevcut HF tokenı ile 403. Hesaba erişim verildikten sonra `discover` tekrar çalıştırılmalı.
  - **Doğrulama:** 10/10 Python testi, 30 dosya canlı pilot ve `npm run verify` başarılı. Yürütme kaydı: `docs/walkthroughs/huggingface-veri-toplama-walkthrough.md`.
  - **Plan:** [`docs/plans/huggingface-veri-toplama-plani.md`](docs/plans/huggingface-veri-toplama-plani.md).

- [ ] **DergiPark Tam Metin Çıkarımı ve Ham PDF Arşivleme Akışı (`dergipark`)** — `Tier: 1`
  - **Durum:** DergiPark kataloğundaki 131.127 makalenin tam metin PDF indirmesi, PyMuPDF Markdown katman çıkarımı, Zstandard Parquet sharder ve toleranslı çoklu-GB (10-50 GB, maks 51 GB) ham PDF TAR.GZ arşivleyici arka plan daemon'ı olarak yürütülüyor.
  - **Süreç:** `python -u pipelines/api_stream/dergipark/fulltext_runner.py --max-articles 0 --workers 2 --rate-limit 1.75 --batch-size 50 --max-shard-records 2000 --pdf-archive-gb 10.0 --max-pdf-archive-gb 51.0 --min-free-disk-gb 25.0`
  - **İlerleme:** Cloudflare 429 hız aşımı önlenerek 2 paralel işçi ve 1.75s nezaket aralığıyla kararlı baz hızına sabitlendi. ThreadSafeRateLimiter küresel soğuma desteğiyle tüm işçiler tek noktadan koordine ediliyor. Çıkarılan tam metinler Zstandard Parquet shard'larına, ham PDF ikilileri ise 10-50 GB'lık WebDataset TAR.GZ arşivlerine yazılıp doğrudan Google Drive'a aktarılıyor.
  - **Takip:** `tail -f logs/dergipark_fulltext.log`

- [ ] **DOAJ Canlı Tam Katalog Akışı ve Parquet Paketleme (`doaj`)** — `Tier: 1`
  - **Durum:** Canlı OAI-PMH servisi üzerinden tam DOAJ veritabanı (13,7M+ makale) arka plan daemon'ı olarak yürütülüyor.
  - **Süreç:** `python -u pipelines/api_stream/doaj/orchestrator.py --all --max-records 0 --batch-size 1000 --max-shard-records 50000 --shard-size-mb 512`
  - **İlerleme:** 3.100.000+ makale çekildi. ~35-40 rec/s akış hızıyla makaleler çekiliyor, `data/catalogs/doaj_catalog.sqlite` tablosuna ACID indeksleniyor, 50.000'er kayıtta veya 512 MB eşiğinde Zstandard Parquet shard'ları oluşturulup Google Drive `DOAJ/` klasörüne uzaktan MD5 doğrulamasıyla aktarılıyor ve yerel disk sıfırlanıyor.
  - **Takip:** `tail -f logs/doaj.log`

- [ ] **TÜBİTAK ULAKBİM Aperta Tam Depo & Çok Formatlı İkili Veri Arşivleme Akışı (`aperta`)** — `Tier: 1`
  - **Durum:** Canlı OAI-PMH MARCXML servisi üzerinden 91.188 kaydın tüm metadata'sı ile ilişkili tüm dosya formatlarının (PDF, TAR.GZ, ZIP, CSV, XLSX, DOCX, TXT vb.) indirilip 10-50 GB WebDataset TAR.GZ Cold Vault arşivleriyle Google Drive'a aktarılması arka planda eş zamanlı iki daemon olarak yürütülüyor.
  - **Süreç 1 (Metadata & Parquet Sharder):** `.venv/bin/python -u pipelines/api_stream/aperta/orchestrator.py --all --max-records 0 --metadata-prefix marcxml --batch-size 500 --max-shard-records 20000 --shard-size-mb 512`
  - **Süreç 2 (Çok Formatlı Varlık İndirici & TAR.GZ Arşivleyici):** `.venv/bin/python -u pipelines/api_stream/aperta/pdf_downloader.py --max-files 0 --continuous --target-gb 10.0 --max-gb 51.0 --rate-limit 0.8`
  - **İlerleme:** OAI-PMH MARCXML protokolü üzerinden tüm kayıtlar dosyalarıyla birlikte çekiliyor, `aperta_records` ve `aperta_files` tablolarına ACID yazılıyor. Parquet shard'ları Google Drive `Aperta/`, 10-50 GB TAR.GZ Cold Vault arşivleri ise `Aperta/Raw_Archives/` klasörüne aktarılıyor.
  - **Takip:** `tail -f logs/aperta.log` ve `tail -f logs/aperta_assets.log`



## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Sağlamlaştırma bekleyen görev bulunmuyor)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Binance Vision Public Data Boru Hattı ve Çekirdek Aktör Entegrasyonu (`binance-vision`)** — `Tier: 1` — Amazon S3 ListBucket XML akış tarayıcısı (`downloader.py`), resmi SHA-256 `.CHECKSUM` doğrulayıcısı, ham verilerin diskte tutulmadan bellek içi akışla PyArrow tablolarına dönüştürülmesi (`cleaner.py`), ACID SQLite katalog defteri (`data/catalogs/binance_catalog.sqlite`), Zstd Parquet sharder (`packer.py`), Google Drive'a aktarım sonrası yerel temizleme (`drive_sync.py`, `purge_on_success=True`), CLI orkestratörü (`orchestrator.py`), TypeScript mikroservis aktörü (`BinanceVisionActor`, `POST /api/v1/binance-vision`, `query_binance_vision` MCP aracı), `contracts/` şemaları ve dbx bağlantısı tamamlandı. 7/7 Python, 4/4 TS, 12/12 sözleşme testleri, canlı S3 pilot çekimi ve `npm run verify` tam doğrulama hattı başarıyla geçti. Walkthrough: [`docs/walkthroughs/binance-vision-pipeline-ve-aktor-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/binance-vision-pipeline-ve-aktor-walkthrough.md).

- [x] **TÜBİTAK ULAKBİM Aperta Boru Hattı, PDF Arşivleme ve Çekirdek Aktör Entegrasyonu (`aperta`)** — `Tier: 1` — OAI-PMH 2.0 streaming akışı (`downloader.py`), Invenio REST istemcisi, çift dilli bilim dalları ve dosya temizleyici (`cleaner.py`), ACID SQLite katalog tablosu (`data/catalogs/aperta_catalog.sqlite`), Zstd Parquet sharder (`packer.py`), ham PDF/veri ikililerinin silinmeden Google Drive'a aktarılmasını sağlayan 10-50 GB TAR.GZ Cold Vault archiver (`pdf_tar_packer.py`), asenkron PDF indirme ve arşivleme işçisi (`pdf_downloader.py`), Google Drive senkronizasyonu (`drive_sync.py`), CLI orkestratörü (`orchestrator.py`), TypeScript mikroservis aktörü (`ApertaActor`, `POST /api/v1/aperta`, `query_aperta` MCP aracı), `contracts/` şemaları ve dbx bağlantısı kuruldu. 11/11 Python, 4/4 TS, 10/10 sözleşme testleri ve `npm run verify` tam doğrulama hattı yeşil geçti. Walkthrough: [`docs/walkthroughs/aperta-pipeline-ve-aktor-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/aperta-pipeline-ve-aktor-walkthrough.md).



- [x] **DergiPark Tam Metin PDF İndirme ve Markdown Çıkarma Hattı (Madde D)** — `Tier: 1` — `pdf_extractor.py` (PyMuPDF ile Türkçe diyakritik korumalı tam metin çıkarıcı, sayfa etiketleyici, 50MB sınır koruyucu ve `ThreadSafeRateLimiter`), `ledger.py` (dinamik SQLite migrasyonu, `pdf_status`, `pdf_direct_url`, `page_count` alanları ve `pdf_stat` gruplamalı istatistik raporu), `fulltext_packer.py` (Zstandard seviye 6 Parquet sharder) ve `fulltext_runner.py` (paralel çoklu iş parçacıklı çıkarma orkestratörü) kuruldu. 18/18 Python, 22/22 TS testi ve canlı test yeşil geçti. Walkthrough: [`docs/walkthroughs/dergipark-tam-metin-pdf-cikarma-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/dergipark-tam-metin-pdf-cikarma-walkthrough.md).

- [x] **DergiPark V3 Kontrol Düzlemi Kaynak Tanımlayıcı Entegrasyonu (Madde C)** — `Tier: 1` — `contracts/source-descriptors/dergipark.json` (JSON Schema uyumlu) ve `contracts/field-mappings/dergipark.json` sözleşmeleri oluşturuldu. `dergipark-harvest-handler.ts` işleyici modülü kurularak `scripts/run-worker.ts` işçi daemon'ına entegre edildi. `scripts/register-source.ts` CLI aracı ile kaynak kaydı ve tarih bölüm işlerinin kuyruklanması tamamlandı. 8/8 contracts, 3/3 worker, 11/11 actor ve 12/12 pipeline testi yeşil geçti. Walkthrough: [`docs/walkthroughs/dergipark-v3-kontrol-duzlemi-entegrasyon-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/dergipark-v3-kontrol-duzlemi-entegrasyon-walkthrough.md).

- [x] **DergiPark Tarih ve Kapsam Bölümlemeli Toplama (Madde B)** — `Tier: 1` — DergiPark'ın 131K sınırını aşarak 800K+ külliyatına ulaşmak için `partitioner.py` (tarih yoğunluğuna duyarlı pencere üreteci), `ledger.py` (`dergipark_partitions` ACID durum tablosu, ilerleme takibi ve bellek içi tekilleştirme) ve `orchestrator.py` (`--auto-partition`, `--status`) modülleri kuruldu. 12/12 Python ve 11/11 TS testleri yeşil geçti. Walkthrough: [`docs/walkthroughs/dergipark-bolumlemeli-toplama-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/dergipark-bolumlemeli-toplama-walkthrough.md).

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
