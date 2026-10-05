# Sistem Hataları Giderimi ve Downloader Konsolidasyonu Walkthrough

## 1. Genel Bakış
Bu çalışma kapsamında kod tabanındaki mantıksal, algoritmik ve entegrasyon hataları giderilmiş, yinelenen downloader kodu (`notebooks/wikipedia_drive_downloader.ipynb`) kaldırılarak indirme mantığı tek bir yapıda (`scripts/wikipedia_pipeline/downloader.py`) konsolide edilmiştir.

## 2. Gerçekleştirilen Düzeltmeler

### 2.1. MCP Sunucu Seçenek Aktarımı (`src/mcp/protokol-mcp-server.ts`)
- **Sorun:** MCP `tools/call` çağrılarında son eklenen 6 aktöre (`wikimedia`, `openalex`, `stack-exchange`, `gutenberg`, `europe-pmc`, `ietf-rfc`) ait opsiyonlar (`wikimediaOptions`, `openalexOptions`, vb.) `task.options` nesnesine aktarılmıyordu.
- **Düzeltme:** Tüm aktör opsiyon parametreleri `executeActorTask` çağrısına eksiksiz olarak eşlendi.

### 2.2. Gutenberg Aktörü Metin Kesme Sırası (`src/actors/gutenberg-actor.ts`)
- **Sorun:** `downloadAndCleanTexts` metodunda `maxBytes` sınırı Gutenberg yasal başlıkları ayıklanmadan önce uygulanıyordu; küçük `maxBytes` değerlerinde başlık temizlenemiyordu.
- **Düzeltme:** Önce `stripGutenbergHeaders(rawText)` çalıştırıldı, ardından `maxBytes` sınırı uygulandı.

### 2.3. Wikipedia Boru Hattı Dinamik Dil Desteği (`scripts/wikipedia_pipeline/cleaner.py` & `run_pipeline.py`)
- **Sorun:** `stream_articles` ve `stream_remote_articles` fonksiyonlarında URL oluşturulurken `tr.wikipedia.org` sabit kodlanmıştı; çok dilli orkestrasyon doğru URL üretemiyordu.
- **Düzeltme:** `lang: str = "tr"` parametresi eklendi ve `f"https://{lang}.wikipedia.org/wiki/{safe_title}"` formatı kullanıldı. `run_pipeline.py` üzerinden `lang=lang` argümanı bağlandı.

### 2.4. Yerel Dosya MD5 Bozulma Kontrolü (`scripts/wikipedia_pipeline/downloader.py`)
- **Sorun:** Mevcut bir dosyanın MD5 doğrulaması başarısız olduğunda işlem sessizce devam ediyor veya hatalı dosya geçerli kabul ediliyordu.
- **Düzeltme:** MD5 eşleşmezse `stderr` üzerinden loglama yapılıp bozuk dosya yeniden indirilmek üzere akışa alındı.

### 2.5. HTTP 429 / 5xx Yeniden Deneme Mekanizması (`src/network/safe-redirect-fetcher.ts`)
- **Sorun:** `safeRedirectFetch` `withRetry` ile sarmalanmıştı ancak Node `fetch` 429/5xx yanıtlarında hata fırlatmadığı için yeniden deneme tetiklenmiyordu.
- **Düzeltme:** `executeAttempt` içinde durum kodu 429 veya 500+ olduğunda `Retry-After` başlığı parse edilerek `withRetry` tetiklendi.

### 2.6. Europe PMC Ana Makine Çözümleme (`src/actors/europe-pmc-actor.ts`)
- **Sorun:** Europe PMC REST API hem `europepmc.org` hem de `ebi.ac.uk` altında barınmaktadır; yalnızca `europepmc.org` kabul ediliyordu.
- **Düzeltme:** `buildApiUrl` içinde her iki alan adı da geçerli kabul edildi.

### 2.7. OpenAlex DOI Uç Noktası Koruması (`src/actors/openalex-actor.ts`)
- **Sorun:** `doi` sorgularında `baseEndpoint` ezilerek `https://api.openalex.org` sabit adresi zorlanıyordu.
- **Düzeltme:** Özel ya da proxy `baseEndpoint` yapılandırmasını koruyacak şekilde düzeltildi.

### 2.8. Tarayıcı Havuzu Bellek İçi URL Doğrulama (`src/browser/browser-pool.ts`)
- **Sorun:** `data:`, `blob:` ve `about:` gibi bellek içi şemalar SSRF DNS çözümlemesine tabi tutulup engelleniyordu.
- **Düzeltme:** Bellek içi şemalar SSRF DNS denetiminden muaf tutuldu.

### 2.9. ContextGuard Metrik Tutarlılığı (`src/core/context-guard.ts`)
- **Sorun:** `retainedChars` metriği budanmış gövde metnini değil, ek metaveriler içeren `finalContent.length` değerini yansıtıyordu.
- **Düzeltme:** `retainedTokens` ile birebir uyumlu olacak biçimde budanmış metin uzunluğuyla senkronize edildi.

### 2.10. ReadabilityExtractor Varsayılan Alan Adı (`src/extractors/readability-extractor.ts`)
- **Sorun:** Geçici şablon kalıntısı `agent-smith.local` alan adı kullanılıyordu.
- **Düzeltme:** Nötr kurumsal iç alan adı `protokol-7.internal` ile değiştirildi.

### 2.11. Downloader Konsolidasyonu
- **İşlem:** `notebooks/wikipedia_drive_downloader.ipynb` kaldırıldı; tek yetkili indirme motoru olarak `scripts/wikipedia_pipeline/downloader.py` bırakıldı. `context/architecture-schema.md` güncellendi.

## 3. Doğrulama ve Test Sonuçları

- **Node.js Testleri (`npm test`):** 166/166 başarılı (0 hata, 0 atlama).
- **Python Pipeline Testleri (`pytest`):** 12/12 başarılı (0 hata).
- **Statik Tip ve Lint Denetimi (`npm run lint && npm run typecheck`):** Sıfır hata.
- **Deterministik Doğrulama Hattı (`npm run verify`):** 6 katmanın tümünden (Mimari, İsimlendirme, Sıfır Emoji, Secret Detection, SCA, Biome) başarıyla geçti.
