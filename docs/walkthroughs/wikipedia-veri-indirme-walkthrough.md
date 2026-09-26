# Wikipedia Dil Tabanlı Veri İndirme ve Google Drive Aktarımı Doğrulama Raporu (Walkthrough)

Bu rapor, Wikipedia veri setlerinin diller bazında ayrıştırılarak Google Drive (30 TB) üzerine aktarılması, yapay zeka/LLM format seçimi ve yürütme araçlarının tamamlanmasına ilişkin çıktıları belgeler.

---

## 1. Gerçekleştirilen İşlemler Özeti

1. **Mimari Plan ve Kapasite Analizi:**
   * 30 TB Google Drive depolama kapasitesi değerlendirildi.
   * Google Drive altyapısının kullanıcı başına uyguladığı **günlük 750 GB yükleme (upload) limiti** analiz edilerek aktarım stratejisine dahil edildi.
   * Google Colab oturum süreleri, geçici disk (`/content`) sınırlamaları ve Drive FUSE G/Ç özellikleri incelendi.
   * `docs/plans/wikipedia-veri-indirme-plani.md` dosyası oluşturuldu ve güncellendi.

2. **Yapay Zeka (AI / LLM) Dataseti Format Kararı:**
   * Ham MediaWiki `.xml.bz2` dökümlerinin model eğitiminde yarattığı sentaks kirliliği ve şablon halüsinasyonu riskleri tespit edildi.
   * Sektör standardı olan **Apache Parquet + Zstandard (ZSTD)** ve **JSONL + ZSTD** formatlarının teknik avantajları (GPU DataLoader sıfır-kopya okuma hızı, kolon bazlı erişim) belgelendi.
   * Wikimedia ve Hugging Face ortaklığında temizlenmiş `wikimedia/wikipedia` veri setini doğrudan diller bazında çekme yeteneği eklendi.

3. **Uygulama Araçları:**
   * `notebooks/wikipedia_drive_downloader.ipynb`: Google Colab üzerinden tek tıkla çalışan, yerel disk/internet kullanmadan doğrudan Google omurgası üzerinden Drive'a yazan çalışma defteri. Çift modludur:
     - `parquet_clean`: Temizlenmiş Parquet AI veri seti.
     - `raw_dump`: Resmi ham Wikimedia `.xml.bz2` dökümü (`aria2c` ile).
   * `scripts/download-wikipedia-drive.mjs`: CLI ortamında çalışan, Rclone ile yerel diske kaydetmeden doğrudan Drive'a akıtabilen (`rclone copyurl`), HEAD metaveri kontrolü ve MD5 bütünlük denetimi yapan Node.js betiği.

4. **Sistem Envanteri ve Kayıtlar:**
   * `context/architecture-schema.md` dosyasına yeni script ve notebook eklendi.
   * `TASKS.md` dosyası güncellendi.

---

## 2. Kullanım Kılavuzu

### Yöntem 1: Google Colab Üzerinden Çalıştırma (Tavsiye Edilen)
1. `notebooks/wikipedia_drive_downloader.ipynb` dosyasını [Google Colab](https://colab.research.google.com/) üzerine yükleyin.
2. `TRANSFER_MODE` ayarını belirleyin:
   * `"parquet_clean"`: Doğrudan yapay zeka eğitimi için temizlenmiş Parquet dosyaları.
   * `"raw_dump"`: Resmi ham `.xml.bz2` dökümleri.
3. `LANGUAGES` listesine hedef dilleri yazın (Örn: `["tr", "en", "de", "fr", "es", "az"]`).
4. Hücreleri sırayla çalıştırın. İndirilen veriler doğrudan `/content/drive/MyDrive/Wikipedia_AI_Datasets/` klasörüne aktarılacaktır.

### Yöntem 2: Rclone ile Doğrudan Akış (CLI)
Yerel disk alanı tüketmeden doğrudan HTTP akışını Google Drive API'ye yönlendirmek için:

```bash
# Örnek: Türkçe ve Almanca dökümleri yerel diske yazmadan Drive'a aktarma
node scripts/download-wikipedia-drive.mjs \
  --languages tr,de \
  --rclone-remote gdrive:Wikipedia_Dumps
```

### Yöntem 3: Bağlanmış Google Drive Yoluna Doğrudan İndirme
```bash
node scripts/download-wikipedia-drive.mjs \
  --languages tr \
  --dest "/content/drive/MyDrive/Wikipedia_Dumps"
```

---

## 3. Doğrulama Durumu

* **Mimari Envanter:** `context/architecture-schema.md` güncel.
* **Log Standardı:** Sıfır emoji, standart ASCII etiketler sağlandı.
* **İsimlendirme Disiplini:** Pazarlama jargonu ve yasaklı sözcükler içermeyen teknik terminoloji kullanıldı.
