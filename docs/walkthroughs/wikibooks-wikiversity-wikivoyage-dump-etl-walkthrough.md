# Wikibooks, Wikiversity ve Wikivoyage Sıfır Disk Artığı Dump ETL Boru Hatları — Walkthrough

## 1. Genel Bakış ve Amaç
Bu çalışma, Wikimedia Vakfı'nın eğitim ve seyahat korpusları olan **Wikibooks** (122 dil sürümü), **Wikiversity** (17 dil sürümü) ve **Wikivoyage** (27 dil sürümü) için sıfır disk artığı (Zero Disk Residue) garantili, akış tabanlı ve doğrudan Google Drive v3 entegrasyonlu ETL boru hatlarının inşasını ve arka plan çalıştırmasını kapsar.

## 2. Mimari Bileşenler ve Tasarım İlkeleri

### A. Donanım ve Bellek Optimizasyonu (4 GB RAM Tavanı)
Kullanıcı direktifi doğrultusunda 1 GB kısıtlamasından 4 GB RAM mimarisine geçilmiş, parametreler yüksek bellek ve I/O hızına göre optimize edilmiştir:
- **Batch Boyutu**: `50,000` satır (Arrow RowGroup tamponlaması ile yüksek sıkıştırma verimi).
- **Parquet Parça Tavanı**: `4 * 1024 * 1024 * 1024` (4 GB parça sınırı).
- **Drive Yükleme Çapı**: `64 MB` (Resumable upload chunksize).
- **İndirme Soket Tamponu**: `4 MB` (Wikimedia bz2 akış tamponu).
- **Sıkıştırma**: Zstandard seviye 3 (`zstd-3`).

### B. Boru Hatları Detayı

| Boru Hattı | Dizin | Aktif Dil Sayısı | Parquet Şeması | Google Drive Hedef Klasörü |
|---|---|---|---|---|
| **Wikibooks** | `scripts/wikibooks_pipeline/` | 122 | `article_id`, `title`, `lang`, `text`, `raw_length`, `clean_length`, `url`, `timestamp` | `Wikibooks/<lang>/` |
| **Wikiversity** | `scripts/wikiversity_pipeline/` | 17 | `article_id`, `title`, `lang`, `text`, `raw_length`, `clean_length`, `url`, `timestamp` | `Wikiversity/<lang>/` |
| **Wikivoyage** | `scripts/wikivoyage_pipeline/` | 27 | `article_id`, `title`, `lang`, `text`, `raw_length`, `clean_length`, `url`, `timestamp` | `Wikivoyage/<lang>/` |

### C. Sıfır Disk Artığı Garantisi
Her bir dilin `.xml.bz2` dump arşivi indirilir, bellek içinde ayrıştırılır ve Zstandard Parquet üretildiği anda dump silinir. Parquet dosyası Google Drive'a parça parça yüklendikten ve yerel dosyanın MD5 özeti Google Drive `md5Checksum` ile tam eşleştikten sonra yerel Parquet diski sıfır artıkla silinir.

### D. Sıralı Ana Koordinatör (`scripts/run_all_wikimedia_pipelines.py`)
Google Drive API 429 kota aşımlarını ve disk I/O yarışmalarını engellemek amacıyla ana orkestratör boru hatlarını sırasıyla yürütür:
1. `Wikibooks` (122 dil)
2. `Wikiversity` (17 dil)
3. `Wikivoyage` (27 dil)

## 3. Doğrulama ve Test Sonuçları

### Birim Testleri
Boru hatları için 15 özel birim ve entegrasyon testi yazılmış ve `npm run test:wikimedia` ile doğrulanmıştır:
- `scripts/wikibooks_pipeline/test_wikibooks_pipeline.py`: 5 test (Başarılı)
- `scripts/wikiversity_pipeline/test_wikiversity_pipeline.py`: 5 test (Başarılı)
- `scripts/wikivoyage_pipeline/test_wikivoyage_pipeline.py`: 5 test (Başarılı)

```text
> protokol-7@1.0.0 test:wikimedia
Ran 5 tests in 0.059s - OK (Wikibooks)
Ran 5 tests in 0.060s - OK (Wikiversity)
Ran 5 tests in 0.062s - OK (Wikivoyage)
```

### Canlı Kuru Çalıştırma (Dry-Run) Doğrulaması
Koordinatör aracılığıyla `angwikibooks`, `arwikiversity` ve `bnwikivoyage` üzerinde gerçek Wikimedia sunucularından dump indirme, temizleme, Zstd Parquet üretme, Google Drive klasör ağacı (`Wikibooks/`, `Wikiversity/`, `Wikivoyage/`) açma, MD5 kriptografik doğrulama ve yerel temizleme test edilmiştir:
- `angwikibooks`: 50 madde -> Drive ID `1dY3WBvlgMCqrU-Vye7wP10H__j-pTuUX`, MD5 doğrulandı, yerel dosya temizlendi.
- `arwikiversity`: 50 madde -> Drive ID `1GwxJj8bpYF_WdUDVnhisGVHBnKeDZ73D`, MD5 doğrulandı, yerel dosya temizlendi.
- `bnwikivoyage`: 50 madde -> Drive ID `1_thd-rvUYSLhDmKZ1vsOPQ9RLhskndZX`, MD5 doğrulandı, yerel dosya temizlendi.
Test sonrası katalog kayıtları sıfırlanarak tam üretime hazır hale getirilmiştir.

## 4. Kullanım ve Komutlar
```bash
# Tüm boru hatlarının güncel ilerleme durumunu göster:
npm run wikimedia:all:pipeline -- --status

# Boru hatlarını tek tek veya topluca çalıştırma:
npm run wikibooks:pipeline -- --all
npm run wikiversity:pipeline -- --all
npm run wikivoyage:pipeline -- --all
npm run wikimedia:all:pipeline
```
