# Walkthrough: Kapsamli Veri Cekme Yontemleri ve Kurumsal Moduler Mimari Donusumu

Bu dokuman, Protokol-7 projesinin 7 veri cekme yontemini (S3/GCS snapshot, buyuk arsiv dump'lari, REST/GraphQL API'leri, dinamik tarayici, statik ag kazima, kod/Git SCM ve cok modlu OCR/ses) tek bir kurumsal cati altinda birlestiren moduler mimari donusumunun dogrulama adimlarini kaydeder.

---

## 1. Mimari Degisiklik Ozeti

1. **`pipelines/` Birlesik ETL Dizin Hiyerarsisi:**
   - `pipelines/snapshot/openalex/`: AWS S3 Parquet snapshot akis hatti.
   - `pipelines/dump/wikimedia/`: 8 cok dilli Wikimedia dump hatti (`wikibooks`, `wikinews`, `wikiquote`, `wikispecies`, `wikisource`, `wikiversity`, `wikivoyage`, `wiktionary`) ve toplu calistiricilar (`runners/`).
   - `pipelines/dump/gutenberg/`: Project Gutenberg kitap ve gorsel WebDataset TAR.GZ ETL hatti.
   - `pipelines/dump/stackexchange/`: Archive.org 7z soru-cevap ETL hatti.
   - `pipelines/dump/corpus_pipeline/`: Genel metin korpusu Zstd Parquet boru hatti.
   - `pipelines/api_stream/openalex/`: Cursor sayfalamali REST API akis hatti.
   - `pipelines/api_stream/semantic_scholar/`: S2 Bulk Graph API ve PDF cikarim hatti.
   - `pipelines/multimodal/`: OCR ve video/ses transkript hatlari hazirlik altyapisi.

2. **Ortak Boru Hatti Cekirdegi (`pipelines/shared/`):**
   - `cleaner_base.py` (`BaseCleaner`, `clean_text`, `reconstruct_inverted_index`): Gürültü ve paratext temizleme, HTML entity cozme, ters indeks metin sentezleme.
   - `sharder_base.py` (`BaseParquetSharder`, `compute_file_hashes`): Zstandard sikistirmali akis Parquet paketleyici, SHA-256 ve MD5 saglama dogrulama.
   - `drive_sync_base.py` (`BaseDriveSync`, `calculate_md5`): Kesintisiz Google Drive v3 chunk yukleme, uzaktan MD5 dogrulama, sifir yerel disk artigi garantisi.
   - `ledger_base.py` (`BaseLedger`): SQLite WAL islemsel defter ve `data/catalog.sqlite` merkezi sicil cift-yonlu senkronizasyonu.
   - `test_shared_pipeline.py`: 9 birim testi ile %100 basarili dogrulama.

3. **Otomatik Boru Hatti Iskeleleme (`scripts/scaffold/scaffold-pipeline.py`):**
   - Tek komutla yeni ETL hatti ureten CLI araci (`npm run make:pipeline -- --category dump --name <ad>`).

4. **Geriye Donuk Uyumluluk ve Sembolik Kopruler (`scripts/`):**
   - Mevcut tum CLI komutlari ve dis cagricilar icin `scripts/` altinda goreceli sembolik linkler tanimlandi.
   - `package.json` script'leri birincil `pipelines/...` komutlariyla senkronize edildi.

5. **Korpus Aktor Alan Siniflandirmasi (`src/actors/corpus/domains/`):**
   - 59 korpus aktoru 5 semantik domain barrel'ina ayrildi:
     - `academic.ts`: Akademik literatur ve klinik veriler (11 aktor).
     - `legal.ts`: Yargi kararlari, kanunlar ve patentler (9 aktor).
     - `reasoning-code.ts`: Kod, mantik ve muhakeme (12 aktor).
     - `wikimedia.ts`: Wikimedia kardes projeleri (11 aktor).
     - `philosophy-humanities.ts`: Felsefe, egitim ve kisisel veri/medya (15 aktor).
   - `src/actors/corpus/index.ts` uzerinden `CorpusDomains` adiyla re-export saglandi.

---

## 2. Dogrulama Sonuclari

### 2.1. Python Birlesik ETL Birim Testleri
```text
> npm run test:corpus-pipelines
- Gutenberg Pipeline: 14 test [PASS]
- StackExchange Pipeline: 12 test [PASS]
- OpenAlex API Pipeline: 18 test [PASS]
- OpenAlex S3 Snapshot Pipeline: 8 test [PASS]
- Semantic Scholar Pipeline: 32 test [PASS]
- Shared Pipeline Components: 9 test [PASS]
Toplam: 93 test PASSED (0 failures)
```

```text
> npm run test:wikimedia
- Wikibooks: 5 test [PASS]
- Wikiversity: 5 test [PASS]
- Wikivoyage: 5 test [PASS]
- Wikisource: 5 test [PASS]
- Wiktionary: 5 test [PASS]
Toplam: 25 test PASSED (0 failures)
```

```text
> npm run test:news-species
- Wikinews: 5 test [PASS]
- Wikispecies: 5 test [PASS]
Toplam: 10 test PASSED (0 failures)
```

```text
> npm run test:wikiquote
- Wikiquote: 5 test [PASS]
Toplam: 5 test PASSED (0 failures)
```

### 2.2. TypeScript Birim ve Entegrasyon Testleri
```text
> npm test
ℹ tests 902
ℹ suites 195
ℹ pass 902
ℹ fail 0
ℹ duration_ms ~28000ms
```

### 2.3. Deterministik Dogrulama Hatti (`npm run verify`)
```text
=== PROTOKOL-7 DETERMINISTIK DOGRULAMA HATTI ===
[1/6] Mimari Dosya Butunlugu: [OK]
[2/6] Isimlendirme ve Dokumantasyon Disiplini: [OK]
[3/6] Loglama Disiplini (Sifir Emoji): [OK]
[4/6] Gizli Anahtar Taramasi: [OK]
[5/6] Bagimlilik ve SCA Denetimi: [PASS] (11/11 paket dogrulandi)
[6/6] Kod Stili ve Biome Lint: [OK] (329 dosya hatasiz)
[PASS] DOGRULAMA BASARILI
```
