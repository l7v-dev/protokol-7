# Sistem Hataları Giderimi ve Downloader Konsolidasyonu Planı

**Tarih:** 2026-09-26  
**Tier:** 2 (Geniş Etki Alanı, Çoklu Modül)  
**Hedef:** Kod tabanında tespit edilen 10 kritik/mantıksal/algoritmik hatanın düzeltilmesi ve tekilleştirilmiş tek bir Wikipedia downloader yapısına geçilmesi.

---

## 1. Giderilecek Hatalar Envanteri

1. **MCP Sunucusu Seçenek Eşleme Açığı:** `src/mcp/protokol-mcp-server.ts` içinde 6 aktörün (`wikimedia`, `openalex`, `stack-exchange`, `gutenberg`, `europe-pmc`, `ietf-rfc`) seçeneklerinin `task.options` alanına map edilmesi.
2. **GutenbergActor Kırpma Sırası:** `src/actors/gutenberg-actor.ts` içinde metin boyut sınırlandırmasından önce lisans başlık/son işaretlerinin temizlenmesi.
3. **Çok Dilli Wikipedia Dil Kodu ve URL Alanı:** `scripts/wikipedia_pipeline/cleaner.py` ve `run_pipeline.py` içinde makale URL'sinin hedef dil koduna göre (`{lang}.wikipedia.org`) dinamik üretilmesi.
4. **Downloader Mevcut Dosya Doğrulama Denetimi:** `scripts/wikipedia_pipeline/downloader.py` içinde `verify_file_md5` başarısız olduğunda dosyanın geçersiz kılınması ve yeniden indirme/hata akışına alınması.
5. **Ağ Yeniden Deneme (Retry) Sözleşmesi:** `src/network/safe-redirect-fetcher.ts` içinde `fetch()` yanıtının 429 veya 5xx durum kodlarında `withRetry` mekanizmasını tetiklemesi.
6. **EuropePmcActor Hostname Desteği:** `src/actors/europe-pmc-actor.ts` içinde `ebi.ac.uk` alan adının API URL denetimine eklenmesi.
7. **OpenAlexActor DOI Endpoint İzolasyonu:** `src/actors/openalex-actor.ts` içinde DOI sorgularında `baseEndpoint` alanının korunması.
8. **BrowserPool Inline/Data URI Muafiyeti:** `src/browser/browser-pool.ts` içinde `data:`, `blob:`, `about:` URI'lerinin SSRF engellemesinden muaf tutulması.
9. **ContextGuard Metrik Uyumu:** `src/core/context-guard.ts` içinde kırpılan metriklerin (`retainedTokens` ve `retainedChars`) nihai çıktı ile tutarlı hale getirilmesi.
10. **Şablon Kalıntısı Temizliği:** `src/extractors/readability-extractor.ts` içinde `agent-smith.local` alan adının `protokol-7.internal` olarak güncellenmesi.
11. **Downloader Konsolidasyonu:** `notebooks/wikipedia_drive_downloader.ipynb` dosyasının silinmesi, tek resmi indiricinin `scripts/wikipedia_pipeline/downloader.py` olarak belgelenmesi.

---

## 2. Doğrulama ve Kabul Kriterleri

- Tüm mevcut testler (161 Node.js testi, 11 Python testi, 8 Big Data testi) başarıyla geçmeli.
- Yeni eklenen veya güncellenen mantıklar için yeni birim testler eklenmeli.
- `npm run verify` 6 katmanlı denetim hattından (mimari bütünlük, sıfır emoji, isimlendirme, SCA, Biome lint) sıfır hatayla geçmeli.
