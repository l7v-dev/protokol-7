# Mimari canlı geçiş sırası

Tier 2. Kullanıcı kalan işleri sırayla yetkilendirdi; OpenAlex aktivasyonu ve pilotu kapsam dışı.

1. Canlı SQLite online backup ve bağımsız kopyada 0002–0004 prova; bütünlük, yabancı anahtar ve mevcut satır sayıları.
2. Eski Python merkezi katalog yazıcısını migrate edilmiş kopyada test et. Geriye uyumlu eklemeli DDL için kısa BEGIN IMMEDIATE transaction; busy timeout halinde hata ve rollback.
3. Canlı uygulamadan hemen önce yeni backup/prova al; migration sonrası integrity ve foreign key kontrolü.
4. Eski bağımsız non-OpenAlex Parquet packer'larına typed pii_status ekle, mevcut alanları koru; eksik status unchecked.
5. Local collector + read-only SQLite→OTLP worker. Sentetik metadata olayıyla gerçek collector kabulü. Kalıcı checkpoint, partial/nonretryable blocked marker ve exclusive worker lock.
6. Varsayılan GitHub branch main ve birleşmiş feature branch temizliği; yerel değişiklikleri codex branch'inde commit et.

## Üretici süreç geçişi ve geri dönüş

Çalışan Python süreçleri eski import edilmiş modülleri kullanır. Yeni pii_status ve provenance davranışı süreç yeniden başlatılmadan etkinleşmez. DOAJ KeyboardInterrupt finalization yapar; DergiPark SIGINT/SIGTERM ile batch tamamlayıp shard/arşivleri kapatır. Binance mevcut sürümünde batch sınırında graceful shutdown işleyicisi yoktur; asset upload ortasında zorla kesmek güvenli kabul edilmez. Bu üretici geçişi ayrı adım olarak bekler. Geçmiş belge/ham artifact bağlantıları uydurulmaz.

Migration SQL hatasında transaction otomatik rollback yapar. Başarılı migration sonrasında yalnız bir dosyayı eski backup ile değiştirmek aktif writer'ların yeni kayıtlarını kaybettirebilir. Geri dönüş gerekirse bütün writer'ları durdur, güncel post-migration online backup al, restore'u ayrı hedefte doğrula ve WAL/SHM dosyalarıyla tutarlı bakım prosedürü kullan. Çalışan katalog üstüne cp veya otomatik dosya restore uygulanmaz.

Croissant public dataset yayınına, OpenLineage ekip/makine genişlemesine bağlıdır.
