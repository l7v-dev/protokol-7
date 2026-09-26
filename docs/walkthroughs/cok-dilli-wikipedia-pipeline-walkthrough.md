# Çok Dilli Wikipedia LLM Veri Hattı Walkthrough

## 1. Genel Bakış

Bu çalışma, Türkçe Wikipedia dökümünün başarıyla işlenip mühürlenmesinin ardından, diğer dillerin Wikimedia dökümlerini makale sayısı en az olan dillerden başlayarak (ascending size-order) işleyen ve devasa dilleri (İngilizce, Almanca vb.) en sona bırakan çok dilli orkestratör modülünü (`multi_lang_orchestrator.py`) sisteme kazandırmıştır.

---

## 2. Geliştirilen Özellikler ve Sıralama Mekanizması

1. **`multi_lang_orchestrator.py`**:
   - Dillerin içerik makale sayısını (Namespace 0) Wikimedia Siteinfo API üzerinden dinamik olarak sorgular. Ağ kesintisi veya rate-limit durumlarında yerleşik referans tablosunu (`STATIC_WIKI_METRICS`) kullanır.
   - Dilleri kesinlikle **makale sayısına göre küçükten büyüğe** sıralar.
   - Sıralı tek-worker mimarisi ile her dil için:
     1. İndirme (`{lang}wiki-latest-pages-articles.xml.bz2`) ve resmi MD5 teyidi,
     2. Akışlı SAX parsing ve 10 GB ZSTD-6 Parquet parçalama,
     3. SQLite metadata ve manifest export'u (`{lang}wiki_{tarih}_manifest.json`),
     4. Google Drive aktarımı (`{lang}/data/` ve `{lang}/metadata/`),
     5. **Disk Temizliği:** Her dil bittiğinde diskte yer kalmasını sağlamak için ham `.xml.bz2` dökümü anında silinir (`--clean-dump`).

2. **Dinamik Dil Sıralama Örneği:**
   - Kademe 1 (Küçük Diller): `az` (~218k) -> `kk` (~245k) -> `el` (~273k) -> `uz` (~364k)
   - Kademe 2 (Orta Diller): `fa` (~1.09M) -> `ar` (~1.33M) -> `it` (~1.88M)
   - Kademe 3 (Büyük Diller): `es` (~2.05M) -> `ru` (~2.12M) -> `fr` (~2.70M) -> `de` (~3.15M)
   - Kademe 4 (En Büyük Dil): `en` (~7.05M madde, 22.5 GB bz2 - en son)

3. **`run_pipeline.py` Güncellemesi:**
   - `--lang` parametresi ile bağımsız tek dil çalıştırma desteği eklendi.
   - Programatik Python API (`execute_pipeline`) kazandırıldı.

---

## 3. Doğrulama ve Testler

- **Birim Testleri (`test_multi_lang.py`):**
  - `test_get_sorted_languages_ascending_order`: PASSED
  - `test_static_metrics_presence`: PASSED
  - Tüm test paketi (`pytest scripts/wikipedia_pipeline/`): **7/7 passed (2.96s)**.

---

## 4. Kullanım Talimatı

### Belirli Dilleri Sırayla İndirme (Küçükten Büyüğe):
```bash
npm run trwiki:multilang -- --langs az,uz,kk,el,fa --folder-id "https://drive.google.com/drive/folders/1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL"
```

### Kuru Çalışma (Dry-run Simülasyonu):
```bash
npm run trwiki:multilang -- --dry-run --langs az,kk,uz
```
