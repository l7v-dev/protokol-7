# Mimari Faz 4 uygulama planı

Kapsam: OpenAlex metadata delta CDC, exact-hash train decontamination, belge bazlı Parquet pii_status ve isteğe bağlı OTel collector. Tier 2; canlı katalog migration veya çalışan pipeline yeniden başlatması bu uygulamanın parçası değildir.

1. Sabit zaman penceresi, bir günlük overlap ve kalıcı cursor ile delta çekimi; ham artifact fsync edilmeden ledger ilerlemez. İstek/bayt/süre bütçeleri, retry ve transaction rollback testleri.
2. Sabit evaluation snapshot hash indeksini aynı canonicalization sürümündeki train kayıtlarına uygula; validation/test kayıtlarını koru. Overlap ve raporu quarantine prefix altında sakla; receipt bilgilerini execution kaydına yaz.
3. TypeScript Parquet ve shared Python sharder için string pii_status; eksik değer unchecked, geçersiz değer hata. Bu kolon bir PII taraması yapıldığını göstermez.
4. Collector yapılandırmasını ayrı opt-in Compose profili ile doğrula. SQL log emitter henüz OTLP göndermediği için aktif log export iddiası yoktur.
5. Standards/spec incelemesi, ilgili regresyonlar, typecheck ve npm run verify.

Croissant public dataset yayını öncesinde, OpenLineage ekip/makine genişlediğinde uygulanacak. Shared sharder dışındaki eski bağımsız packer geçişleri ve canlı provenance migration bakım penceresinde ele alınacak.
