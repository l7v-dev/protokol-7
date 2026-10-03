---
name: data-ingestion-protocol
description: Protokol-7 veri çekme projeleri için standart AI ajan iş akışı ve mimari protokolü. Yeni bir veri kaynağı ekleneceği zaman ilk adım olarak bu beceri uygulanır.
---

# Data Ingestion Protocol (Veri Çekme Ajan Protokolü)

Bu beceri (skill), **protokol-7** projesine yeni bir veri kaynağı (platform) ekleneceği zaman AI ajanlarının izlemesi gereken standart, öngörülebilir ve tekrarlanabilir iş akışını (mantık akışını) tanımlar.

Ajanlar her seferinde aynı soruları sormak yerine, doğrudan bu protokoldeki adımları izleyerek otonom keşif, planlama, uygulama ve doğrulama yapmalıdır.

## 1. Faz: Keşif ve Analiz (Discovery)
Yeni bir hedef platform belirlendiğinde, kodu yazmadan önce şu keşifler **mutlaka** yapılır:
1. **API / Endpoint Tespiti:**
   - Resmi REST API var mı? GraphQL mi kullanıyor? Yoksa OAI-PMH, FTP, Sitemaps veya HTML scraping mi gerekiyor?
   - Rate limit (saniye/dakika/gün) politikaları nelerdir?
   - Auth (API Key, OAuth, IP tabanlı vb.) gerektiriyor mu?
2. **Veri Hacmi ve Format Tahmini:**
   - Toplam makale/kayıt sayısı ne kadar?
   - Metadata boyutu (JSON/XML) ve eklenti boyutu (PDF, resim) tahmini nedir?
   - Sadece metadata mı yoksa full-text/PDF mi çekilecek? (İkisi çekilecekse, Asenkron PDF Worker stratejisi uygulanmalıdır).
3. **Mevcut Şemalara Uygunluk ve Hak Durumu (Rights & Purpose):**
   - Çekilecek veri `context/architecture-schema.md` içinde tanımlanan yapıya nasıl uyarlanacak?
   - Kullanım amacı (`purpose`: RAG, Pretraining, SFT, Eval) ve hak statüsü (`rights_status`: approved | pending | denied) nedir? `pending` veya `denied` olan kaynaklar kesinlikle eğitim setlerine dahil edilmez.
4. **Kaynak Tanımlayıcısı (Source Descriptor):**
   - Kaynak için `contracts/source-descriptor.schema.json` şemasına tam uyumlu bir tanımlayıcı hazırlanır (`budget`: `max_requests`, `max_bytes`, `max_seconds` sınırları zorunludur).

## 2. Faz: Planlama ve Dokümantasyon (Planning)
Kodlamaya geçmeden önce, keşif bulgularına dayanan bir plan oluşturulur ve kalıcı olarak kaydedilir.
1. `docs/plans/<platform-adi>-pipeline-ve-aktor-plani.md` dosyası oluşturulur.
2. Planda şu bileşenlerin taslakları netleştirilir:
   - **Source Descriptor & Field Mapping:** `contracts/source-descriptor.example.json` ve `contracts/field-mapping.example.json` referans alınarak kaynak metadata alanlarının ortak modele haritalanması.
   - **Downloader:** Veri nasıl çekilecek (sayfalama - cursor/offset/token/resumption_token). Ağ dayanıklılığı için `docs/architecture-rfcs/12-capacity-failure-matrix.md` (DNS timeout, NXDOMAIN, SSRF/IP pinning, Range doğrulamalı resume) kuralları uygulanır.
   - **Cleaner:** Gelen JSON/XML verisi protokol-7 standart şemasına nasıl temizlenecek.
   - **Ledger:** SQLite tabanlı izleme (kayıt/sayfa bazlı resuming) nasıl yapılacak. Checkpoint yalnızca dayanıklı (durable) ACID yazım sonrası ilerletilir.
   - **Packer:** Parquet dosyasına nasıl basılacak (Zstandard sıkıştırma, 50.000 kayıt veya 512 MB eşik).
   - **Worker:** (Gerekliyse) PDF/HTML ekstre etme işi kuyruğa nasıl eklenecek.

## 3. Faz: Mimari Uygulama (Implementation)
Her pipeline, `pipelines/api_stream/<platform-adi>/` altında izole bir Python modülü olarak uygulanır.
*Zorunlu Dosya Hiyerarşisi:*
- `__init__.py`
- `downloader.py` (Sayfalama ve ağ istekleri, retry ve backoff mekanizmaları)
- `cleaner.py` (Veri standardizasyonu, tip dönüşümleri)
- `ledger.py` (`pipelines.shared.ledger_base` kullanılarak state tutma)
- `packer.py` (`pipelines.shared.sharder_base` kullanılarak Parquet rotasyonu)
- `drive_sync.py` (Oluşan parçaları GDrive/R2'ye yükleme)
- `orchestrator.py` (Tüm bileşenleri birleştiren, `--batch-size`, `--max-records` argümanları alan CLI uygulaması)
- `test_<platform>_pipeline.py` (Birim testler)

## 4. Faz: Doğrulama ve Test (Verification)
1. **Birim Testleri:** `test_<platform>_pipeline.py` içindeki tüm testler çalıştırılır. (`python -m pytest pipelines/api_stream/<platform-adi>/ -v`)
2. **Kısıtlı Pilot (Bounded Pilot):** `orchestrator.py` sınırlı bir `max-records` (örneğin 10-50 kayıt) ile çalıştırılıp API entegrasyonu, loglama, hata dayanıklılığı ve Parquet üretimi doğrulanır.
3. **Veritabanı Kaydı:** `scripts/sync-dbx-connections.py` güncellenerek yeni eklenen `data/catalogs/<platform_catalog>.sqlite` dosyası DBeaver/DBX sistemine tanıtılır.

## 5. Faz: Canlıya Alma (Deployment)
Doğrulamalar geçildiyse, arka plan işlemi olarak başlatılır.
Örnek:
```bash
python -u pipelines/api_stream/<platform-adi>/orchestrator.py --all --batch-size 1000 --max-shard-records 50000 2>&1 | tee -a logs/<platform-adi>.log
```

## PDF ve Heavy-Asset (Ağır Yük) Stratejisi
*Kritik Kural:* Metadata (JSON/XML) çekme işlemi (hızlı) ile PDF/Asset indirme ve metin çıkarma işlemi (yavaş) **asla** aynı process içinde kilitlenerek yapılamaz.
1. Metadata pipeline'ı, PDF URL'lerini bulur ve bunları SQLite/PostgreSQL katalog tablosuna (`pdf_status = 'pending'`) kaydeder.
2. Ayrı bir worker pool veya bağımsız full-text runner süreci bu kuyruktan PDF linklerini çeker, indirir, `PyMuPDF` ile metni çıkarır, yapısal alanları (başlık, yazarlar, yıl, dergi, abstract, sayfa sayısı, karakter/kelime sayısı) zstd/snappy sıkıştırmalı Parquet dosyalarına yazar.
3. Ajanlar, metadata'yı çekerken PDF'leri anlık olarak indirmeye KALKIŞMAMALIDIR.

## 6. Faz: Arşivleme, Paketleme ve Bellek Güvenliği (Packaging & Cold Vault)
500+ GB ve petabayt ölçeğindeki veri çekimlerinde dosya parçalanmasını (file fragmentation) ve bulut kota kilitlenmelerini önlemek için aşağıdaki kurallar zorunludur:

### 1. Toleranslı Çoklu-GB Paketleme Disiplini (10 GB - 50 GB / ~51 GB)
- **Küçük Dosya Parçalanması Yasağı:** 500 GB bir veri seti için 50.000 adet küçük (10 MB veya 512 MB) dosya üretilemez. Binlerce küçük dosya; Google Drive API kota tükenmesine, inode tükenmesine, dosya sistemi arama gecikmelerine ve verimsiz transferlere yol açar.
- **Toleranslı Hedef Boyut:** Ham ikili (raw PDF/EPUB/HTML) arşivleri TAR.GZ formatında **10 GB ile 50 GB** aralığında (en fazla ~51 GB üst tolerans sınırı) paketlenir. Böylece 500 GB veri yalnızca 10 ila 50 büyük arşiv parçasına bölünür.
- **Kayıt Sayısı Serbestisi:** Arşiv rotasyonu kayıt sayısına (record count) değil, kümülatif bayt hacmine göre tetiklenir (`max_part_entries` varsayılan olarak serbest bırakılır).

### 2. Dinamik Yerel Disk Headroom Güvenlik Koruması (Safety Guard)
- Her dosya eklemesinde çalışma ortamının boş disk alanı denetlenir (`shutil.disk_usage`).
- **Headroom Eşiği:** Yerel boş alan `min_free_disk_gb` (varsayılan: 25.0 GB) altına düşerse, aktif arşiv parçası hedef GB'ye ulaşmamış olsa dahi derhal kapatılır, mühürlenir ve uzak depolamaya (Google Drive / S3 / R2) gönderilir.
- Bu güvenlik kalkanı, ana sunucunun `ENOSPC` (No space left on device) hatasıyla çökmesini ve veritabanı kilitlenmesini engeller.

### 3. "archive_then_delete" Yaşam Döngüsü ve Sıfır Disk Artığı
- Ham veriler için yaşam döngüsü durum makinesi:
  `INGESTED -> EXTRACTED -> ARCHIVED -> UPLOADED -> VERIFIED -> PURGED`
- **Çift Kriptografik Sağlama:** Her tamamlanan Parquet ve TAR.GZ parçası için yerel SHA-256 ve MD5 hash değerleri hesaplanır.
- **Uzak MD5 Doğrulaması:** Parça Google Drive / R2 / S3'e yüklendikten sonra, uzak sunucunun döndürdüğü MD5 sağlama toplamı yerel MD5 ile eşleşmeden yerel dosya ASLA silinmez.
- **Sıfır Disk Artığı:** Doğrulama başarılı olduğunda yerel arşiv dosyası hemen silinir (`purge_on_success=True`). Böylece yerel disk yalnızca geçici arabellek olarak kullanılır.

### 4. AI/LLM Hazırlığı ve Biçim Ayrıştırması
- **Metin ve İkili Ayrımı:** Yapılandırılmış tam metin ve öznitelikler LLM eğitimi, RAG ve değerlendirme için optimize edilmiş Parquet dosyalarında tutulur.
- **Provenance Ham Arşivi:** Orijinal ikili dosyalar (PDF, görseller) WebDataset/Cold Vault uyumlu TAR.GZ arşivlerinde yedeklenir.
- **Katalog Bütünlüğü:** Tüm Parquet ve TAR.GZ parçaları merkezi SQLite/PostgreSQL ledger'ında parça indeksi, kayıt sayısı, bayt boyutu, SHA-256, MD5 ve Drive dosya kimliği ile kayıt altına alınır.

Bu protokole uyulduğu sürece, sistem 500 TB Data Lake hedefine sorunsuz şekilde uyum sağlayabilir.

