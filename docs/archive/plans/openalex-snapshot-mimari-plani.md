# Plan: OpenAlex S3 Parquet Snapshot İndirme, Temizleme, Parçalama ve Drive Yükleme Mimarisi

Bu doküman, OpenAlex'in resmi AWS S3 açık Parquet snapshot'ını (`s3://openalex/data/parquet/works/`) sıfır disk artığıyla akış halinde indirme, gürültüden arındırma, büyük Parquet parçaları (shard) halinde paketleme, Google Drive'a yükleme ve bütünsel metadata kayıt altına alma mimarisini belirler.

---

## 1. Veri Kaynağı ve İnceleme Analizi

OpenAlex snapshot'ı kamuya açık bir AWS S3 bucket'ında herhangi bir AWS kimlik bilgisi gerekmeksizin (`--no-sign-request`) dağıtılmaktadır:

- **S3 Kök Dizini:** `s3://openalex/data/parquet/works/`
- **Manifest Dosyası:** `s3://openalex/data/parquet/manifest.json` (626M+ kayıt, 707 GB sıkıştırılmış Parquet)
- **Partisyon Yapısı:** `updated_date=YYYY-MM-DD/part_XXXX.parquet`
- **Mevcut Şema (Örnek Parquet'ten Doğrulandı):**
  - `id`: Eser benzersiz URL'i (`https://openalex.org/W...`)
  - `doi`: Dijital Nesne Tanımlayıcısı
  - `title`, `display_name`: Eser başlığı
  - `publication_year`, `publication_date`: Yayın yılı ve tarihi
  - `language`, `type`: Dil kodu ve eser türü (`article`, `book-chapter`, `dissertation` vb.)
  - `authorships`: Yazar adları, kurumlar ve ORCID listesi
  - `abstract_inverted_index`: Ters çevrilmiş sözlük JSON'ı (`{"Revision": [0], "des": [1]...}`)
  - `open_access`: `{is_oa: bool, oa_status: string, oa_url: string}`
  - `cited_by_count`: Atıf sayısı
  - `primary_topic`, `topics`, `concepts`, `keywords`: Konu hiyerarşisi
  - `is_paratext`, `is_retracted`: Paratext (içindekiler, kapak) ve geri çekilme bayrakları

---

## 2. Temiz Veri (Clean Data) Kalite Kapısı

Ham külliyattaki 476M+ kaydın tamamı LLM eğitimi için uygun değildir. Yüksek kaliteli veri elde etmek için uygulanacak filtreleme kuralları:

1. **Paratext ve Retraction Elemesi:**
   - `is_retracted == True` olan tüm eserler elenir.
   - `is_paratext == True` (içindekiler, yayın kurulu listeleri, kapak yazıları) olan eserler elenir.
2. **Özet (Abstract) Doğrulaması ve İnşası:**
   - `abstract_inverted_index` alanı taranır; geçerli bir ters dizin bulunmuyorsa ve tam metin yoksa eser elenir.
   - Ters dizin sıralanarak doğal akıcı metne dönüştürülür (`reconstruct_abstract`).
   - `len(abstract.split()) < 25` olan yetersiz/taslak özetler elenir.
3. **Başlık Doğrulaması:**
   - Boş, 3 karakterden kısa veya anlamsız başlıklar elenir.
4. **Metin Formatı:**
   - LLM eğitimi için optimize edilmiş birleşik metin (`text` alanı):
     ```markdown
     # {title}

     **Authors:** {author_names}
     **Year:** {year} | **Citations:** {citations} | **DOI:** {doi}
     **Topics:** {primary_topic}

     ## Abstract
     {clean_abstract}
     ```

---

## 3. Parçalama (Sharding) ve Google Drive Yükleme Mimarisi

Kullanıcı ~50 GB parça boyutu talep etmiştir.

### 3.1. Teknik Riskler ve Boyut Değerlendirmesi
- **Google Drive Günlük Kotası:** Hesap başına günlük en fazla **750 GB** yükleme yapılabilir.
- **Tek Dosya ve Ağ Kesintisi:** 50 GB'lık tek bir dosya yüklenirken 48. GB'ta bağlantı koptuğunda, kesintisiz yükleme (resumable upload) token'ı diskte saklanmıyorsa tüm parça baştan yüklenmek zorunda kalır.
- **Downstream Bellek (RAM) Yükü:** 50 GB Parquet dosyaları, PyTorch DataLoader ve DuckDB gibi downstream LLM pipeline'larında RowGroup ve dictionary deserialization sırasında yüksek bellek (OOM) yaratabilir.
- **Önerilen Tasarım:**
  - Parça boyutu tavanı parametrik tutulacaktır (`--max-part-gb`, varsayılan: `10 GB` veya kullanıcı talebiyle `50 GB`).
  - Google Drive yükleyicisi, parçayı yükleyip MD5 doğrulamasını aldıktan hemen sonra yerel geçici dosyayı silecek (`zero-disk residue`).

---

## 4. Bütünsel Metadata ve Defter (Ledger) Mimarisi

Kullanıcı "metadata unutma" kuralını özellikle vurgulamıştır.

1. **Özel Snapshot Defteri (`data/openalex_snapshot_catalog.sqlite`):**
   - `s3_partitions`: S3 dosya URL'i, boyutu, taranan kayıt sayısı, temiz kayıt sayısı, durum (`pending`, `completed`, `failed`), tarih.
   - `shards`: Çıkan Parquet parça adı, kayıt sayısı, `size_mb`, `sha256_hash`, `drive_file_id`, oluşturulma zamanı.
   - `manifest_state`: İlerleme yüzdesi, toplam GB, toplam aktarılan temiz makale sayısı.
2. **Protokol-7 Birleşik Kayıt Defteri (`RegistryDatabase`):**
   - Üretilen her shard, `recordDatasetShard()` üzerinden merkezi veritabanına (`data/catalog.sqlite`) SHA-256 ve Drive linkiyle kaydedilir.
   - Tamamlanan her etap için `recordDatasetSnapshot()` oluşturulur.

---

## 5. Uygulama Adımları

- [ ] **Adım 1:** Downloader modülünü (`s3_downloader.py`) S3 manifest ve streaming partisyon okuyucu ile yapılandırma.
- [ ] **Adım 2:** Snapshot cleaner modülünü (`snapshot_cleaner.py`) paratext/retraction/abstract kalite kapısıyla inşa etme.
- [ ] **Adım 3:** Sharder modülünü (`snapshot_packer.py`) Arrow schema, Zstd sıkıştırma ve 10-50 GB part ceiling ile kurma.
- [ ] **Adım 4:** Drive sync modülünü (`drive_sync.py`) Google Drive `OpenAlex/` klasörüne otomatik yükleme ve yerel silme için entegre etme.
- [ ] **Adım 5:** SQLite defter ve checkpoint yöneticisini (`snapshot_ledger.py`) kurma.
- [ ] **Adım 6:** Ana koordinatör CLI betiğini (`scripts/openalex_snapshot_pipeline/orchestrator.py`) oluşturma.
- [ ] **Adım 7:** Kapsamlı birim testlerini (`test_snapshot_pipeline.py`) yazma ve doğrulama.
- [ ] **Adım 8:** `package.json`'a `openalex:snapshot:pipeline` script'ini ekleme ve ilk pilot testi çalıştırma.
