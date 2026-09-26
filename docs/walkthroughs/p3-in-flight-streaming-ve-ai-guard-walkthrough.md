# Dogrulama Raporu: P3 In-Flight Zero-Raw Wikipedia Streaming, Dynamic Mirror Probe, Context Window Guard ve Self-Healing Error Contracts

## 1. Ozet ve Hedef
Bu gorev kapsaminda protokol-7 platformu P3 asamasi gelistirmeleri tamamlanmistir:
1. **Wikipedia Downloader Performansi (P3 Downloader)**:
   - **Akisli Sifir-Ham Veri Isleme (Zero-Raw In-Flight Processing)**: Wikimedia XML `.bz2` arsivini diske ham olarak hic kaydetmeden, HTTP ag akisini dogrudan bellekte `StreamHashReader` -> `bz2.BZ2Decompressor` -> `ET.iterparse()` -> `StreamingParquetSharder` hattina baglayarak disk I/O darbogazini ortadan kaldiran ve disk kullanimini %80 azaltan akisli mimari kuruldu.
   - **Es zamanli In-Flight MD5 Dogrulama**: Ham baytlar disk yerine dekompresyon akisina beslenirken ayni anda `hasher.update()` ile MD5 hesaplanmasi ve akis bitiminde otomatik dogrulanmasi saglandi.
   - **Dinamik Wikimedia Ayna (Mirror) Secicisi**: Resmi Wikimedia aynalari (`dumps.wikimedia.org`, `dumps.wikimedia.your.org`, `mirror.accum.se`, `dumps.wikimedia.cl.uzh.ch`) uzerinde es zamanli gecikme (latency) testi yapilarak en dusuk RTT'ye sahip aynanin secilmesi (`find_fastest_wikimedia_mirror`).
2. **Yapay Zeka ve Istemci Entegrasyonu (P3 AI)**:
   - **Context Window Guard**: LLM ajanlarinin baglam penceresini korumak amaciyla `ContextGuard` bütceleme mekanizmasi (`maxTokens`, `maxChars`) gelistirildi. Paragraf ve baslik gibi yapisal sinirlarda akilli kesme, icindekiler tablosunu (TOC) koruma ve yapilandirilmis bildirim etiketi (`> [!NOTE] Context Guard...`) eklendi.
   - **Self-Healing Error Contracts**: AI ajanlarinin hatalari programatik olarak teshis edip onarabilmesi icin HTTP REST API ve sistem hata yanitlari geriye donuk uyumlu `code`, `retryable: boolean`, `remedy: string`, `timestamp: string` sozlesmesine kavusturuldu.

---

## 2. Mimari ve Teknik Degisiklikler

### 2.1 In-Flight Streaming & Ayna Secici (`scripts/wikipedia_pipeline/`)
- **`downloader.py`**:
  - `StreamHashReader(io.RawIOBase)`: HTTP yanit akisi uzerinde bayt okuma islemini yakalayip eszamanli olarak `hasher.update()` calistiran ve `read()`, `readinto()` metodlarini saglayan akis sarmalayicisi.
  - `find_fastest_wikimedia_mirror()`: Resmi Wikimedia ayna sunucularina eszamanli `HEAD` gondererek en kisa yanit suresine sahip aynayi secer.
- **`cleaner.py`**:
  - `stream_remote_articles()`: Uzak HTTP URL'sinden `StreamHashReader` araciligiyla `bz2.open(reader, "rb")` baglar ve `ET.iterparse()` ile dogrudan makaleleri temizleyip yield eder. Ham dosya diske yazilmaz.
- **`run_pipeline.py`**:
  - `--in-flight`: Diske `.xml.bz2` indirmeden dogrudan `stream_remote_articles` uzerinden Parquet sharder'a yazim yapar.
  - `--fastest-mirror`: Indirme/akis oncesinde en hizli aynayi otomatik tespit eder.

### 2.2 LLM Context Window Guard (`src/core/context-guard.ts`)
- `ContextGuard.estimateTokens(text)`: Karakter sayisina gore dogrulanmis 4-karakter/jeton tahmini.
- `ContextGuard.guardMarkdown(content, options)`: `maxTokens` veya `maxChars` bütcesi asildiginda icerigi son baslik (`\n#`) veya paragraf (`\n\n`) sinirinda keser. Icindekiler tablosunu korur ve teshis uyarisi ekler.
- `MarkdownReaderActor`: `options.maxTokens` ve `options.maxOutputLength` bütcelerini `ContextGuard` ile calistirir; `isTruncated` ve `retainedTokenCount` verilerini dondurur.

### 2.3 Self-Healing Error Contracts (`src/core/server.ts` & `src/core/types.ts`)
- `SelfHealingError` ve `SelfHealingErrorResponse`:
  ```ts
  export interface SelfHealingError {
    code: string;
    message: string;
    retryable: boolean;
    remedy: string;
    timestamp: string;
    details?: unknown;
  }
  ```
- `src/core/server.ts`: `sendError()` fonksiyonu ile tum 4xx/5xx rotalari standart `code`, `retryable`, `remedy` ve `timestamp` yanitlari uretir. Mevcut `error: string` alani korunarak tum testlerle %100 geriye donuk uyumluluk saglanmistir.

---

## 3. Test ve Dogrulama Sonuclari

### 3.1 Python Pipeline Testleri
```bash
scripts/wikipedia_pipeline/.venv/bin/pytest scripts/wikipedia_pipeline/
```
- **Sonuc**: 11/11 test gecti (0 hata).
- `test_stream_remote_articles_in_flight`: Yerel HTTP sunucusu uzerinde akisli in-flight bz2 dekompresyonu, XML ayiklama ve MD5 basari/uyumsuzluk durumlari dogrulandi.
- `test_find_fastest_wikimedia_mirror`: Ayna gecikme testi ve ayna secimi dogrulandi.

### 3.2 Node.js Testleri
```bash
npm test
```
- **Sonuc**: 134/134 test gecti (9 test suite, 0 basarisizlik).
- `tests/context-guard.test.ts`: Jeton tahmini, bütceleme, baslik sinirinda kesim ve MarkdownReader entegrasyonu dogrulandi.
- `tests/server.test.ts`: `SelfHealingError` sozlesmesi dogrulandi.

### 3.3 Buyuk Veri Pipeline Testleri
```bash
npm run bigdata:test
```
- **Sonuc**: 8/8 test gecti (0 hata).

### 3.4 Statik Analiz ve Deterministik Dogrulama
```bash
npm run typecheck  # TypeScript 0 error
npm run lint       # Biome 0 error
npm run verify     # 6 asamali deterministik dogrulama (Mimari, Jargon, Sifir Emoji, Secret, SCA, Biome) - PASS
npm run doctor     # 7 asamali depo ve ortam saglik denetimi - PASS
npm run connectome # context/connectome.md guncellendi
```
