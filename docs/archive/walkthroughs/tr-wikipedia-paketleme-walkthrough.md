# Türkçe Wikipedia Dökümünden Google Drive'a Bitmiş Paket Aktarım Raporu (Walkthrough)

Bu rapor, resmi Türkçe Wikipedia dökümünün (`trwiki-latest-pages-articles.xml.bz2`) Google Colab üzerinde indirilip temizlenerek, yapay zeka model eğitimine doğrudan hazır **Apache Parquet (ZSTD)** formatında Google Drive'a mühürlenmesi için hazırlanan boru hattını belgeler.

---

## 1. Tamamlanan Mimari ve Bileşenler

1. **Uçtan Uca Colab Çalışma Defteri:**
   * Dosya: `notebooks/tr_wikipedia_pipeline.ipynb`
   * Özellikler:
     - Google Drive bağlantısı (`drive.mount`).
     - `aria2c` ile 8 kanallı hızlı indirme (Colab yerel SSD alanına, ~20-40 sn).
     - Otomatik MD5 sağlama toplamı doğrulaması (`md5sums.txt`).
     - `wikiextractor` ile şablon ve etiket temizliği (Wikitext -> JSONL).
     - `pyarrow` ile 100.000 makalelik parçalar halinde Zstandard (ZSTD Seviye 6) Parquet dönüşümü.
     - Bitmiş paketin Google Drive'a mühürlenmesi (`MyDrive/Wikipedia_Datasets/tr/`).
     - Detaylı `manifest.json` karnesi ve rastgele 3 makale ile içerik doğrulaması.

2. **Mimari Şartname Dokümanı:**
   * Dosya: `docs/plans/tr-wikipedia-colab-drive-plani.md`

3. **Sistem Envanteri:**
   * `context/architecture-schema.md` dosyasına `notebooks/tr_wikipedia_pipeline.ipynb` ve `docs/plans/tr-wikipedia-colab-drive-plani.md` eklendi.

---

## 2. Çıktı Dizin Yapısı (Google Drive)

İşlem tamamlandığında Google Drive üzerinde oluşacak yapı:

```text
Google Drive: /MyDrive/Wikipedia_Datasets/tr/
├── data/
│   ├── trwiki-part-00000.parquet       <- ~100.000 temiz makale
│   ├── trwiki-part-00001.parquet       <- ~100.000 temiz makale
│   ├── trwiki-part-00002.parquet       <- ~100.000 temiz makale
│   ├── trwiki-part-00003.parquet       <- ~100.000 temiz makale
│   ├── trwiki-part-00004.parquet       <- ~100.000 temiz makale
│   └── trwiki-part-00005.parquet       <- Kalan makaleler (~1.2 GB toplam)
├── raw/
│   ├── trwiki-latest-pages-articles.xml.bz2  (2.6 GB ham arşiv)
│   └── trwiki-latest-md5sums.txt
└── manifest.json                       (Metaveri, token tahminleri, hash bilgisi)
```

---

## 3. Çalıştırma Adımları

1. [tr_wikipedia_pipeline.ipynb](file:///home/l7v/l7v-dev/ge%C3%A7ici%20ortam/protokol-7/notebooks/tr_wikipedia_pipeline.ipynb) dosyasını indirin veya Google Colab arayüzünden doğrudan açın.
2. Hücreleri sırayla (veya `Çalışma Zamanı -> Tümünü Çalıştır`) çalıştırın.
3. Colab sizden Google Drive izni istediğinde onay verin.
4. Boru hattı yerel SSD üzerinde dökümü çekip temizleyecek ve yaklaşık 15-20 dakika içinde Google Drive'ınıza doğrudan GPU'da eğitime hazır Parquet paketini mühürleyecektir.
