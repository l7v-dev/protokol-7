# Mimari Faz 2: Şema ve telemetri

Tarih: 2026-10-05. Tier: 2.
Plan: `docs/plans/mimari-analiz-airbyte-blueprint-2026-10.md` §4.2 ve §15.

## Uygulama

- Plan başlığı beş tablo diyordu; gerçek DDL altı tablo içeriyor. Pipeline manifests, document provenance, occurrences, dataset release gates, OTel events ve source verification evidence tabloları eklendi.
- actor_runs için trace/span; snapshots için release_state/run_id/trace_id/git_commit; shards için pii_status/rights_status; storage_replicas için path_tier eklendi: dört mevcut tabloda dokuz kolon.
- `infra/migrations/0002-blueprint-provenance.sql` runtime migration kaynağı. `applyBlueprintMigration` BEGIN IMMEDIATE altında mevcut kolonları kontrol ediyor, yalnız eksik kolonları ekliyor ve hata halinde rollback yapıyor. Registry kurulum hatası açık SQLite handle'ını kapatıyor. Ham SQL dosyası elle yürütüldüğünde tek seferliktir; tekrar açma güvenliği TypeScript runner tarafından sağlanır.
- `context/schema.sql` aynı taze şemayı temsil ediyor; runtime ile kolon metadata eşitliği test edildi. Docker runtime gerekli migration asset'ını içeriyor. Kaynak ve derlenmiş dist dizinlerinden SQL konumu çözümleniyor.
- Yeni provenance kayıtları ve durum unionları contracts/provenance.ts altında tanımlandı. Actor metadata trace/span değerleri SQLite üzerinde round-trip ediyor.
- LogEmitter log-event.v1 alanlarını doğrulayıp SQLite'a yazıyor. Service/version/environment ve trace/span kimlikleri var. Sürüm açıkça verilebilir; npm_package_version yoksa varsayılan unversioned olarak işaretlenir.
- MetadataLogEventSchema kalıcı yazma/okuma sınırında da uygulanıyor. Gövde event_name ile aynı, metadata alanları sınırlı kimliklerdir; içerik yakalama false. SQL body=event_name, severity çiftleri ve content_capture=0 kontrollerini enforce ediyor.
- Anomaliler aynı emitter üzerinden gidiyor; CRITICAL seviyesi ERROR/17 oluyor. Ham URL, mesaj ve serbest metadata loglara yazılmıyor. JSONL compatibility envelope anomalyCode/component/message alanlarını koruyor; message sabit event identifier, geçersiz component unknown olur. Bu envelope scripts/logs.mjs okuyucusuyla uyumludur; içindeki log-event alanları ayrı v1 sözleşmesini temsil eder.
- JSONL mirror hatası metadata mesajıyla bildirilir; SQLite persist hatası çağırana aktarılır. In-memory anomaly dönüşü eski alanları ve trace/span kimliklerini taşır.
- Canonicalization_version için yanıltıcı NFC varsayılanı kaldırıldı: çağıran gerçek politikayı açıkça vermeli. NFKC normalizer çıktısı farklı policy etiketiyle sunulmamalı.

## Doğrulama

- Migration/eski registry/telemetri/dataset API/sözleşmeler: 63/63 TS testi başarılı.
- Son privacy writer düzeltmesinden sonra odaklı migration/emitter testleri: 7/7 başarılı.
- Draft 2020-12 sözleşmeleri: 8/8 Python testi başarılı.
- TypeScript typecheck ve npm run verify başarılı. SCA denetimi izinli ağ erişimi kullandı.
- git diff --check başarılı.
- Migration rollback, tekrar açma, eski kayıt koruma, fresh schema eşitliği, foreign key ve release gate kontrolleri denetlendi. Testler bellekte veya /tmp SQLite dosyalarında çalıştı.
- Standards incelemesi doğrudan registry writer üzerinden raw body yazılabildiğini yakaladı. Metadata policy bu sınıra ve SQL'e eklendi; negatif testler geçti ve inceleme bulgusu kapandı. Spec incelemesinde bulgu yok.
- Mevcut telemetry testi URL/ham mesaj tutulmasını bekliyordu; yeni metadata-only davranışını doğrulayacak şekilde güncellendi.
- Bu oturumun regresyon testlerinin oluşturduğu sekiz run-log satırı ve dosyası temizlendi; diğer ledger kayıtları korundu.

## Canlı pipeline güvenliği

DOAJ, Binance Vision, Hugging Face ve DergiPark Python süreçleri salt okunur süreç envanterinde aktif görüldü. Otomatik reload eden Node servisi gözlenmedi. Python kaynak katalogları ayrı olsa da shard/dataset özetleri merkezi data/catalog.sqlite kataloğuna yazılıyor.

Canlı katalog salt okunur açılarak kontrol edildi: altı Faz 2 tablosu henüz yok. Bu oturumda canlı migration, servis restart veya pipeline durdurma yapılmadı. Testler NODE_ENV=test kullanıyor. Yeni RegistryDatabase kodu canlı kataloğu açtığında migration çalışır; aktivasyondan önce merkezi katalog yedeği ve bu kataloğa yazan süreçler için bakım penceresi gerekir. Pipeline'ları mevcut geliştirme/test için durdurmak gerekmiyor.

## Devam

Faz 3: veri üreticilerinden provenance kayıtları, release gate kanıtları, publisher enforcement ve REST/MCP erişimi. Yeni tabloların oluşturulması tek başına mevcut dataset yayınlarını bu kapılarla korumaz. Canlı aktivasyon ayrıca planlanmalı. Commit oluşturulmadı; önceki oturumların çalışma ağacı değişiklikleri korundu.
