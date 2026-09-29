# Gutenberg, StackExchange, OpenAlex ve Semantic Scholar Drive Entegrasyon Kılavuzu

## 1. Mimari Genel Bakış

Dört büyük metin ve akademik kaynak için Google Drive v3 entegrasyonlu, sıfır yerel disk artığı (zero-disk residue) prensibiyle çalışan uçtan uca ETL boru hatları inşa edilmiştir.

| Pipeline | Kaynak | Veri Tipi | Sıkıştırma / Çıktı | Drive Hedef Klasörü | Durum |
|---|---|---|---|---|---|
| **Gutenberg** | Gutendex API | ~70.000 Tam Metin Kitap | Zstd Parquet (4 GB Shard) | `Gutenberg/` | Hazır, Testler Tam (10/10) |
| **StackExchange** | archive.org 7z Dumps | ~100M+ Soru/Cevap Konusu | Zstd Parquet (4 GB Shard) | `StackExchange/<site>/` | Hazır, Testler Tam (12/12) |
| **OpenAlex** | OpenAlex API Works | OA Akademik Çalışmalar | Zstd Parquet (4 GB Shard) | `OpenAlex/` | Hazır, Testler Tam (18/18) |
| **Semantic Scholar** | S2 Graph API Bulk | S2ORC / S2AG Makaleler | Zstd Parquet (4 GB Shard) | `SemanticScholar/` | Hazır, Testler Tam (24/24) |

---

## 2. Sıfır Disk Artığı ve Doğrulama Döngüsü

Boru hatlarının tamamı aşağıdaki döngüyü işletir:
1. **Streaming / Ingestion**: Ham veri akışı (HTTP cursor veya arşiv akışı).
2. **Cleaning & Quality Gate**: Gereksiz etiket/boilerplate temizliği, minimum token/kelime eşikleri.
3. **Parquet Sharding**: PyArrow ile Zstandard (seviye 3) sıkıştırmalı Parquet dosyalarına yazım.
4. **Drive Upload & MD5 Verification**: Google Drive v3 API ile resumable chunk upload, dönen remote MD5 ile yerel MD5 sağlama kontrolü.
5. **Zero-Disk Cleanup**: Yükleme ve MD5 doğrulaması tamamlanır tamamlanmaz yerel `.parquet` dosyası anında silinir.
6. **SQLite Ledger Checkpointing**: Kesintilere karşı `data/<corpus>_catalog.sqlite` üzerinde işlem durumları saklanır, yeniden başlatıldığında kaldığı yerden devam eder.

---

## 3. Test Doğrulaması

Tüm boru hatlarının birim testleri `.venv/bin/python` ortamında koşturulmuştur:

```bash
npm run test:corpus-pipelines
```

Çıktı özeti:
- `test_gutenberg_pipeline.py`: 10 test (Geçti)
- `test_stackexchange_pipeline.py`: 12 test (Geçti)
- `test_openalex_pipeline.py`: 18 test (Geçti)
- `test_semanticscholar_pipeline.py`: 24 test (Geçti)
- **Toplam**: 64/64 test başarılı.

---

## 4. Kullanıcı Canlı Çalıştırma Komutları

### 4.1. Project Gutenberg Boru Hattı

```bash
# Durum kontrolü
.venv/bin/python scripts/gutenberg_pipeline/orchestrator.py --status

# Kuru çalıştırma (ilk 100 kitap, Drive yüklemesiz test)
.venv/bin/python scripts/gutenberg_pipeline/orchestrator.py --all --limit 100 --dry-run

# Canlı tam hasat (Google Drive'a yükler ve yerel diski temizler)
.venv/bin/python scripts/gutenberg_pipeline/orchestrator.py --all
```

### 4.2. StackExchange Boru Hattı

```bash
# Durum kontrolü
.venv/bin/python scripts/stackexchange_pipeline/orchestrator.py --status

# Tek site kuru çalıştırma (ör. devops veya coffee)
.venv/bin/python scripts/stackexchange_pipeline/orchestrator.py --site devops --dry-run

# Priority 1 siteleri canlı hasat et
.venv/bin/python scripts/stackexchange_pipeline/orchestrator.py --all --priority 1

# Tüm siteleri sırayla hasat et (resumable)
.venv/bin/python scripts/stackexchange_pipeline/orchestrator.py --all
```

### 4.3. OpenAlex Boru Hattı

```bash
# Durum kontrolü
.venv/bin/python scripts/openalex_pipeline/orchestrator.py --status

# Kuru çalıştırma (ilk 2000 çalışma)
.venv/bin/python scripts/openalex_pipeline/orchestrator.py --all --dry-run

# Belirli yıllar için canlı çalıştırma (ör. 2022-2024 OA)
.venv/bin/python scripts/openalex_pipeline/orchestrator.py --all --year-from 2022 --year-to 2024

# Tam açık erişim hasadı (resumable)
.venv/bin/python scripts/openalex_pipeline/orchestrator.py --all
```

### 4.4. Semantic Scholar Boru Hattı

```bash
# Durum kontrolü
.venv/bin/python scripts/semanticscholar_pipeline/orchestrator.py --status

# Kuru çalıştırma (ilk 2000 makale)
.venv/bin/python scripts/semanticscholar_pipeline/orchestrator.py --all --dry-run

# Alan bazlı canlı filtreleme (ör. Bilgisayar Bilimi, alıntı >= 10)
.venv/bin/python scripts/semanticscholar_pipeline/orchestrator.py --all --fields "Computer Science" --min-citations 10

# Tam hasat (resumable)
.venv/bin/python scripts/semanticscholar_pipeline/orchestrator.py --all
```
