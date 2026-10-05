# Wikibooks, Wikiversity ve Wikivoyage Sıfır Disk Artığı Dump ETL Boru Hatları Planı

## 1. Mimari Genel Bakış
Wikimedia Vakfı'nın eğitim, akademik ve coğrafi bilgi projeleri olan Wikibooks (122 dil), Wikiversity (17 dil) ve Wikivoyage (27 dil) külliyatının tamamını resmi XML bz2 dump arşivlerinden çekip temizleyen, Zstandard Parquet formatında paketleyen ve Google Drive v3'e yükledikten sonra yerel diskteki tüm geçici dosyaları anında imha eden (Zero Disk Residue) otonom ETL boru hatlarıdır.

## 2. Boru Hattı Yapıları
- `scripts/wikibooks_pipeline/`:
  - `downloader.py`: Wikimedia dump aynalarından `<db>-latest-pages-articles.xml.bz2` indirmesi (4 MB socket buffer).
  - `cleaner.py`: Açık ders kitapları ve teknik kılavuzlar için bölüm hiyerarşisi, kod blokları ve anlatım metinlerini ayıklayan akış temizleyicisi.
  - `packer.py`: 50.000 satırlık bellek içi tampon (In-Memory Batch) ile Zstandard Parquet sharder.
  - `drive_sync.py`: Google Drive `Wikibooks/<lang>/` klasörüne yükleme, MD5 doğrulama ve anında yerel silme.
  - `orchestrator.py`: SQLite defteri (`data/wikibooks_catalog.sqlite`) ile 122 dili işleten orkestratör.

- `scripts/wikiversity_pipeline/`:
  - `downloader.py`, `cleaner.py`, `packer.py`, `drive_sync.py`, `orchestrator.py`:
  - Üniversite düzeyinde ders modülleri ve akademik araştırma projeleri için temizlik kuralları.
  - Target Drive folder: `Wikiversity/<lang>/`.
  - SQLite defteri: `data/wikiversity_catalog.sqlite` (17 dil).

- `scripts/wikivoyage_pipeline/`:
  - `downloader.py`, `cleaner.py`, `packer.py`, `drive_sync.py`, `orchestrator.py`:
  - Şehirler, rotalar, kültürel ve lojistik rehberler için geo-etiketler ve anlatım metinleri ayıklaması.
  - Target Drive folder: `Wikivoyage/<lang>/`.
  - SQLite defteri: `data/wikivoyage_catalog.sqlite` (27 dil).

## 3. Bellek ve Performans Parametreleri (4 GB RAM Bütçesi)
- Soket İndirme Tamponu: 4 MB (`chunk_size = 4194304`).
- Bellek İçi Yığın (In-Memory Batch): 50.000 satır (~1.5 - 2 GB RAM).
- Zstandard Sıkıştırma Seviyesi: Level 3 (Fast, CPU darboğazı yok).
- Google Drive Yükleme Parça Boyutu: 64 MB (`chunksize = 67108864`).
- Parquet Parça Tavanı: 4.0 GB.

## 4. Doğrulama Kapıları
- Birim testleri: `test_wikibooks_pipeline.py`, `test_wikiversity_pipeline.py`, `test_wikivoyage_pipeline.py`.
- Linter ve kod stili kontrolleri (`biome check`, `npm run typecheck`).
- Arka planda kesintisiz ve otonom yürütme.
