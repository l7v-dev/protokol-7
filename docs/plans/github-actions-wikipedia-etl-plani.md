# GitHub Actions Uzak Wikipedia LLM Parquet Veri Hattı Planı

Bu plan, resmi Wikimedia XML dökümlerinin yerel bilgisayar yerine tamamen **GitHub Actions (Ubuntu Linux Bulut Sanal Sunucusu)** üzerinde indirilmesi, Wikitext sözdiziminden arındırılarak temizlenmesi, Apache Parquet (Zstandard) formatına dönüştürülmesi ve doğrudan Google Drive'a mühürlenmesi mimarisini tanımlar.

---

## 1. Mimari Tasarım ve Bulut Veri Akışı

```mermaid
flowchart TD
    A["Manuel Tetikleme (gh workflow run / Web UI)"] --> B["GitHub Actions Runner (Ubuntu Latest)"]
    B --> C["GitHub Secrets Enjeksiyonu (GDRIVE_TOKEN_JSON & GDRIVE_CREDENTIALS_JSON)"]
    C --> D["dumps.wikimedia.org (1 Gbps+ Azure / GitHub Omurgası)"]
    D --> E["Wikitext Temizleyici & Namespace 0 Filtresi"]
    E --> F["PyArrow Parquet (Zstandard Level 6, Sharding)"]
    F --> G["Google Drive API v3 (Resumable Upload & MD5 Doğrulama)"]
    G --> H["Google Drive: 1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL / <lang> / data & metadata"]
    H --> I["GitHub Step Summary Karne Çıktısı"]
```

---

## 2. Temel Avantajlar

1. **Sıfır Yerel Donanım ve Disk Tüketimi:**
   Kullanıcının yerel bilgisayarı CPU, RAM veya disk açısından hiçbir yük altına girmez. İşlem tamamen arka planda GitHub'ın Microsoft Azure veri merkezlerindeki sanal sunucularında yürütülür.
2. **Yüksek Bant Genişliği:**
   Wikimedia döküm sunucuları ile GitHub bulut omurgası arasındaki yüksek hızlı bağlantı (1 Gbps+), indirme ve Drive'a yükleme sürelerini önemli ölçüde kısaltır.
3. **Güvenlik ve İzolasyon:**
   Google Drive kimlik bilgileri `gh secret` üzerinden şifreli aktarılır; iş bittiğinde geçici token dosyaları runner yok edildiğinde tamamen silinir.
4. **Esnek Tetikleme:**
   Tek bir komut veya GitHub web arayüzü ile istenen dil (`de`, `en`, `uz`, vb.) seçilerek bağımsız olarak çalıştırılabilir.

---

## 3. Yapılandırma ve Çalıştırma

### 3.1. Tanımlanan Gizli Anahtarlar (GitHub Secrets)
- `GDRIVE_TOKEN_JSON`: Google Drive OAuth2 yenileme ve erişim belirteci.
- `GDRIVE_CREDENTIALS_JSON`: Google Cloud istemci kimlikleri.

### 3.2. Çalıştırma Komutu
```bash
gh workflow run wikipedia-etl.yml -f lang=de -f mode=single -f folder_id=1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL
```
