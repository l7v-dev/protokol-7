# DergiPark URL Eşleme ve Geriye Dönük Doldurma Planı (Madde A)

## Hedef ve Bağlam
DergiPark OAI-PMH boru hattında toplanan 131.127 makale kaydında `fulltext_url` alanının boş (`NULL`) kalması sorununun giderilmesi; `cleaner.py` ve `downloader.py` modüllerinin URL ayrıştırma mantığının güçlendirilmesi ve SQLite kataloğundaki 131.127 kaydın kanonik iniş sayfası / DOI URL'leri ile doldurulması.

## 1. Analiz Edilen Neden
- DergiPark OAI-PMH servisi `<dc:identifier>` etiketleri içinde `https://dergipark.org.tr/en/pub/<dergi_kodu>/article/<id>` formatında kanonik makale web URL'sini sunmaktadır.
- Ancak `cleaner.py` sadece doğrudan `.pdf` veya `/download/` içeren bağlantıları kabul ettiği için tüm makalelerde `fulltext_url` boş kalmıştır.
- `downloader.py` OAI başlığındaki `<setSpec>` (dergi kodu/slug) bilgisini ayrıştırmamaktadır.

## 2. Uygulama Adımları
- [ ] **Adım 1: `downloader.py` Güncellemesi**
  - `<header>` içindeki `<setSpec>` etiketlerini ayrıştırarak `raw_item["set_spec"]` olarak çıktılanması.
- [ ] **Adım 2: `cleaner.py` Güncellemesi**
  - `clean_record` metodunda `identifiers` dizisinden:
    1. Doğrudan PDF/download linki (`pdf_url`)
    2. Kanonik DergiPark makale iniş URL'si (`article_url`)
    3. DOI URL'si (`https://doi.org/{doi}`)
    öncelik sırasıyla `fulltext_url` alanına atanması.
- [ ] **Adım 3: Testlerin Güncellenmesi**
  - `pipelines/api_stream/dergipark/test_dergipark_pipeline.py` içine URL eşleme doğrulama testlerinin eklenmesi ve 8/8 testin yeşil çalıştırılması.
- [ ] **Adım 4: Geriye Dönük Doldurma Betiği (`scripts/backfill_dergipark_urls.py`)**
  - 100 setlik OAI `ListSets`, DOI'lerden dergi kodu çıkarma ve kalan dergilerden hızlı tekil örnekleme ile kapsamlı bir `journal_to_slug` haritası oluşturulması.
  - `data/catalogs/dergipark_catalog.sqlite` tablosundaki 131.127 kaydın `fulltext_url` alanının güncellenmesi.
- [ ] **Adım 5: Bütünlük Doğrulaması ve Raporlama**
  - `npm run verify` ve Python testlerinin çalıştırılması.
  - SQLite tablosundaki doluluk oranının raporlanması.
  - `docs/walkthroughs/dergipark-url-esleme-ve-geriye-donuk-doldurma-walkthrough.md` belgesinin üretilmesi.
