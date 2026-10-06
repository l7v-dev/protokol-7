# Ilham Analizi Faz 3 — Icerik kalitesi

Kod ve izole dogrulama tamamlandi. Uretim pipeline'lari kapali; uretim catalog migration'i veya corpus tekillestirme yapilmadi.

DocumentParser sync/async ve batch arayuzlerini saglar. PyMuPDFParser PDF lifetime'ini context manager ile kapatir; 1-based page range destekler. DergiPark extractor mevcut status/word/char sonucunu bu parser'dan uretir. ParseResult.save metadata'yi once dogrular; text.md ve meta.json gecici dizinde fsync edildikten sonra yeni hedef dizine rename ile birlikte yayinlanir. Exception staging'i temizler. Existing hedef korunur; publish lock cooperative writer yarismasini siralar. Ani process/power kaybindaki hidden staging temizligi bu kontratta yoktur.

content_dedup.py NFKC, word-trigram, FNV-1a64 ve UTF-16 token hashing kullanir; surumu nfkc-fnv1a64-word3-v1'dir. LRU thread-safe ve run-local'dir. DergiPark --flag-near-duplicates default false; secilince son 1000 fingerprint ile 0.9 similarity threshold kullanir. Benzer kayit da Parquet ve raw archive'a yazilir; source ID/artifact referanslari korunur, pdf_status duplicate ve fingerprint/surum source ledger'a kaydedilir. Unsealed duplicate output restart'ta tekrar pending yapilir. Yakin benzerlik canonical identity birlestirmez; global corpus dedup tamamlandi iddiasi yoktur.

Planin provenance_events tablosu repoda yoktur. Fingerprint mevcut kaynak defterine yazildi; merkezi provenance event yazimi uygulanmis kabul edilmez. Bu uyarlama uygulama planinda kayitlidir.

DiskUrlDedup exact URL SHA-256 receiptlerini SQLite WAL/WITHOUT ROWID ile saklar. HF remote_verified durumundan sonra sidecar receipt yazar ve eski verified URL'leri backfill eder. URL receipt download skip otoritesi degildir; files(repo, revision, path) ve remote_verified mevcut otorite olarak kalir. Receipt hatasi dogrulanmis file durumunu failed'a ceviremez.

Dogrulama: 8 shared test; invalid metadata, ikinci dosya/rename hatasi rollback, overwrite reddi, async PDF/page range, benzer/farkli metin, thread yarisi/cache eviction, URL restart. 24 DergiPark testi, duplicate receipt/source/artifact korunmasi ve unsealed recovery dahil. 13 HF testi. npm run verify ve git diff --check basarili.

Tekillestirme tasariminda [deduplicate-corpus](../../.agents/skills/ops/deduplicate-corpus/SKILL.md) kaynak olusumlarini koruma ve local cache kapsam kurallari uygulandi. Bu calisma bir ops corpus run'i veya yayin islemi degildir. Siradaki Faz 4 surec/yasam dongusu.
