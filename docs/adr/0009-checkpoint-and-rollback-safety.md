# ADR 0009: L5 Güvenlik Seviyesi: Atomik Kontrol Noktası ve Geri Alma (Checkpoint & Rollback)

- **Durum:** Kabul Edildi
- **Tarih:** 2026-09-15
- **Karar Vericiler:** Antigravity, Sistem Mimarı
- **İlgili Belgeler:**
  - `Resource-Pool/Akademik Araştırmalar Işığında AI Ajan Disiplin Kuralları, Kod Standartları ve Performans Yöntemleri.md`
  - `docs/adr/0006-engineering-telemetry-doctor-and-documentation-discipline.md`
  - `docs/adr/0008-nine-layer-span-telemetry-taxonomy.md`
  - `scripts/checkpoint.mjs`

## Bağlam ve Problem

Otonom ajanların uzun ufuklu operasyonlarında ortaya çıkan kaskat hatalar (AvalancheBench) ve ajan baskısı ($W / C_{rem}$) altındaki normatif sapmalar, çalışma alanının bozulmasına yol açabilmektedir. Çok katmanlı güvenlik harness'ının en üst seviyesi olan L5 Güvenlik Seviyesi (Durum Geri Alma ve İyileştirme); doğrulama boru hattı çöktüğünde veya anomali saptandığında çalışma alanını harici insan müdahalesine gerek kalmadan son güvenli ana döndürecek deterministik bir geri alma (rollback) mekanizmasını zorunlu kılar.

## Karar (Y-İfadesi)

*Kaskat hata yayılımı, çalışma alanı tahrifatı ve geri döndürülemez yan etkiler bağlamında; operasyonel kararlılığı ve hata toleransını garanti altına almak adına; manuel müdahale veya denetimsiz kabuk komutları yerine aşağıdaki L5 kontrol noktası altyapısına karar verilmiştir:*

1. **Deterministik Atomik Kontrol Noktası (`scripts/checkpoint.mjs create`):**
   - Çalışma alanının anlık durumu Git nesne veritabanında (`git stash create`) ve `refs/checkpoints/<id>` altında saklanır.
   - Kontrol noktası metaverileri `archive/checkpoints/index.jsonl` kütüğüne yazılır.
   - Her kontrol noktası işlemi `SPAN_TYPES.SAFETY_MONITOR` ile telemetriye kaydedilir.

2. **Deterministik Atomik Geri Alma (`scripts/checkpoint.mjs rollback`):**
   - Belirtilen veya en son (`latest`) kontrol noktasına göre çalışma alanındaki dosya değişiklikleri atomik olarak geri alınır.
   - Geri alma eylemi telemetriye `SAFETY_MONITOR` olarak işlenir.

3. **Geliştirici Arayüzü Scriptleri (`package.json`):**
   - `npm run checkpoint` ve `npm run rollback` komutları standart CLI arayüzü olarak tanımlanmıştır.

## Kesin Dışlamalar (Ban Decisions)

- **YASAK:** Çalışma ağacındaki izlenmeyen veya yedeklenmemiş dosyaları körlemesine silen yıkıcı kabuk komutları (`git clean -fdx`).
- **YASAK:** Büyük değişiklikler veya kritik refactor adımları öncesinde kontrol noktası almaksızın Tier 2+ kod modifikasyonu yürütmek.

## Sonuçlar ve Ödünleşimler

- **Pozitif:** Ajan hataları çalışma alanını kalıcı olarak bozamaz; anında son kararlı ana dönülebilir.
- **Pozitif:** Sıfır dış servis bağımlılığı (doğrudan Git plumbing kullanılır).
- **Ödünleşim:** Her kontrol noktası Git veritabanında hafif bir ref/commit nesnesi oluşturur.
