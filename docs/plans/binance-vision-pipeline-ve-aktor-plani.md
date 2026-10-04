# Binance Vision Public Data Boru Hatti ve Cekirdek Aktor Mimarisi Plani

Bu plan; Binance Public Data havuzunun (`https://data.binance.vision/`, Amazon S3 `data.binance.vision`) Spot, Vadeli Islemler (Futures UM/CM) ve Opsiyon piyasalarina ait tarihsel kline, trade ve aggTrade verilerini sifir yerel disk artigiyla (`archive_then_delete`, yerel ZIP/CSV silinip Zstd Parquet olarak Google Drive'a aktarilarak) cekilmesini saglayan yuksek verimli akis boru hattini (`pipelines/api_stream/binance_vision/`), iliskisel SQLite katalog defterini (`data/catalogs/binance_catalog.sqlite`), Google Drive senkronizasyonunu, TypeScript mikroservis aktorunu (`BinanceVisionActor`, `POST /api/v1/binance-vision`, `query_binance_vision` MCP araci), sistem sozlesmelerini (`contracts/`) ve tam dogrulama testlerini tanimlar.

---

## 1. Hedef Platform Analizi ve Teknik Parametreler

1. **Platform Kimligi:**
   - **Hedef:** Binance Public Data Repository (Binance Vision)
   - **Altyapi:** Amazon S3 / CloudFront CDN (`s3-ap-northeast-1.amazonaws.com/data.binance.vision`).
   - **Web Arayuzu:** `https://data.binance.vision/`
   - **Resmi Repo:** `https://github.com/binance/binance-public-data/`
   - **Toplam Hacim Uyarisi:** Tum semboller ve tum tick-by-tick veriler (2017'den gunumuze tum trades/aggTrades) **50 - 100+ TB** duzeyindedir. Bu nedenle boru hatti bolumlemeli (partitioned), oncelikli ve secilebilir segmentasyon mimarisiyle tasarlanmalidir.

2. **Veri Hiyerarsisi ve Erisim Formati:**
   - **Dizin Yapisi:**
     - `data/spot/{monthly|daily}/{klines|trades|aggTrades}/{symbol}/{interval}/...`
     - `data/futures/um/{monthly|daily}/{klines|trades|aggTrades|fundingRate}/...`
     - `data/futures/cm/{monthly|daily}/...`
   - **S3 API:**
     - `GET https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?prefix={prefix}&delimiter=/` (veya `marker={marker}` ile sayfalamali XML).
   - **Dosya Formati:**
     - `{symbol}-{interval}-{year}-{month}.zip` (Ornek: `BTCUSDT-1d-2026-08.zip`)
     - `{file}.zip.CHECKSUM` (Resmi SHA-256 saglama toplami dosyasi).
     - ZIP icinde basliksiz veya standart baslikli ham CSV verisi.

3. **Guven Kademesi (Trust Tier):**
   - **Tier 1 (Oneri ve Izole Taslak):** Yeni modul ve dosya olusturma, izole boru hatti ve aktor entegrasyonu.

---

## 2. Mimari Prensipler ve Degismezler (Invariants)

1. **Sifir Yerel Disk Artigi (Zero Disk Residue):**
   - Indirilen ZIP dosyalari ve acilan CSV'ler yalnizca bellek ici (in-memory `io.BytesIO` / `zipfile.ZipFile`) veya gecici tamponda islenir.
   - Ham CSV kayitlari Zstandard seviye 6 ile sikistirilmis Parquet dosyalarina (`data/parquets/binance/`) paketlenir.
   - Parquet shard'i Google Drive `Binance/` hedef klasorune yuklendikten ve uzak MD5 dogrulandiktan sonra yerel dosyalar derhal silinir (`purge_on_success=True`). Ham ZIP dosyalari asla diskte biriktirilmez.

2. **Kriptografik Dogrulama (Cryptographic Verification):**
   - Her indirilen ZIP dosyasi, Binance'in resmi `.CHECKSUM` (SHA-256) dosyasi ile karsilastirilir.
   - Bozuk veya eksik inen dosyalar asla Parquet'ye donusturulmez, derhal yeniden indirilir.

3. **Kataloglama ve Resumption Disiplini:**
   - S3 uzerindeki tum dosya anahtarlari once `binance_files` tablosuna indekslenir (`pending`).
   - SQLite uzerinde `downloaded`, `extracted`, `sharded`, `uploaded` durumlari ACID olarak takip edilir; kesinti aninda kalinan yerden devam edilir.

---

## 3. Uygulama Adimlari

### Faz 1: Kontrol Duzlemi Sozlesmeleri ve Tanimlayicilar
- [ ] `contracts/source-descriptors/binance-vision.json`: Kaynak tanimlayici sozlesmesi (`source_id: binance_vision`, `method: http`, `budget`, `rights_status: approved`, `purpose: Financial Timeseries & LLM Quantitative Reasoning Corpus`).
- [ ] `contracts/field-mappings/binance-vision.json`: Kline ve trade CSV alanlarinin (open, high, low, close, volume, timestamp vb.) standart semaya haritalanmasi.

### Faz 2: Python Akis Boru Hatti (`pipelines/api_stream/binance_vision/`)
- [ ] `downloader.py`: `BinanceVisionDownloader`
  - S3 XML Bucket API (`ListBucket`) tarayicisi ve dosya URL'leri kesfedicisi.
  - Streaming ZIP ve `.CHECKSUM` indirmesi, SHA-256 dogrulamasi.
  - HTTP 429/503 durumlarinda ussel geri cekilme.
- [ ] `cleaner.py`: `BinanceVisionCleaner`
  - Kline (OHLCV) ve Trade CSV satirlarinin PyArrow semalarina donusturulmesi ve tip donusumleri (int64 timestamp, double float fiyat/hacim).
- [ ] `ledger.py`: `BinanceVisionLedger`
  - `data/catalogs/binance_catalog.sqlite`: `binance_files`, `binance_partitions`, `shards` tablolari, ACID takibi.
- [ ] `packer.py`: `BinanceVisionParquetSharder`
  - 50.000 - 100.000 mum/trade kaydinda veya 512 MB esiginde Zstandard Parquet sharder.
- [ ] `drive_sync.py`: `BinanceVisionDriveSync`
  - Google Drive `Binance/` klasorune aktarim, MD5 dogrulamasi ve yerel dosya temizligi.
- [ ] `orchestrator.py`: `BinanceVisionOrchestrator`
  - CLI arayuzu (`--market spot|futures_um|futures_cm`, `--type klines|trades|aggTrades`, `--symbols BTCUSDT,ETHUSDT|all`, `--interval 1d|1h|1m`, `--status`, `--dry-run`).
- [ ] `test_binance_vision_pipeline.py`: Python birim ve mock entegrasyon testleri.

### Faz 3: TypeScript Mikroservis Aktoru ve Sistem Entegrasyonlari
- [ ] `src/actors/corpus/binance-vision-actor.ts`: `BinanceVisionActor` implementasyonu (S3 dosya arama, sembol kline ozeti alma, GFM Markdown formatlama).
- [ ] `src/actors/corpus/domains/academic.ts` (veya `financial`): Aktor ihraci.
- [ ] `src/actors/actor-manifests.ts`: `binance-vision` manifesti ve `query_binance_vision` MCP tanimi.
- [ ] `src/actors/actor-registry.ts`: `BinanceVisionActor` kaydi.
- [ ] `src/api/server.ts`: `POST /api/v1/binance-vision` ve `POST /binance-vision` HTTP rotalari.
- [ ] `src/mcp/protokol-mcp-server.ts`: `query_binance_vision` MCP arac yonlendirmesi.
- [ ] `tests/binance-vision-actor.test.ts`: TypeScript birim ve rota testleri.

### Faz 4: Yonetimsel Entegrasyonlar ve Veritabanı Haritalama
- [ ] `package.json`: `"binance-vision:pipeline"` ve test script'leri.
- [ ] `scripts/sync-dbx-connections.py`: `protokol-binance` baglantisinin dbx sistemine kaydedilmesi.
- [ ] `context/architecture-schema.md`: Yeni bilesenlerin semaya islenmesi.

### Faz 5: Dogrulama ve Pilot Calisma (Verification)
- [ ] Birim testlerinin kosturulmasi (`pytest` ve `tsx --test`).
- [ ] Kısıtlı pilot (ornek: BTCUSDT aylik 1d klines) ile gercek S3 indirmesi, SHA-256 dogrulamasi, Parquet paketlemesi ve sifir yerel disk artiginin test edilmesi.
- [ ] `npm run verify` calistirilarak 6 asamali dogrulama hattinin tamamlanmasi.
