# Binance Vision Public Data Boru Hattı ve Çekirdek Aktör Entegrasyonu Walkthrough

Bu doküman; Binance Vision Public Data havuzunun (`https://data.binance.vision/`, Amazon S3 `data.binance.vision`) Spot ve Vadeli İşlemler (Futures UM/CM) piyasalarına ait kline (OHLCV), trade ve aggTrade verilerini sıfır yerel disk artığıyla (`archive_then_delete`, doğrudan bellek içi akış ve Google Drive yüklemesi sonrası yerel temizleme) çekmek üzere kurulan boru hattını, ilişkisel SQLite katalog defterini, TypeScript mikroservis aktörünü ve sistem sözleşmelerini belgeler.

---

## 1. Uygulanan Mimari Bileşenler

### Kontrol Düzlemi Sözleşmeleri (`contracts/`)
- [`contracts/source-descriptors/binance-vision.json`](file:///home/l7v/l7v-dev/play/protokol-7/contracts/source-descriptors/binance-vision.json): Kaynak tanımlayıcı sözleşmesi (`source_id: binance-vision`, `method: http`, `record_type: financial_timeseries_record`, `budget: 10 TB / 7 gün`, `rights_status: approved`).
- [`contracts/field-mappings/binance-vision.json`](file:///home/l7v/l7v-dev/play/protokol-7/contracts/field-mappings/binance-vision.json): Kline OHLCV ve trade CSV alanlarının standart modelle eşlenmesi (`open_time`, `open`, `high`, `low`, `close`, `volume`, `quote_asset_volume`, `number_of_trades`, `taker_buy_base_asset_volume`, `taker_buy_quote_asset_volume`).

### Python Akış ve Çıkarım Boru Hattı (`pipelines/api_stream/binance_vision/`)
- [`downloader.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/binance_vision/downloader.py): `BinanceVisionDownloader`
  - Amazon S3 `ListBucket` XML tarayıcısı (`crawl_prefix`, sayfalama ve marker takibi).
  - Streaming ZIP indirme ve resmi `.CHECKSUM` dosyası üzerinden SHA-256 kriptografik doğrulama.
  - `certifi` CA desteği ve üssel geri çekilme (exponential backoff) ile dayanıklı HTTP istemcisi.
- [`cleaner.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/binance_vision/cleaner.py): `BinanceVisionCleaner`
  - Bellek içi ZIP açma (`zipfile.ZipFile(io.BytesIO)`) ile disk üzerinde ham dosya artığı bırakmadan CSV ayrıştırma.
  - Tip güvenli PyArrow Table (`KLINE_PYARROW_SCHEMA`, `TRADE_PYARROW_SCHEMA`, `AGG_TRADE_PYARROW_SCHEMA`) dönüşümü.
- [`ledger.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/binance_vision/ledger.py): `BinanceVisionLedger`
  - `data/catalogs/binance_catalog.sqlite`: `binance_files`, `binance_partitions`, `shards` tabloları ve WAL modunda ACID işlem takibi.
  - `BaseLedger` uyumlu `register_shard`, `mark_shard_uploaded` ve merkezi `data/catalog.sqlite` çift yönlü senkronizasyonu.
- [`packer.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/binance_vision/packer.py): `BinanceVisionParquetSharder`
  - PyArrow tablolarını Zstandard seviye 6 ile sıkıştırılmış Parquet shard'larına dönüştürme ve uzak doğrulama için MD5 özeti hesaplama.
- [`drive_sync.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/binance_vision/drive_sync.py): `BinanceVisionDriveSync`
  - Google Drive `Binance/{market}/{dataType}` hiyerarşisine yükleme, MD5 sağlama doğrulaması ve `purge_on_success=True` ile yerel Parquet artıklarını silme.
- [`orchestrator.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/binance_vision/orchestrator.py): `BinanceVisionOrchestrator`
  - Çok parametreli CLI orkestratörü (`--market`, `--type`, `--symbols`, `--interval`, `--period`, `--max-files`, `--no-drive`, `--dry-run`, `--status`).
- [`test_binance_vision_pipeline.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/binance_vision/test_binance_vision_pipeline.py): 7 adet izole birim ve mock entegrasyon testi.

### TypeScript Mikroservis Aktörü
- [`src/actors/corpus/binance-vision-actor.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/corpus/binance-vision-actor.ts): `BinanceVisionActor`
  - `list_files`: S3 XML bucket sorgulama, ZIP dosyası listeleme, doğrudan indirme bağlantıları ve GFM Markdown tablosu üretimi.
  - `list_symbols`: Belirli piyasa ve frekans altındaki sembol dizinlerini listeleme.
  - `get_file_info`: Belirli bir arşiv dosyasının boyut ve checksum bilgilerini getirme.
  - SSRF güvenliği (`SSRFGuard.validateUrlWithDns`, `safeRedirectFetch`).
- [`src/api/types.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/api/types.ts): `ActorType` union'ına `"binance-vision"`, `BinanceVisionFileItem`, `BinanceVisionKlineItem`, `BinanceVisionActorTaskOptions`, `BinanceVisionActorResult` tipleri eklendi.
- [`src/actors/actor-manifests.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/actor-manifests.ts): `binance-vision` manifesti ve `query_binance_vision` MCP araç sözleşmesi kaydedildi.
- [`src/actors/actor-registry.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/actor-registry.ts): `BinanceVisionActor` çekirdek kayıt defterine bağlandı.
- [`src/api/server.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/api/server.ts): `POST /api/v1/binance-vision` ve `POST /binance-vision` HTTP uç noktaları kuruldu.
- [`src/mcp/protokol-mcp-server.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/mcp/protokol-mcp-server.ts): `query_binance_vision` çağrılarının aktöre yönlendirilmesi sağlandı.

---

## 2. Doğrulama Sonuçları

### 1. TypeScript Birim & REST Entegrasyon Testleri
```bash
npx tsx --test tests/binance-vision-actor.test.ts
```
- `BinanceVisionActor list_files action queries S3 and formats markdown` (PASS)
- `BinanceVisionActor list_symbols action queries CommonPrefixes` (PASS)
- `BinanceVisionActor get_file_info action returns specific metadata` (PASS)
- `Server REST endpoint POST /api/v1/binance-vision returns 200 with structured response` (PASS)
- **Sonuç:** 4 test geçti, 0 hata.

### 2. Sözleşmeler Doğrulama Testleri
```bash
npx tsx --test tests/contracts.test.ts
```
- `contracts/source-descriptors/binance-vision.json` JSON Schema doğrulaması (PASS)
- `contracts/field-mappings/binance-vision.json` alan eşleme doğrulaması (PASS)
- **Sonuç:** 12 test geçti, 0 hata.

### 3. Python Akış Boru Hattı Testleri
```bash
.venv/bin/python -m unittest pipelines/api_stream/binance_vision/test_binance_vision_pipeline.py
```
- `test_cleaner_klines` (PASS)
- `test_cleaner_trades` (PASS)
- `test_cleaner_agg_trades` (PASS)
- `test_ledger_flow` (PASS)
- `test_sharder_write` (PASS)
- `test_downloader_xml_parsing` (PASS)
- `test_orchestrator_mocked_run` (PASS)
- **Sonuç:** 7 test geçti, 0 hata.

### 4. Canlı S3 Pilot Çekim Testi
```bash
.venv/bin/python pipelines/api_stream/binance_vision/orchestrator.py --market spot --type klines --symbols BTCUSDT --interval 1d --max-files 1 --no-drive
```
- S3 `data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2017-08.zip` ve `.CHECKSUM` başarıyla indirildi.
- SHA-256 kriptografik sağlaması doğrulandı.
- Ham dosya diske yazılmadan bellek içinde açılıp 15 mumluk PyArrow tablosuna çevrildi ve Zstd Parquet formatında kaydedildi.
- Yerel diskte hiçbir ZIP/CSV artığı kalmadığı doğrulandı.

### 5. Deterministik 6 Katmanlı Doğrulama Hattı
```bash
npm run verify
```
- [1/6] Mimari Dosya Bütünlüğü (OK)
- [2/6] İsimlendirme ve Dokümantasyon Disiplini (OK)
- [3/6] Loglama Disiplini (Sıfır Emoji) (OK)
- [4/6] Gizli Anahtar Taraması (OK)
- [5/6] Bağımlılık ve Paket Halüsinasyonu (SCA) (OK)
- [6/6] Kod Stili ve Statik Analiz (Biome Lint) (OK)
- **[PASS] DOĞRULAMA BAŞARILI.**
