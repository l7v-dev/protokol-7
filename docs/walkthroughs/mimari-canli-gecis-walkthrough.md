# Mimari canlı geçiş: ilk uygulama

2026-10-05. Kullanıcı kalan işleri sırayla yetkilendirdi; OpenAlex sonraki işleri kapsam dışı.

## Canlı katalog

Online SQLite backup ile committed WAL kayıtları dahil tutarlı snapshot alındı. İlk prova mevcut 7.473 shard, 6 snapshot, 37 execution ve diğer tüm tablo satır sayılarını korudu. 0002–0004 migration, integrity_check, foreign_key_check ve ikinci idempotent uygulama başarılı. Eski BaseLedger merkezi katalog yazıcısı migrate edilmiş geçici kopyada yeni shard yazdı; pii_status unchecked ve rights_status unknown doğrulandı.

Taze backup/prova ardından canlı migration atomik olarak uygulandı; integrity ok ve FK ihlali 0. Backup: data/migration-activation-20261005/catalog-before.sqlite. SHA-256: 3eb2e07fedad788fdab910530041aafbbae2b164ecd8bb812b07745d31da0019. report.json ve activation.json aynı dizinde. Hiçbir canlı veri restore edilmedi; pipeline süreçleri durdurulmadı. Geri dönüş prosedürü docs/plans/mimari-canli-gecis-plani.md içinde.

## Parquet ve telemetri

13 bağımsız non-OpenAlex packer typed string pii_status aldı. Gözden geçirilmiş statü korunur, eksik statü unchecked, geçersiz/null statü hata. Shared helper schema/write yollarını birleştirir. Aktif Python importları eski sürümde olduğundan süreç geçişi hâlâ gereklidir.

Collector monitoring-otel-collector-1 localhost 4318 üzerinde aktif. İzole geçici katalogda sentetik collector.probe logu OTLP ile kabul edildi; collector bir log record raporladı. Read-only metadata export işçisi katalogdaki otel_log_events kayıtlarını en fazla 100'lük batch'lerle gönderir. PID data/monitoring/otel-cursor.json.lock içinde. Partial/nonretryable ACK kalıcı blocked marker üretir; otomatik replay yapılmaz. HTTP 2s ve açılmış ACK 64KiB ile sınırlıdır. Python stdout logları bu kanala aktarılmaz; canlı SQL log tablosu aktivasyon sırasında boştu.

## Doğrulama

80/80 TS hedef regresyonu, typecheck ve npm run verify başarılı. Python hedefleri: Binance7, Semantic Scholar32, Gutenberg14, StackExchange12, Wikimedia8x5, corpus packaging1, PII4 =110 test başarılı. Tam corpus suite'i mevcut pipeline_runs şema uyuşmazlığı ve kurulu olmayan duckdb yüzünden 5 hata verdi; değiştirilen packer testi tek başına geçti. Bu full-suite hataları gizlenmedi veya testler atlanmış başarılı sayılmadı; metadata_catalog kapsamı ayrı takip edilir.

Standards/spec incelemelerinde OTLP response cap, partial replay engeli, lock yarışı ve ACK yapı doğrulaması düzeltildi; açık kod bulgusu yok.

## Git ve kalan sıra

GitHub compare: main feature/github-actions-wikipedia-etl'den96 commit ileride, behind0. Varsayılan branch main yapıldı; feature branch silindi, legacy/monolith-initial korundu. Yerel mimari değişiklikler codex branch'inde commit hazırlanıyor.

Canlı producer belge provenance/raw evidence geçişi ve kontrollü restart kalan işlerdir. DergiPark batch/shard/arşiv tamamlayarak kapanır; DOAJ KeyboardInterrupt finalization yapar. Mevcut Binance işlemi asset upload ortasında güvenle sonlandırılabileceği kanıtlanmadığı için kesilmedi. Geçmiş raw kaynak bağlantıları türetilmez. Croissant public yayın, OpenLineage ekip/makine genişlemesi koşullarını bekler.
