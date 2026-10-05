# Wiktionary Aktörü ve 198 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı Walkthrough

Bu doküman, Wikimedia kardeş projelerinden **Wiktionary (Vikisözlük)** için geliştirilen 47. aktörün (`WiktionaryActor`) ve dünyadaki tüm 198 Wiktionary dil sürümünü doğrudan Google Drive'a zstd-6 Parquet olarak aktaran sıfır disk artığı (zero disk residue) ETL boru hattının doğrulama ve yürütme raporudur.

---

## 1. Mimari Bileşenler

| Bileşen | Dosya Yolu | Sorumluluk / Mekanizma |
|---|---|---|
| **Wiktionary Aktörü** | `src/actors/corpus/wiktionary-actor.ts` | 198+ dilde resmi Wikimedia Wiktionary REST ve Action API üzerinden kelime tanımları, sözcük türleri, örnekler, etimoloji ve çevirileri yapılandırılmış Markdown olarak çeker. SSRF korumalıdır. |
| **Teknik Wiki Şartnamesi** | `docs/actors/wiktionary.md` | Mermaid mimari akış, sıralama ve durum diyagramları, REST/MCP arayüz sözleşmeleri. |
| **XML Akış Temizleyici** | `scripts/wiktionary_pipeline/cleaner.py` | $\mathcal{O}(1)$ sabit RAM iterparse ile `.xml.bz2` dökümünü okur. Başlıkları, tanımları ve örnekleri ayıklar; şablon ve gürültüleri temizler. |
| **Parquet Paketleyici** | `scripts/wiktionary_pipeline/packer.py` | Zstandard-6 sıkıştırmasıyla RowGroup tamponlamalı Parquet parçaları üretir (`wiktionary_<lang>_<tarih>_partXXXXX_zstd.parquet`). |
| **Dump İndirici** | `scripts/wiktionary_pipeline/downloader.py` | Wikimedia döküm sunucuları veya küresel aynalarından akış indirir; işleme biter bitmez silme kancalarını çalıştırır. |
| **Google Drive Eşitleyici** | `scripts/wiktionary_pipeline/drive_sync.py` | Hedef Google Drive kök klasöründe (`1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL`) `Wiktionary/<lang>/` klasörü açar, parçayı yükler, sunucu MD5 karmasını yerel karma ile doğrular ve yerel dosyayı **anında siler**. |
| **Çok Dilli Orkestratör** | `scripts/wiktionary_pipeline/orchestrator.py` | SQLite tabanlı (`data/wiktionary_catalog.sqlite`) durum takip defteri ile 198 dili sıralı, kesintiye dayanıklı ve sıfır disk artığı ile hasat eder. |

---

## 2. Sıfır Disk Artığı (Zero Disk Residue) Doğrulaması

Kullanıcının kesin talimatı doğrultusunda, ham `.xml.bz2` dump arşivleri ve üretilen yerel `.parquet` dosyaları diskte **asla tutulmaz**:

```
[Wikimedia Döküm Sunucusu] 
           │ (HTTP Stream)
           ▼
[temp_wiktionary/*.xml.bz2] ──── (iterparse streaming) ───► [shards/*.parquet]
           │                                                               │ (Google Drive v3)
           ▼ (Ayrıştırma biter bitmez)                                     ▼
     [ANINDA SİLİNİR]                                             [Google Drive'a Yükleme]
                                                                           │ (md5Checksum PASS)
                                                                           ▼
                                                                    [ANINDA SİLİNİR]
```

### Canlı Test Kanıtı (Eski İngilizce / `ang`):
- **İndirildi:** `angwiktionary-latest-pages-articles.xml.bz2` (0.68 MB)
- **Parquet'ye İşlendi:** `2,138` leksikal madde, 0.15 MB
- **Ham Dump Anında Silindi:** `Freed: 0.68 MB`
- **Google Drive'a Yüklendi:** `Drive ID: 1mgiDB-5-_K7GveC-lbSCJETcOUzLy-5O` (Klasör: `Wiktionary/ang`)
- **Yerel Parquet Anında Silindi:** `Freed: 0.15 MB`
- **Kalan Artık Disk Alanı:** `0 Byte` (`find data/temp_wiktionary/ -type f` boş döndü)

---

## 3. Test ve Doğrulama Sonuçları

1. **Birim ve Entegrasyon Testleri (`tests/wiktionary-actor.test.ts`, `tests/server.test.ts`, `tests/protokol-mcp-server.test.ts`):**
   - 78/78 test başarıyla geçti (0 hata).
2. **TypeScript Derleme Denetimi (`npm run typecheck`):**
   - `tsc --noEmit` sıfır hata ile tamamlandı.
3. **Deterministik Doğrulama Hattı (`npm run verify`):**
   - 6 katmanlı denetim eksiksiz geçti.

---

## 4. Kullanım ve Çalıştırma Komutları

```bash
# 1. Mevcut hasat durum tablosunu inceleme:
.venv/bin/python scripts/wiktionary_pipeline/orchestrator.py --status

# 2. Yalnızca antik ve klasik dilleri hasat etme (ang, la, sa, grc, yi, fro, non, got, cu):
.venv/bin/python scripts/wiktionary_pipeline/orchestrator.py --ancient-only

# 3. Belirli tek bir dili çalıştırma (Örn: Türkçe veya Latince):
.venv/bin/python scripts/wiktionary_pipeline/orchestrator.py --lang tr
.venv/bin/python scripts/wiktionary_pipeline/orchestrator.py --lang la

# 4. Dünyadaki tüm 198 dili kesintisiz olarak arka planda çalıştırma:
nohup .venv/bin/python scripts/wiktionary_pipeline/orchestrator.py --all > wiktionary_harvest.log 2>&1 &
```
