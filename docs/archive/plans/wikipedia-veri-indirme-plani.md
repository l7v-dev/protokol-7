# Wikipedia AI Dataseti İndirme ve Google Drive (30 TB) Aktarım Mimarisi

Bu doküman, 30 TB depolama kapasitesine sahip Google Drive hesabı üzerinde yapay zeka (LLM / NLP) ön-eğitimi ve veri setleri oluşturmak amacıyla diller bazında Wikipedia verilerinin aktarımı, format seçimi, sıkıştırma yöntemleri ve Google Colab sınırlarını tanımlar.

---

## 1. Google Drive (30 TB) ve Google Colab Sınırları

### 1.1 Google Drive Hesap Sınırları
* **Kapasite Uygunluğu:** 30 TB alan, Wikipedia'nın tüm dillerdeki (300+ dil) tüm güncel makale dökümlerini (ham halde ~120 GB sıkıştırılmış, işlenmiş metin/parquet formatında ~350-500 GB) yüzlerce kat fazlasıyla barındırabilir. Kapasite sorunu bulunmamaktadır.
* **Günlük 750 GB Yükleme Sınırı (Kritik):**
  * Google Drive altyapısı, hesap başına **24 saatlik periyotta maksimum 750 GB yükleme (upload)** kuralını katı bir şekilde uygular.
  * Bu sınır Google Drive API, Colab Drive FUSE veya Rclone üzerinden yapılan tüm yazma işlemleri için geçerlidir.
  * Günlük 750 GB aşıldığında hesap 24 saat boyunca `403 User Rate Limit Exceeded` durumuna geçer.
  * **Çözüm:** Günlük aktarım hacmi 700 GB eşiğini aşmayacak şekilde planlanmalı ve dil paketleri kontrollü gruplar halinde aktarılmalıdır.

### 1.2 Google Colab Çalışma ve Altyapı Sınırları
* **Oturum Süresi (Timeout):**
  * **Ücretsiz Colab:** Maksimum 12 saat kesintisiz çalışma. Kullanıcı etkileşimi olmazsa (idle) 15-30 dakika içinde bağlantı kesilir. Tarayıcı sekmesi kapatıldığında oturum sonlanır.
  * **Colab Pro / Pro+:** Arka planda çalışma desteği (background execution) ve 24 saate kadar oturum süresi.
* **Geçici Yerel Disk (Ephemeral Disk):**
  * Colab sanal makinesinin kendi yerel diski (`/content`) ~78 GB - 100 GB civarındadır.
  * Dosyaları önce Colab yerel diskine indirip sonra Drive'a kopyalamak disk taşmasına (Disk Full) neden olur.
  * Dosyalar doğrudan bağlı Drive yoluna (`/content/drive/MyDrive/...`) veya bellek akışıyla (streaming) yazılmalıdır.
* **Drive FUSE G/Ç Darboğazı:**
  * Colab'da Google Drive FUSE sürücüsü üzerinden bağlanır. Çok yüksek eşzamanlı yazma işlemleri FUSE kilitlenmelerine yol açabilir. Bu nedenle `aria2c` bağlantı sayısı dosya başına 4-8 parça ile sınırlandırılmalıdır.

---

## 2. Yapay Zeka (AI / LLM) Datasetleri İçin Format ve Sıkıştırma Analizi

### 2.1 Ham Wikimedia Dökümlerinin (`.xml.bz2`) AI Riskleri
* **Sözdizimi Kirliliği:** Ham dökümler MediaWiki işaretleme dili içerir (`{{Bilgi kutusu}}`, `[[Kategori:...]]`, `<ref>...</ref>`, şablon fonksiyonları, HTML tabloları).
* **Model Halüsinasyonu:** Ham wikitext doğrudan LLM eğitimine verilirse, model metin üretirken şablon kodları ve etiket artıkları üretir (data corruption).
* **Bzip2 Performans Sorunu:** `.bz2` sıkıştırması CPU maliyeti çok yüksek bir algoritmadır; GPU eğitim hatlarında (PyTorch DataLoader) çok çekirdekli hızlı paralel veri açmaya uygun değildir.

### 2.2 Tavsiye Edilen Format: Apache Parquet + Zstandard (`.parquet` / `zstd`)
LLM ön-eğitimi ve veri işleme hatlarında (Hugging Face, Meta LLaMA, Mistral, Databricks) standart kabul edilen format **Parquet + Zstandard (ZSTD)** kombinasyonudur.

| Kriter | Parquet + ZSTD (Tavsiye Edilen) | JSONL + ZSTD (`.jsonl.zst`) | Ham MediaWiki XML (`.xml.bz2`) |
|---|---|---|---|
| **Erişim Türü** | Kolon bazlı (Columnar) | Satır bazlı akış (Stream) | Sıralı XML ayrıştırma |
| **GPU / DataLoader Hızı** | Çok yüksek (Doğrudan RAM'e sıfır-kopya okuma) | Yüksek | Çok yavaş (CPU darboğazı) |
| **Sıkıştırma Algoritması** | Zstandard (Seviye 3-6) | Zstandard | Bzip2 |
| **Veri Temizliği** | Temiz metin + başlık + dil etiketi | Temiz metin + JSON alanları | Ham wikitext ve şablon artıkları |
| **Kısmi Okuma** | Mümkün (yalnızca `text` kolonu çekilebilir) | Satır satır okunur | Dosyanın tamamı açılmak zorundadır |

---

## 3. Mimari Seçenekler ve Yol Haritası

### Strateji A: Doğrudan Temizlenmiş Hugging Face Parquet Dökümleri (En Verimli)
Hugging Face, Wikimedia ile ortak olarak 300+ dildeki Wikipedia makalelerini MediaWiki etiketlerinden arındırılmış, temiz metin olarak Parquet formatında yayınlamaktadır (`wikimedia/wikipedia`).
* **Avantaj:** Günlerce sürecek XML temizleme ve regex ayıklama işlemine gerek kalmaz.
* **Format:** Her dil için doğrudan `.parquet` (ZSTD sıkıştırmalı).
* **Doğrudan Drive'a İndirme:** Python `huggingface_hub` veya `curl` ile doğrudan Google Drive klasörüne aktarılır.

### Strateji B: Resmi Ham Wikimedia Dökümü (`.xml.bz2`) İndirip Yerel/Colab'da Ayrıştırma
Eğer orijinal şablonlar, yönlendirmeler veya metaveriler ham haliyle arşivlenmek isteniyorsa:
1. `dumps.wikimedia.org/<lang>wiki/latest/<lang>wiki-latest-pages-articles.xml.bz2` doğrudan Drive'a indirilir.
2. Ardından Python tabanlı yüksek performanslı ayrıştırıcı (örneğin `wikiextractor` veya rust tabanlı ayrıştırıcılar) çalıştırılarak metinler `.jsonl.zst` veya `.parquet` formatına damıtılır.

---

## 4. Google Colab İçin Hazır AI Dataset İndirme Reçetesi

Aşağıdaki reçete, Google Drive'a bağlanarak seçilen dillerin temizlenmiş Parquet veri setlerini veya ham dökümlerini doğrudan Google altyapısı üzerinden Drive'a yazar.

```python
# Colab Notebook: Wikipedia AI Dataset Downloader
from google.colab import drive
import os
import subprocess

# 1. Drive Bağlantısı
drive.mount('/content/drive')

# 2. Hedef Dizin Yapılandırması
BASE_DIR = "/content/drive/MyDrive/Wikipedia_AI_Datasets"
os.makedirs(BASE_DIR, exist_ok=True)

# 3. Yöntem Seçimi: 'parquet_clean' (AI için temizlenmiş) veya 'raw_dump' (ham döküm)
MODE = "parquet_clean" 
LANGUAGES = ["tr", "en", "de", "fr", "es", "az"]

if MODE == "parquet_clean":
    # Hugging Face üzerinden temizlenmiş Parquet dosyalarının çekilmesi
    !pip install -q huggingface_hub pyarrow
    from huggingface_hub import snapshot_download
    
    for lang in LANGUAGES:
        print(f"\n[AI-DATASET] {lang.upper()} temiz Parquet verisi indiriliyor...")
        target_dir = f"{BASE_DIR}/clean_parquet/{lang}"
        os.makedirs(target_dir, exist_ok=True)
        snapshot_download(
            repo_id="wikimedia/wikipedia",
            repo_type="dataset",
            allow_patterns=f"20231101.{lang}/*",
            local_dir=target_dir,
            max_workers=4
        )
        print(f"[OK] {lang.upper()} Parquet tamamlandı.")

elif MODE == "raw_dump":
    # Resmi ham bz2 dökümlerinin aria2c ile aktarımı
    !apt-get update -qq && apt-get install -y -qq aria2
    for lang in LANGUAGES:
        target_dir = f"{BASE_DIR}/raw_dumps/{lang}"
        os.makedirs(target_dir, exist_ok=True)
        url = f"https://dumps.wikimedia.org/{lang}wiki/latest/{lang}wiki-latest-pages-articles.xml.bz2"
        cmd = ["aria2c", "-x", "8", "-s", "8", "-j", "4", "-c", "-d", target_dir, url]
        subprocess.run(cmd, check=True)
```
