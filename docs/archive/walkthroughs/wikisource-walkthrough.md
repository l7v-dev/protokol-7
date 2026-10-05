# Wikisource Aktörü ve 85 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı Walkthrough

Bu doküman, Wikimedia kardeş projelerinden **Wikisource** için geliştirilen 46. aktörün (`WikisourceActor`) ve dünyadaki tüm 85 Wikisource dil sürümünü (antik ve klasik diller dahil) doğrudan Google Drive'a zstd-6 Parquet olarak aktaran sıfır disk artığı (zero disk residue) ETL boru hattının doğrulama raporudur.

---

## 1. Mimari Bileşenler

| Bileşen | Dosya Yolu | Sorumluluk / Mekanizma |
|---|---|---|
| **Wikisource Aktörü** | `src/actors/corpus/wikisource-actor.ts` | 85+ dilde resmi Wikimedia REST ve Action API üzerinden birincil edebi/tarihi metinleri, şiir/dize yapısını koruyarak Markdown'a dönüştürür. SSRF korumalıdır. |
| **XML Akış Temizleyici** | `scripts/wikisource_pipeline/cleaner.py` | O(1) sabit RAM iterparse ile `.xml.bz2` dökümünü okur. Şiir (`<poem>`) formatını korurken şablonları, gezinme menülerini ve tarama artefaktlarını ayıklar. |
| **Parquet Paketleyici** | `scripts/wikisource_pipeline/packer.py` | Zstandard-6 sıkıştırmasıyla RowGroup tamponlamalı Parquet parçaları üretir (`wikisource_<lang>_<tarih>_partXXXXX_zstd.parquet`). |
| **Dump İndirici** | `scripts/wikisource_pipeline/downloader.py` | Wikimedia döküm sunucuları veya küresel aynalarından akış indirir. Dosya silme kancaları içerir. |
| **Google Drive Eşitleyici** | `scripts/wikisource_pipeline/drive_sync.py` | Hedef Google Drive kök klasöründe (`1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL`) `Wikisource/<lang>/` klasör hiyerarşisi açar, parçayı yükler, sunucu MD5 karmasını yerel karma ile doğrular ve yerel parçayı **anında siler**. |
| **Çok Dilli Orkestratör** | `scripts/wikisource_pipeline/orchestrator.py` | SQLite tabanlı (`data/wikisource_catalog.sqlite`) durum takip defteri ile 85 dili küçükten büyüğe sıralı ve kesintiye dayanıklı olarak işler. |

---

## 2. Sıfır Disk Artığı (Zero Disk Residue) Doğrulaması

Kullanıcının kesin talimatı gereği, ham `.xml.bz2` dump arşivleri ve yerel `.parquet` dosyaları diskte **asla tutulmaz**:

```
[Wikimedia Sunucusu] 
       │ (HTTP Stream)
       ▼
[temp_wikisource/*.xml.bz2] ──── (iterparse streaming) ───► [shards/*.parquet]
       │                                                           │ (Google Drive v3)
       ▼ (Ayrıştırma biter bitmez)                                 ▼
   [ANINDA SİLİNİR]                                        [Google Drive'a Yükleme]
                                                                   │ (md5Checksum PASS)
                                                                   ▼
                                                            [ANINDA SİLİNİR]
```

### Canlı Test Kanıtı:
- **Eski İngilizce (`ang`):** 
  - İndirildi: `0.01 MB`
  - Parquet'ye işlendi: `4 works, 0.02 MB`
  - Ham dump anında silindi: `Freed: 0.01 MB`
  - Google Drive'a yüklendi: `Drive ID: 1gLVhNhN8X8943P26ShfHsF6iG30WrRC5`
  - Parquet parçası anında silindi: `Freed: 0.02 MB`
  - Kalan artık disk alanı: `0 Byte` (`find data/temp_wikisource/ -type f` boş döndü)

- **Sanskritçe (`sa` - 221.58 MB Ham Dump):**
  - İndirildi: `221.58 MB` (46.1 saniyede)
  - Parquet'ye işlendi: `50 works (limitli test), 0.19 MB`
  - Ham dump anında silindi: `Freed: 221.58 MB`
  - Google Drive'a yüklendi: `Drive ID: 1_2BZ_YUpi3QrFsB-vXbiVv-FXoLibi4D`
  - Parquet parçası anında silindi: `Freed: 0.19 MB`
  - Kalan artık disk alanı: `0 Byte`

---

## 3. Test ve Doğrulama Sonuçları

1. **Birim ve Entegrasyon Testleri (`tests/wikisource-actor.test.ts`, `tests/server.test.ts`, `tests/protokol-mcp-server.test.ts`):**
   - 73/73 test başarıyla geçti.
2. **TypeScript Derleme Denetimi (`npm run typecheck`):**
   - `tsc --noEmit` sıfır hata ile tamamlandı.
3. **Deterministik Doğrulama Hattı (`npm run verify`):**
   - 6 katmanlı denetim (Mimari Bütünlük, İsimlendirme Disiplini, Sıfır Emoji, Secret Taraması, SCA Paket Analizi, Biome Statik Analizi) eksiksiz geçti.

---

## 4. Kullanım ve Çalıştırma Komutları

### Boru Hattı Durumunu Görme:
```bash
trash/wikipedia_pipeline/.venv/bin/python scripts/wikisource_pipeline/orchestrator.py --status
```

### Sadece Antik ve Klasik Dilleri Hasat Etme (`ang`, `la`, `sa`, `sourceswiki`, `yi`):
```bash
trash/wikipedia_pipeline/.venv/bin/python scripts/wikisource_pipeline/orchestrator.py --ancient-only
```

### Tek Bir Dili Çalıştırma (Örnek: Türkçe `tr`, Latince `la`):
```bash
trash/wikipedia_pipeline/.venv/bin/python scripts/wikisource_pipeline/orchestrator.py --lang tr
trash/wikipedia_pipeline/.venv/bin/python scripts/wikisource_pipeline/orchestrator.py --lang la
```

### Tüm 85 Dili Sıralı Olarak Arka Planda Başlatma (Otomatik Resumption ve Hata İzolasyonu):
```bash
nohup trash/wikipedia_pipeline/.venv/bin/python scripts/wikisource_pipeline/orchestrator.py --all > wikisource_harvest.log 2>&1 &
```
