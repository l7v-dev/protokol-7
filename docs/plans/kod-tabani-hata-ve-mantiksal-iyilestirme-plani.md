# Kod Tabanı Hata Düzeltmeleri, Mantıksal ve Kaynak İyileştirmeleri Planı

Bu plan, Protokol-7 kod tabanında yapılan derin denetimde tespit edilen 9 adet teknik hatanın, kaynak sızıntısının ve mantıksal uyumsuzluğun giderilmesini kapsar.

## Hedefler
1. `scripts/doctor.mjs` içindeki gizli anahtar tarama mantığının `.gitignore` ve `scripts/verify-pipeline.mjs` ile tam uyumlu hale getirilmesi (`service_account.json`, `credentials.json`, `token.json` istisnaları).
2. `scripts/bigdata_pipeline/metadata_catalog.py` ve `scripts/wikipedia_pipeline/metadata_db.py` içindeki SQLite bağlantı sızıntılarının `@contextmanager` deseniyle sonlandırılması (`ResourceWarning: unclosed database` çözümü).
3. `scripts/download-wikipedia-drive.mjs` içerisindeki dosya akışına `stream/promises` (`finished`) ve `drain` backpressure mekanizması eklenerek MD5 yarış durumu ve bellek şişmesinin önlenmesi.
4. `src/core/store-router.ts` üzerinde aktör çalıştırma parametrelerinin (`arxivOptions`, `serpOptions`, `apiExtractorOptions`, `networkInterceptorOptions`, `pdfOptions`) eksiksiz aktarımı ve sonuç sayımında `papers` / `results` desteği.
5. `src/actors/serp-search-actor.ts` üzerinde `task.targetUrl` tanımsız olduğunda oluşan `TypeError` çökmesinin giderilmesi.
6. `src/network/safe-redirect-fetcher.ts` üzerinde HTTP yönlendirmelerinde açık kalan yanıt gövdelerinin (`response.body?.cancel()`) temizlenmesi.
7. `src/browser/browser-pool.ts` üzerinde oturum edinme (`acquireSession`) sırasında oluşabilecek hatalarda context ve activeContexts sızıntısının engellenmesi.
8. `src/network/proxy-manager.ts` üzerinde tekil kullanıcı adı veya parola ile çalışan proxy'lerin desteklenmesi.
9. `src/actors/sitemap-xml-actor.ts` üzerinde zamanlayıcı temizliğinin `finally` bloğuna alınması.
10. `src/network/politeness-limiter.ts` üzerinde bellek içi `domainStates` haritasına LRU/TTL tahliyesi eklenmesi.

## Değişiklik Yapılacak Dosyalar
- `scripts/doctor.mjs`
- `scripts/bigdata_pipeline/metadata_catalog.py`
- `scripts/wikipedia_pipeline/metadata_db.py`
- `scripts/download-wikipedia-drive.mjs`
- `src/core/store-router.ts`
- `src/actors/serp-search-actor.ts`
- `src/network/safe-redirect-fetcher.ts`
- `src/browser/browser-pool.ts`
- `src/network/proxy-manager.ts`
- `src/actors/sitemap-xml-actor.ts`
- `src/network/politeness-limiter.ts`
- `TASKS.md`
- `context/architecture-schema.md`
- `context/connectome.md`

## Doğrulama Planı
- `npm run doctor`
- `npm run verify`
- `npm run test` (117 test)
- `npm run typecheck`
- `npm run bigdata:test` (8 test, 0 warning)
- `npm run connectome`
