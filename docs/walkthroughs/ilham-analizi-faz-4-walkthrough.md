# Ilham Analizi Faz 4 — Surec yasam dongusu

Kod ve izole dogrulama tamamlandi. Uretim pipeline'lari baslatilmadi.

ManagedService startup timeout ve owned-child TERM/wait/KILL/wait uygular. Basarisiz readiness sonrasinda child kapatilir. PipelineService watcher-enabled Python argv calistirir; pipe handshaki startup kabuludur, API veya dataset hazirligi degildir. pipeline_service factory bes kaynak command'ini olusturur; construct islemi process baslatmaz. Process grubu olusturulur ancak stop immediate owned child'a uygulanir; arbitrary grandchildren icin group cleanup garantisi verilmez.

ManagedProcessControl Unix socketpair FD'sini pass_fds ile child'a aktarir. Rastgele 32-byte key ile HMAC imzali 34-byte HB/RD mesajlari kullanilir. Pickle, filesystem socket listener veya kaynak URL erisimi yok. Child ortamdan FD/key'i tuketir ve FD inheritable flag'ini kapatir. Parent EOF veya 10 saniye heartbeat eksikligi shutdown callback'i tetikler. Parent control thread kapanista join edilir.

Pipeline runtime stopper'i ContextVar ile run'a baglar; signal handlerlari run sonunda restore eder. Parent kaybi metadata/fulltext/HF mevcut interrupt yoluna gider. Aperta asset icin parent callback sadece stop istegi koyar; mevcut dosyanin download/archive commit'i tamamlandiktan sonra sonraki dosya baslatilmaz. Arsiv try/finally ile kapatilir. Controlled stop grace deadline sonunda TERM/KILL ile sinirlanir; in-flight asset veya network isi bu deadline'i asarsa zorunlu kill yine orphan output uretebilir. Kaynak restore/verification mekanizmalari bu nedenle korunur.

StopConditions timeout, max records/errors ve idle timeout'u monotonic olarak kontrol eder; ilk neden sabit kalir. Opsiyonel environment degiskenleri uygulama planinda kayitlidir. Guard her kaynakta guvenli page/file/batch sinirinda calisir; blocking transferi tam deadline aninda kesme garantisi yoktur. DergiPark submitted batch'i drain eder. Dedicated monitoring stop_reason schema extension'i ve kaydi eklendi; canli kataloglara uygulanmadi.

Dogrulama: 11 lifecycle/stopper testi, 7 daemon lifecycle, 5 offline source checkpoint ve 2 asset subprocess testi (25 shared). Kaynaklar ayri sureclerde: DOAJ 8, Aperta 11, DergiPark 24, HF 13 (56). Gercek sentetik parent SIGKILL ve child EOF callback testi; HMAC reddi; startup cleanup; TERM/KILL/wait; signal handler restore; stop reason/partial state; asset file-boundary archive closure. py_compile, git diff --check ve npm run verify basarili.

Uretim process manager aktivasyonu ve canli kabul testi bakim sonrasina kalir. Siradaki Faz 5 performans/gozlemlenebilirlik.
