# Sağlık Bakanlığı E-Kütüphane İki Aşamalı Veri Çekme ve Damıtma Walkthrough

Bu doküman, `https://ekutuphane.saglik.gov.tr/` üzerindeki tıp yayınları, kılavuzlar, dergiler ve makaleler için geliştirilen boru hattının (`scripts/harvest-ekutuphane.mjs`), standart İngilizce dizin mimarisinin (`books`, `journals`, `articles`), iki aşamalı sıralı çalışma modelinin (Önce tüm veriyi indir $\rightarrow$ Sonra işle), 4 aşamalı Veto Zincirinin, 7 gün TTL'li çöp havuzunun (`trash/`) ve PDF'siz nihai mühürlü çıktı havuzunun (`out/saglik-ekutuphane/`) doğrulama sonuçlarını belgeler.

---

## 1. Uygulanan Standartlar ve İki Aşamalı Mimari

### A. İki Aşamalı Sıralı Yürütme (Two-Phase Sequential Execution)
İndirme ile işleme eşzamanlı birbirine karıştırılmaz. Boru hattı iki belirgin aşamada çalışır:
* **Faz 1 (Download Phase):** Tüm kategoriler (`books`, `journals`, `articles`) sırayla taranır, ham PDF'ler `raw_landing_pool` altına indirilir, Veto Gate 1-3 kontrolleri yapılır ve SHA-256 özetleri mühürlenir.
* **Faz 2 (Refine Phase):** Tüm indirmeler bittikten sonra indirilen ham PDF'ler sırayla okunur; metinleri çıkarılır, `.md.gz` ve `.json.gz` olarak `out/` havuzuna mühürlenir. İşi biten ham PDF derhal `trash/` havuzuna (7 gün TTL) aktarılır.

---

### B. Standart İngilizce Havuz Ağacı Şeması

```text
/home/l7v/protokol-data-pool/
│
├── staging/                              # Ağdan akış anındaki geçici dosyalar (.tmp)
│
├── quarantine_vetoed/                     # VETO ZİNCİRİNDE ELENEN GEÇERSİZ / BOZUK KAYITLAR
│   └── {id}/                             # Örn: 0412/
│       ├── veto_audit.json               # Veto sebebi ve teknik kapı raporu
│       └── rejected_payload.bin          # Hatalı/bozuk sunucu yanıtı (örn: DOC/Word veya HTML)
│
├── raw_landing_pool/                     # FAZ 1: TÜM HAM PDF'LER ÖNCE BURAYA İNER
│   └── saglik-ekutuphane/
│       ├── books/{year}/{stem}.pdf
│       ├── journals/{year}/{stem}.pdf
│       └── articles/{year}/{stem}.pdf
│
├── trash/                                # FAZ 2 SONRASI: İŞLENEN HAM PDF'LER (7 GÜN SAKLANIR)
│   ├── books/{stem}.pdf                  # 7 gün (168 saat) sonra otomatik purge edilir
│   ├── journals/{stem}.pdf
│   └── articles/{stem}.pdf
│
└── out/                                  # FAZ 2: NİHAİ MÜHÜRLÜ ÇIKTI (HAM PDF ASLA BARINDIRILMAZ)
    └── saglik-ekutuphane/                # protokol-cold-vault projesinin tüketeceği mühürlü alan
        ├── 00_map_index_pool/            # Fihrist, JSONL katalog, Checksum defteri, Checkpoint
        │   ├── catalog.jsonl             # Orijinal başlıklar, yazarlar, yıl, özetler
        │   ├── manifest.json             # Cold-vault uyumlu üst arşiv manifestosu
        │   ├── checksums.sha256          # YALNIZCA out/ altındaki .md.gz ve .json.gz SHA-256 defteri
        │   └── checkpoint.json           # Kesintiden devam durumu
        │
        └── 01_refined_content_pool/      # Kategorize edilmiş damıtılmış metin ve metaveri
            ├── books/{year}/
            │   ├── {YYYY}{ID4}.md.gz     # LLM/RAG uyumlu YAML frontmatter'lı Markdown
            │   └── {YYYY}{ID4}.json.gz   # Yapılandırılmış zengin JSON
            ├── journals/{year}/
            │   ├── {YYYY}{ID4}.md.gz
            │   └── {YYYY}{ID4}.json.gz
            └── articles/{year}/
                ├── {YYYY}{ID4}.md.gz
                └── {YYYY}{ID4}.json.gz
```

---

## 2. Doğrulama ve Test Kanıtları

### A. Canlı İki Aşamalı Koşum ve Veto Testi
Komut: `node scripts/harvest-ekutuphane.mjs --tur articles --limit 2`
Sonuçlar:
1. **Faz 1 (Download Phase):**
   * ID 682 indirildi $\rightarrow$ `raw_landing_pool/saglik-ekutuphane/articles/2025/20250682.pdf`
   * ID 412: Sunucunun PDF yerine Word/OLE döndürdüğü tespit edildi $\rightarrow$ Veto Gate 2 tetiklendi, dosya izole edilerek `quarantine_vetoed/412/veto_audit.json` altına alındı; pipeline çökmeden devam etti.
   * ID 413 indirildi $\rightarrow$ `raw_landing_pool/saglik-ekutuphane/articles/2005/20050413.pdf`
   * Faz 1 başarıyla tamamlandı (2 adet geçerli PDF).
2. **Faz 2 (Refine Phase):**
   * ID 682 damıtıldı $\rightarrow$ `out/saglik-ekutuphane/01_refined_content_pool/articles/2025/20250682.md.gz` ve `json.gz` mühürlendi. Ham PDF `trash/articles/20250682.pdf` yoluna aktarıldı.
   * ID 413 damıtıldı (839.052 karakter $\rightarrow$ 301 KB gzip) $\rightarrow$ `out/` havuzuna mühürlendi. Ham PDF `trash/articles/20050413.pdf` yoluna aktarıldı.
   * Faz 2 başarıyla tamamlandı. `out/` havuzunda tek bir PDF bulunmadığı doğrulandı.

### B. Kriptografik Bütünlük Doğrulaması
Komut: `cd /home/l7v/protokol-data-pool/out/saglik-ekutuphane && sha256sum -c 00_map_index_pool/checksums.sha256`
Çıktı:
```text
01_refined_content_pool/articles/2025/20250682.md.gz: OK
01_refined_content_pool/articles/2025/20250682.json.gz: OK
01_refined_content_pool/articles/2005/20050413.md.gz: OK
01_refined_content_pool/articles/2005/20050413.json.gz: OK
```
`out/` altındaki damıtılmış tüm içerikler %100 doğrulandı.

### C. Proje Sağlık ve Test Denetimi
* `npm test`: 76/76 birim ve entegrasyon testi regressionsız geçti.
* `npm run doctor`: 7 aşamalı sağlık denetimi, secret taraması ve Biome linter tam uyumlu geçti.
* `npm run verify`: 6 aşamalı deterministik doğrulama hattı başarıyla tamamlandı.

---

## 3. Kullanıcı Çalıştırma Talimatları

* **Tüm Koleksiyonu Sırayla Çalıştırma (Önce Tümünü İndir $\rightarrow$ Sonra Tümünü Damıt):**
  ```bash
  npm run harvest:ekutuphane
  # veya
  node scripts/harvest-ekutuphane.mjs --tur all
  ```

* **Yalnızca İndirme Fazını Çalıştırma (İşleme yapmaz):**
  ```bash
  node scripts/harvest-ekutuphane.mjs --phase download
  ```

* **Yalnızca Damıtma Fazını Çalıştırma (İndirilmiş verileri işler):**
  ```bash
  node scripts/harvest-ekutuphane.mjs --phase refine
  ```

* **Sadece Belirli Bir Kategoriyi İndirme/İşleme:**
  ```bash
  node scripts/harvest-ekutuphane.mjs --tur books
  node scripts/harvest-ekutuphane.mjs --tur journals
  node scripts/harvest-ekutuphane.mjs --tur articles
  ```

* **Kesintiden Devam Etme (Resumable Execution):**
  İşlem herhangi bir sebeple durdurulursa (Ctrl+C, elektrik kesintisi vb.), aynı komut tekrar çalıştırıldığında `00_map_index_pool/checkpoint.json` okunarak doğrudan kalınan sayfadan devam eder; indirilen veya damıtılan hiçbir dosya mükerrer işlenmez.
