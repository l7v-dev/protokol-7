# Çevrimdışı (Raflanan) Disk Arşivleme ve Veri Yönetimi Mimarisi Planı

## 1. Problem Tanımı ve Temel Kısıtlar

* **Fiziksel Kısıt:** Depolama birimleri (SSD / HDD) 7/24 kesintisiz çalışan ağ sunucuları (NAS/SAN) veya bulut nesne depoları değildir. Diskler doldukça fiziksel olarak unmount edilip rafa kaldırılmaktadır (**Cold Storage / Offline Shelf**).
* **Temel Riskler:**
  1. **"Hangi Veri Hangi Diskte?" Çıkmazı:** Onlarca disk raflanıp yeni disk takıldığında, geçmişte kazınan bir dosyanın hangi raftaki hangi diskte olduğunu bilmek imkansızlaşır (Diski tek tek takıp arama mecburiyeti).
  2. **Bit-Rot ve Veri Bozulması:** Rafta bekleyen manyetik veya NAND hücreler zamanla sessiz bozulmaya (bit-rot) uğrayabilir; dosyaların bozulup bozulmadığı doğrulanamaz.
  3. **Merkezi Bağımlılık Riski (Lock-in):** Eğer tüm veri yapısı sadece ana makinedeki bir veritabanına bağlı olursa, ana makinenin formatlanması veya çökmesi durumunda raftaki yüzlerce gigabaytlık disk anlamsız dosya yığınına döner.

---

## 2. Çözüm Mimarisi: Çift Katmanlı Soğuk Arşiv (Cold Vault & Hot Catalog)

Bu mimaride sistem iki ayrık katmana bölünür:

```text
[ ANA MAKİNE / ÇALIŞMA ALANI ]
  │
  ├──> [ Hot Catalog (Kalıcı Ana İndeks) ] ──> data/catalog.sqlite (Hafif, < 100 MB)
  │    • Tüm disklerin tam envanteri
  │    • URL, Başlık, Tarih, SHA-256, Dosya Boyutu
  │    • Hangi fiziksel diskte olduğu (Volume ID: VOL-2026-001)
  │    • Anlık milisaniyelik arama (Raflara dokunmadan)
  │
  └──> [ Aktif Çalışma Hacmi ] ──────────────> /mnt/cold-vault/active/ (Yazılan Disk)
       • Doluluk izlenir (%95 eşiğinde mühürlenir)

[ RAFLANAN DİSKLER (OFFLINE SHELF) ]
  ├──> Disk 1 [ Etiket: VOL-2026-001 ] ──> Kendi içinde Bağımsız (Self-Describing)
  │    ├── volume-manifest.parquet (Bu diskin tüm fihristi)
  │    ├── checksums.sha256 (Bit-rot doğrulama tablosu)
  │    └── data/
  │        ├── pdfs/
  │        └── records/ (Sıkıştırılmış GFM / Parquet blokları)
  │
  ├──> Disk 2 [ Etiket: VOL-2026-002 ] ──> (Aynı standartta mühürlenmiş)
  └──> Disk N ...
```

---

## 3. Mimari İlkeler ve Bileşenler

### A. Kalıcı Ana Fihrist (Hot Catalog - SQLite)
Ana makinenin sabit diskinde sürekli açık duran tek bir hafif dosya (`catalog.sqlite`):
* Bir arama yapıldığında disklerin hiçbirinin takılı olmasına gerek yoktur.
* `SELECT volume_id, file_path FROM documents WHERE title LIKE '%Okul Sağlığı%'` sorgusu 2 milisaniyede çalışır.
* Sistem kullanıcıya doğrudan fiziksel talimatı verir: `Kayıt VOL-2026-001 diskinde. Diski takınız.`

### B. Bağımsız Diskler (Self-Describing Volume Standardı)
Ana makine yansa, çalınsa veya silinse bile raftaki her disk kendi başına eksiksiz bir arşivdir:
* Diskin kök dizininde `volume-manifest.parquet` (veya `manifest.jsonl.gz`) yer alır.
* Diskin içindeki her dosyanın yolu, boyutu, özeti ve kazınma metaverisi bu manifestoda saklanır.
* Herhangi bir makineye takıldığında tek bir komutla içindeki her şey listelenebilir veya ana fihrist sıfırdan yeniden üretilebilir (`reindex`).

### C. Bit-Rot ve Bütünlük Koruması (SHA-256 Doğrulama)
* Her dosya diske yazılırken anlık olarak SHA-256 özeti hesaplanır.
* Disk dolup raflanmadan önce kök dizine `checksums.sha256` dosyası mühürlenir.
* Aylar sonra disk raftan indirilip takıldığında `sha256sum -c checksums.sha256` komutu ile diskin sağlamlığı 0 riskle test edilir.

### D. Hacim Yaşam Döngüsü (Volume Lifecycle Protocol)
1. **`MOUNT` & `INIT`:** Yeni disk takılır, `npm run volume init --name "VOL-2026-003"` ile etiketlenir.
2. **`APPEND`:** Protokol-7 indirdiği PDF'leri ve kazıdığı metinleri bu diske yazar; eşzamanlı olarak ana `catalog.sqlite` güncellenir.
3. **`THRESHOLD CHECK` (%95 Kuralı):** Boş alan 20 GB'ın altına düştüğünde sistem otomatik yazmayı durdurur.
4. **`SEAL` (Mühürleme):**
   - Disk içi `volume-manifest.parquet` üretilir.
   - `checksums.sha256` oluşturulur.
   - Durum `SEALED` olarak işaretlenir.
   - Kullanıcıya diski çıkarıp fiziksel etiketini yapıştırması bildirilir.
5. **`SHELF`:** Disk rafa kaldırılır.

---

## 4. Uygulanacak Dosya ve Modül Değişiklikleri

### [NEW] `scripts/volume-manager.mjs`
* Disk mount/unmount denetimi, disk doluluk oranı takibi (`df`), disk başlatma (`init`), mühürleme (`seal`) ve doğrulama (`verify`) komut satırı aracı.

### [NEW] `src/storage/catalog-manager.ts`
* Ana makinedeki `catalog.sqlite` üzerinde çalışan hafif TypeScript arayüzü:
  * `registerVolume(volumeId, label, capacity)`
  * `indexDocument(docMetadata)`
  * `searchCatalog(query)` -> Hangi diskte ve hangi yolda olduğunu döner.

### [NEW] `src/storage/storage-sink.ts`
* Protokol-7 aktörlerinin (Cheerio, Playwright, PdfDocument) çıktılarını aktif diske akıtan ve ana kataloğu otomatik besleyen soyutlama katmanı.

### [NEW] `context/storage-architecture.md`
* Bu çevrimdışı arşivleme standardını, disk isimlendirme formatını (`VOL-YYYY-XXX`) ve komutları belgeleyen kalıcı mimari sözleşmesi.

---

## 5. Doğrulama ve Test Planı

1. **Birim & Entegrasyon Testleri:**
   * Simüle edilmiş disk doluluk senaryosu (geçici klasörde %95 doluluk testi).
   * Mühürleme (`seal`) sırasında manifest ve SHA-256 üretim doğrulaması.
   * Ana katalog arama testi (bağlı olmayan diskteki dosyanın anında yerini tespit etme).
2. **Kopukluk / Felaket Kurtarma Testi:**
   * Ana katalog dosyası silindiğinde, mühürlü bir diskten ana kataloğu sıfırdan yeniden inşa etme (`npm run volume reindex`) testi.
3. **Standart Kalite Kapıları:**
   * `npm run verify` (6 katmanlı SCA, Biome, Naming, Secret, Emoji).
   * 76/76 mevcut testin regressionsız çalışması.
