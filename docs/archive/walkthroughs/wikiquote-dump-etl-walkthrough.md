# Wikiquote 100 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı Walkthrough

## 1. Görev Özeti
Wikiquote (Vikisöz) külliyatının 100 dünya dili için sıfır disk artığı (Zero Disk Residue) ile çalışan otonom dump ETL boru hattı inşa edildi. 4 GB RAM bellek tamponu ve yüksek hızlı I/O ayarlarıyla optimize edilen sistem, 99 aktif dünya dilini (~20 dakika içerisinde) tamamen işleyerek 419.975 maddeyi 505.34 MB Zstandard Parquet halinde Google Drive v3'e yüklemiş ve MD5 doğrulamasıyla yerel dosyaları anında temizlemiştir.

## 2. Mimari Bileşenler
- `scripts/wikiquote_pipeline/downloader.py`: Wikimedia dump aynalarından 4 MB soket tamponu ile kesintiye dayanıklı akış indirmesi.
- `scripts/wikiquote_pipeline/cleaner.py`: `xml.etree.ElementTree.iterparse` ile O(1) streaming XML bz2 ayrıştırması; şablon, kategori, medya, HTML ayıklaması ve temiz GFM alıntı dönüşümü.
- `scripts/wikiquote_pipeline/packer.py`: 50.000 satırlık bellek içi tampon (In-Memory Batch, ~1.5 - 2 GB RAM) ve 4.0 GB parça tavanıyla Zstandard (lvl 3) Parquet sharder.
- `scripts/wikiquote_pipeline/drive_sync.py`: Google Drive v3 API üzerinden `Wikiquote/<lang>/` klasörleme, 64 MB upload parçalama, MD5 sağlama toplamı eşleştirme ve yerel dosyaları anında silme (`Zero Disk Residue`).
- `scripts/wikiquote_pipeline/orchestrator.py`: SQLite defteri (`data/wikiquote_catalog.sqlite`) ile 100 dili sırayla işleten ve durum takibi yapan ana orkestratör.

## 3. Doğrulama ve Test Sonuçları
- `npm run test:wikiquote`: 5 birim ve entegrasyon testi 0.06 saniyede başarıyla geçti.
- Kuru test: `angwikiquote` (Eski İngilizce) başarıyla tamamlandı.
- Tam külliyat hasadı:
  - Toplam İşlenen Dil: 99 dil (1 dil HTTP 404 kapalı alt proje olarak atlandı).
  - Toplam Temizlenen Madde: 419.975 madde.
  - Toplam Parquet Hacmi: 505.34 MB.
  - Google Drive Yükleme & MD5 Doğrulama: %100 başarılı.
  - Yerel Disk Artığı: 0 bayt (tüm geçici bz2 ve Parquet dosyaları silindi).

### Örnek Dil Metrikleri
- Türkçe (`trwikiquote`): 6.372 madde, 5.38 MB Parquet, Drive File ID: `1OqSb1umiaczrQLLH1AHohTIaq2T28kCi`
- İngilizce (`enwikiquote`): 69.128 madde, 198.19 MB Parquet, Drive File ID: `105LF4eDZ9b8Nz4IX6YXrTH46shfp5ZgF`
- İtalyanca (`itwikiquote`): 56.662 madde, 79.66 MB Parquet, Drive File ID: `1ByTxphg_B8J2QxJjXLx5KrREJ8m1RNNf`
- Rusça (`ruwikiquote`): 19.802 madde, 13.07 MB Parquet, Drive File ID: `1slkLQiv9xPrY52epDUf-TfJch2zQRILQ`
- Almanca (`dewikiquote`): 7.850 madde, 5.04 MB Parquet, Drive File ID: `19889c75277e5edbe29f207f15534c6f8`
