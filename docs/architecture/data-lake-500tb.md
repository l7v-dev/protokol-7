# Protokol-7: 500 TB Data Lake ve Ölçeklendirme Mimarisi Analizi

Bu belge, Protokol-7'nin mevcut yapısının detaylı bir analizini, "dürüst" bir mimari değerlendirmesini ve 500 TB + çoklu sunucu (multi-node distributed) ortamına geçiş için gerekli yol haritasını içermektedir.

## 1. Mevcut Durum Analizi: Neyimiz Var, Neyimiz Eksik?

Şu anki altyapıda **Parquet dosyaları** ve **SQLite (Ledger)** kullanıyoruz. Local staging ve tekil sunucu (single-node) için bu harika bir seçimdir.

- **Doğru Yapılanlar:** Veriyi satır satır veritabanında tutmak yerine **Parquet** formatında yığınlar (shard) halinde tutmamız kesinlikle *doğru* bir karardır. Parquet kolon-bazlı bir formattır; büyük veri analitiğinde, yapay zeka eğitiminde ve 500 TB'lık Data Lake (Veri Gölü) ortamlarında endüstri standardıdır. Bu formatla yola çıkmamız muazzam bir kazanç.
- **Yanlış/Eksik Yapılanlar (Ölçeklenme Engelleri):**
  - **SQLite Darboğazı:** Şu an `data/catalogs/` altında duran SQLite veritabanları (örn. `doaj_catalog.sqlite`), sadece tek bir sunucuda çalışabilir. Çoklu sunucular (worker'lar) aynı SQLite dosyasına yazmaya kalktığında `database is locked` hatası alırız.
  - **Depolama Darboğazı:** Parquet'leri Google Drive'a kopyalamak basit projeler için yeterlidir, ancak 500 TB bir veri havuzu Google Drive'a sığmaz ve API rate-limit'lerine takılır.

## 2. 500 TB "Data Lake" (Veri Gölü) Nedir?

Evet, 500 TB veriyi geleneksel ilişkisel veritabanlarına (MySQL, PostgreSQL) veya NoSQL'lere (MongoDB) koyamayız. Zira koyarsak hem maliyeti inanılmaz yüksek olur hem de sorgu performansları çöker. Buna **Data Lake (Veri Gölü)** denir.

Data Lake mimarisinde veri, pahalı sunucu disklerinde değil, **Object Storage** sistemlerinde (AWS S3, Google Cloud Storage, veya sunucularımıza kuracağımız açık kaynaklı **MinIO**) Parquet formatında ham veya yarı-işlenmiş halde yatar.

Üzerine **Apache Iceberg**, **Delta Lake** veya **Apache Hudi** gibi "Data Lakehouse" formatları kurularak, sanki normal SQL veritabanıymış gibi (ACID transaction'ları ile) sorgulanır.

## 3. Yapılması Gereken Temizlik ve Değişiklikler

Eğer sistemi birden fazla sunucuya yayacak ve 500 TB hedefine ilerleyeceksek, aşağıdaki mimari devrimleri yapmalıyız.

### A. Veritabanı ve Ledger Yönetimi (SQLite -> PostgreSQL/Redis)
- Her bir platform için ayrı olan SQLite veritabanları merkezi bir **PostgreSQL** veritabanına taşınmalıdır. Tüm worker sunucuları, nerede kaldıklarını (cursor) ve hangi kayıtların alındığını bu merkezi PostgreSQL'e soracaktır.
- Saniyelik milyonlarca işlem için gerekirse **Redis** eklenebilir.

### B. Depolama Birimi (Google Drive -> MinIO / S3)
- Google Drive entegrasyonu (`drive_sync.py`) bırakılmalı.
- Birden çok sunucunun aynı anda Parquet yazabileceği ve okuyabileceği açık kaynaklı **MinIO** kümesi (cluster) kurulmalıdır. MinIO, S3 uyumludur ve TB/PB'larca veriyi kolayca barındırır.

### C. PDF ve Heavy Asset İşleme: Dağıtık Worker Mimarisi (RabbitMQ)
*(Kullanıcının bahsettiği: "PDF'ler havuza indirilse o havuzdaki dataları dönüştüren worker mı kursak?")* -> **Kesinlikle Evet!**

Mevcut durumda saniyede 100 makale (metadata) çekebiliyoruz. Ama eğer kodun içine PDF indirmeyi de koyarsak bu hız saniyede 0.5'e düşer ve süreç yıllar sürer.

**Doğru Mantık Akışı (Two-Stage Architecture):**
1. **Stage 1 (Hızlı Avcılar):** Mevcut yazdığımız `doaj`, `dergipark` pipeline'ları çok hızlı bir şekilde API'den metadata'yı çeker. İçinde PDF linki varsa, bunu Parquet'ye yazar ve aynı zamanda **RabbitMQ** (Mesaj Kuyruğu) veya Kafka'ya bir mesaj atar: *"Şu PDF'in işlenmesi lazım: https://..."*
2. **Stage 2 (PDF Öğütücü Worker'lar):** Başka sunuculardaki yüzlerce arka plan Worker'ı, RabbitMQ'dan mesajları dinler. Linki alır, PDF'i indirir, `PyMuPDF` ile text/markdown'a çevirir ve bunu MinIO'daki Veri Gölü'ne ayrı bir Parquet katmanı (veya doğrudan ElasticSearch/Vektör DB) olarak yazar.

## 4. Dürüst Mimari Değerlendirme ve Sonuç

**Saçmalık veya Mantıksal Hata Var mı?**
- *Mantıksal Hata:* Metadata çekmek ile PDF indirmeyi aynı anda (senkron) yapmaya çalışmak büyük bir mantıksal hatadır. (Şu an yapmıyoruz, ama eğilim bu yöndeydi).
- *Saçmalık:* 500 TB veriyi SQLite veya Google Drive'da tutmayı planlamak saçmalık olur. SQLite ve GDrive sadece projenin Proof of Concept (PoC) ve local geliştirme aşaması için kabul edilebilirdi.

**Kullanmamız Gereken Yeni Araç ve Kütüphaneler:**
1. **RabbitMQ / Celery (veya Apache Kafka):** Asenkron görev yönetimi ve PDF worker'ları için.
2. **PostgreSQL:** Merkezi veritabanı (Ledger state yönetimi).
3. **MinIO (veya S3 uyumlu Object Storage):** 500 TB Parquet dosyalarının depolanması için.
4. **Apache Iceberg / DuckDB:** MinIO'daki yüzbinlerce Parquet dosyasını tek bir tabloymuş gibi süper hızlı SQL ile sorgulamak için.

**Karar ve Öneri:**
Sistemi Data Lake standartlarına taşımalıyız.
1. İlk aşamada, yeni eklediğimiz `data-ingestion-protocol` skill'ine uygun olarak hızlı metadata çekimi yapmaya devam edelim (Örn: Dergipark, PubMed vs.).
2. Paralelde bir sunucuya **RabbitMQ + PostgreSQL + MinIO** sacayağını kuralım.
3. PDF Worker (Öğütücü) sistemini bağımsız bir `src/workers/pdf_extractor` servisi olarak kodlayıp bu altyapıya bağlayalım.

Bu mimari hem temiz, hem hiyerarşik hem de bakımı/ölçeklenmesi oldukça kolaydır.
