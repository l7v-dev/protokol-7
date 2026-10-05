# DergiPark URL Eşleme ve Geriye Dönük Doldurma Walkthrough (Madde A)

## 1. Amaç ve Kapsam
DergiPark OAI-PMH boru hattı tarafından toplanan 131.127 makalede `fulltext_url` alanının boş (`NULL`) kalması sorunu giderildi. Kod tabanındaki URL çıkarma mekanizması güncellendi ve mevcut SQLite kataloğundaki 131.127 makale kaydı geriye dönük olarak dolduruldu.

## 2. Gerçekleştirilen Değişiklikler

### A. İndirici (`downloader.py`) Güncellemesi
- `_parse_oai_record` metodu, OAI-PMH `<header>` bloğundaki `<setSpec>` (dergi kodu/slug) bilgisini ayrıştıracak şekilde güncellendi.
- Ham kayıt nesnesine `"set_spec"` alanı eklendi.

### B. Temizleyici (`cleaner.py`) URL Çıkarımı
- `clean_record` fonksiyonu Dublin Core `identifiers` dizisinden:
  1. Doğrudan PDF/download bağlantısını (`pdf_url`)
  2. Kanonik DergiPark makale iniş sayfasını (`article_url`, `https://dergipark.org.tr/tr/pub/<dergi_kodu>/article/<id>`)
  3. Kalıcı DOI bağlantısını (`https://doi.org/{doi}`)
  4. Header'dan gelen `set_spec` üzerinden türetilmiş kanonik URL'yi
  öncelik sırasıyla `fulltext_url` alanına atayacak şekilde güçlendirildi.

### C. Geriye Dönük Doldurma (`scripts/backfill_dergipark_urls.py`)
Mevcut SQLite veritabanındaki ([`data/catalogs/dergipark_catalog.sqlite`](file:///home/l7v/l7v-dev/play/protokol-7/data/catalogs/dergipark_catalog.sqlite)) 131.127 kaydın `fulltext_url` alanını güncellemek için akıllı bir haritalama motoru çalıştırıldı:
1. OAI-PMH `ListSets` üzerinden 100 dergi slug'ı alındı.
2. Veritabanındaki DOI dizgilerinden 453 ek dergi slug'ı çıkarıldı.
3. Kalan yüksek hacimli (>= 50 makaleli) 17 dergiden tekil OAI `GetRecord` sorgusuyla tam slug'lar örneklendi.
4. Toplam 570 derginin slug haritası oluşturuldu.

## 3. Sonuçlar ve Metrikler

| Metrik | Öncesi | Sonrası |
|---|---|---|
| Toplam Makale Sayısı | 131.127 | 131.127 |
| Doğrudan DergiPark Kanonik URL (`tr/pub/<slug>/article/<id>`) | 0 (%0.0) | **126.715 (%96.64)** |
| Kalıcı DOI Bağlantısı (`doi.org/<doi>`) | 0 (%0.0) | **238 (%0.18)** |
| **Toplam URL Doluluk Oranı** | **0 (%0.0)** | **126.953 (%96.82)** |
| Kalan Çözümlenemeyen | 131.127 (%100.0) | **4.174 (%3.18)** |

## 4. Testler ve Doğrulama
- `pipelines/api_stream/dergipark/test_dergipark_pipeline.py`: 9/9 test başarılı (%100 yeşil).
- `tests/dergipark-actor.test.ts`: 11/11 TypeScript aktör testi başarılı (%100 yeşil).
- `npm run verify`: 6/6 doğrulama katmanı hatasız geçti.
- **DOAJ Kesintisiz Akış:** PID `106385` arka planda kesintisiz çalışıyor (1.138.000+ kayıt).
