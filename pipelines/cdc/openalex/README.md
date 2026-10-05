# OpenAlex metadata delta

Yerel watermark CDC; merkezi katalogdan ayrı `data/cdc/openalex/ledger.sqlite` kullanır. Metadata kayıtları OpenAlex ID ile upsert edilir. Ham sayfa dosyası ve yeni dizinler fsync edilmeden page/cursor transaction commit edilmez. Kısmi çalıştırma watermark ilerletmez; tekrar çalıştırma kayıtlı pencere ve cursor ile devam eder, yeni since/until argümanları açık pencereyi değiştirmez.

API erişimi ve OPENALEX_API_KEY ortam değişkeni önceden sağlandıktan sonra:

```bash
.venv/bin/python -m pipelines.cdc.openalex.orchestrator --since 2026-10-01T00:00:00Z --until 2026-10-02T00:00:00Z --max-pages 10 --max-requests 10 --max-bytes 10485760 --max-seconds 300
```

Varsayılan sınırlar 10 sayfa, 10 HTTP denemesi, 10 MiB response ve 300 saniye istemci süresidir. Retry denemeleri bütçeye dahildir. Socket header/body okumaları kalan süreye bağlıdır ve watchdog bağlantıyı keser; işletim sistemi DNS çözümleyicisinin beklemesi uygulama tarafından kesilemez. Bir günlük overlap tekrarları ID/updated_date ile birleştirilir; eşzamanlı cursor değişikliği transaction içinde reddedilir.

[OpenAlex sync belgesi](https://help.openalex.org/access/sync/) updated-date filtrelerinin ücretli erişim gerektirdiğini ve API delta akışının silinmeleri göstermediğini belirtir. Silinme uzlaştırması snapshot/deleted_ids üzerinden ayrıca yapılmalıdır. [Authentication](https://help.openalex.org/api/authentication/) uyarınca anahtar bearer header olarak taşınır. [API referansı](https://help.openalex.org/api/llm-quick-reference/) doğrultusunda sayfa boyutu 100 ile sınırlıdır.

Canlı API pilotu çalıştırılmadı; hesap yetkisi ve kaynak hakları doğrulanmadı. Source descriptor `docs_inspected` ve rights `pending` durumundadır. PDF veya diğer ikili dosyalar indirilmez. pii_status başlangıçta unchecked olur. Bu modül dataset publish veya otomatik release yapmaz.
