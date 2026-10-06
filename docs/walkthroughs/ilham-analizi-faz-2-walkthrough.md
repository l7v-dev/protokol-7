# Ilham Analizi Faz 2 — HTTP katmani ilerlemesi

Durum: Faz 2 kod entegrasyonu ve izole dogrulama tamamlandi; canli URL kabul testi ve uretim aktivasyonu yok. Pipeline bakimi suruyor.

## Uygulanan

- `safe_http.py`: HTTP(S) ve credentialsiz URL; tum DNS adaylari public olmali. Numeric sockaddr'a baglanilir, peer adresi istek gonderilmeden once dogrulanir. TLS orijinal hostname ile sertifika kontrolunu korur. Implicit proxy kullanilmaz. Her redirect ayni transport denetiminden gecer; HTTPS downgrade reddedilir, origin degisiminde Authorization/Cookie kaldirilir. `SSRF_PROTECTION=false` acik opt-out'tur, varsayilan true.
- `error_classifier.py`: secili network hatalari ve 429/499/500/502/503/504/520-530 tekrar denenebilir. Sertifika, permission, disk-full, schema ve bilinmeyen hatalar tekrar denenmez.
- `retry_policy.py`: constant/exponential/random, attempt ve delay sinirlari, overflow korumasi, monotonic toplam retry scheduling butcesi. Her request timeout'u transport'a aittir. Retry-After saniye veya HTTP-date; varsayilan cap 30 saniye. Son hata tekrar firlatilir; son denemeden sonra sleep yok.
- DOAJ, DergiPark ve Aperta metadata HTTP cagrilari ortak transport/policy kullanir. 404 mevcut bos sonuc davranisini korur. Diger fatal durumlar ve tukenen 429 bos sonuc sayilmaz. HTTP retry bir request kapsamindadir; generator replay yapilmaz.

## Dogrulama

- 9 retry/classifier ve 8 transport testi: private/mapped/multicast adres, mixed DNS, numeric pinning, peer mismatch, TLS hostname, credentials ve downgrade; fatal hatalar, butce, header, retry tuketimi.
- 4 offline kaynak checkpoint testi.
- Kaynak testleri ayri Python sureclerinde: DOAJ 8, Aperta 11, DergiPark 23. Tek pytest surecinde ortak `cleaner` modulu adlari collection collision olusturdu; kaynak dosyalari degistirilmeden izole sureclerle gecti.
- Canli URL cekimi yapilmadi; uretim daemon'lari baslatilmadi.

## Bekleyen

Opsiyonel curl backend, CLI secimi ve step-up testleri. curl_cffi mevcut ortamda kurulu degil. Backend ayni DNS/redirect/peer guvencesini korumadan otomatik step-up etkinlestirilmeyecek. Faz 2 kabul kriterleri henuz tamamlanmadi.

## Ikinci entegrasyon dilimi

DergiPark resolver/PDF ve Aperta asset cagrilari safe_http kullanir. PDF byte siniri korunur. Network retry siniflandirmasi fatal adres/certificate hatalarini tekrar denemez. Aperta asset ortak RetryPolicy kullanir; resolver/PDF mevcut bounded loop ve cooldown davranisini korur, Retry-After parser'i kullanir. Challenge detector title, challenge id ve turnstile alanlarini okur; tespit edilen yanit retry edilmeden kaynak verisinden ayrilir. Challenge cozumleme yapilmaz.

Dedicated monitoring kataloguna retry_config JSON nullable kolonu mevcut katalog acilisinda eklenir. Monitored execution context icinde RetryPolicy.execute son secilen politikayi kaydeder. Bu kayit butun farkli politikalarin tarihcesi degildir; worker thread'e ContextVar aktarilmayan eski PDF loop'lari bu kaydi uretmez. Uretim katalog migration'i yapilmadi.

34 hedef shared test (retry, daemon lifecycle, challenge, safe transport, checkpoint ve asset subprocess) ve ayri sureclerde 42 kaynak regresyonu gecti. py_compile, git diff --check ve npm run verify basarili.

curl_cffi ortamda yok. [Resmi API](https://curl-cffi.readthedocs.io/en/stable/api.html) trust_env, curl_options ve redirect seceneklerini; [security belgesi](https://curl-cffi.readthedocs.io/en/latest/security.html) varsayilan redirect takip politikasinin private hedefleri kisitlamadigini acikliyor. Backend icin initial URL ve her hop'ta pinned DNS/peer invariant'i ayrica test edilecek; otomatik step-up henuz eklenmedi.

## Curl backend ve CLI

`requirements-http.txt` opsiyonel curl-cffi==0.15.0 kaydidir; ortamda paket kuruldu ve chrome120 profili ag istegi olmadan dogrulandi. CurlDownloader sadece HTTPS GET yapar. Her yeni handle icin tum DNS adaylari public kontrolunden gecer; CURLOPT_RESOLVE tek numeric adresi sabitler, PROXY bos ve FOLLOWLOCATION kapali tutulur. Redirect en fazla bes kez elle izlenir; her hop yeniden denetlenir, origin degisiminde credentials temizlenir. TLS host/sertifika dogrulamasi aciktir. PRIMARY_IP transfer sonrasi pinned adresle karsilastirilir. Stdlib transport peer'i gonderim oncesi denetler; curl transport'ta gonderim oncesi guvence numeric RESOLVE ve kapali proxy'dir, peer ek denetimi transfer sonrasidir. Body byte cap callback seviyesinde uygulanir.

DergiPark `--use-impersonation` default false. Secildiginde stdlib ilk denemedir; 403/429 veya challenge icin bir curl fallback yapilir. Address/certificate/size hatalari fallback tetiklemez. Metadata downloaderlarinda challenge fatal kalir; otomatik curl secimi yalniz fulltext CLI kapsamindadir. curl yeni bir challenge'i cozmus kabul edilmez; resolver onu reddeder, PDF magic denetimi de HTML'i PDF olarak kabul etmez.

9 curl testi: profile, pinning, manual redirect/credentials, private DNS/redirect, downgrade, size cap, peer mismatch ve opt-in fallback. Toplam 43 shared hedef test ve 42 kaynak regresyonu, CLI help ve verify gecti. Canli kaynaklara istek yapilmadi. Faz 3 kod isleri siradadir.

Kullanilan primer kaynaklar: [curl-cffi API](https://curl-cffi.readthedocs.io/en/stable/api.html), [libcurl RESOLVE](https://curl.se/libcurl/c/CURLOPT_RESOLVE.html). Installed Curl.setopt kaynak kodu RESOLVE/WRITEFUNCTION destegini dogruladi; Curl context manager olmadigi icin contextlib.closing kullanildi.
