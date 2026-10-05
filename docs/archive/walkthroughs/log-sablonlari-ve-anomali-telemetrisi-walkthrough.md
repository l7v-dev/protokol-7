# Log Sablonlari, Log Indeksi ve Anomali Telemetrisi Dogrulama Raporu (Walkthrough)

Bu dokuman, `protokol-7` projesinde konsol cikti sablonlarini standartlastiran, log dosyalarini fihristte indeksleyen, sistem duraklama ve anomali telemetrisini toplayan ve `npm run logs` CLI aracini devreye alan mimari donusumun dogrulama sonuclarini kaydeder.

---

## 1. Uygulanan Mimari Bilesenler

### A. Merkezi Terminal & Cikti Sablon Motoru (`TerminalTheme`)
- `scripts/terminal-theme.mjs` (Node.js ESM) ve `src/utils/terminal-theme.ts` (TypeScript) olusturuldu.
- Standart ASCII baslik/banner (`banner`), durum rozetleri (`badge`), anahtar-deger panelleri (`panel`), tablolar (`table`) ve ayiricilar (`divider`) deterministik olarak saglandi.
- Sifir emoji standardi ve 71 karakter genislik sabitlendi.

### B. Sistem Duraklama, Timeout ve Anomali Telemetrisi
- `src/telemetry/anomalies.ts` olusturuldu.
- Standart anomali taksonomisi tanimlandi:
  - `STALL_TIMEOUT`: Browser/HTTP isteklerinde 30s asimi.
  - `RATE_LIMIT_BACKOFF`: 429 cevabi ve backoff duraklamasi.
  - `SECURITY_BLOCK_403`: Cloudflare/WAF erisim engelleri.
  - `SSRF_INTERCEPTION`: Ozel IP ve metadata erisim engellemeleri.
  - `CIRCUIT_BREAKER_OPEN`: Pes pese hatalarda sigortanin acilmasi.
  - `MEMORY_PRESSURE`: Bellek esik asimi.
  - `RETRY_EXHAUSTED`: Tum denemelerin tukenmesi.
- `recordAnomaly` fonksiyonu ile olaylar atomik JSONL olarak `ledger/telemetry.jsonl` dosyasina kaydedilir.

### C. Calisma Logu Dosyalama ve Fihrist Motoru
- `src/api/run-logger.ts` gelistirildi.
- Her calisma icin `ledger/logs/runs/run_<timestamp>_<actorName>_<id>.log` altinda atomik dosya yazimi ve `ledger/logs/index.jsonl` uzerinde tek satirlik arama ozeti uretimi saglandi.
- `src/api/run-registry.ts` icindeki `completeRun` ve `failRun` metotlarina baglandi; calisma bittiginde otomatik olarak log diske yazilir ve indekslenir.

### D. Log Fihristi ve Anomali Radari CLI Araci (`npm run logs`)
- `scripts/logs.mjs` gelistirildi ve `package.json`'a `logs` komutu eklendi.
- `npm run logs` veya `npm run logs --limit 10` komutuyla en son aktor calismalari ve 24 saatlik anomali ozeti ekrana 20 milisaniyede basilir.

### E. Sistem Nabzi (`npm run pulse`) ve Log Rotasyonu
- `scripts/pulse.mjs` yeni `Theme` motoruna uyarlandi ve log fihristi durumunu gosterecek sekilde zenginlestirildi.
- `scripts/consolidate-memory.mjs` betigine log rotasyon politikasi eklendi: `ledger/logs/runs/` altinda en fazla son 100 log dosyasi tutulur, eskiler otomatik temizlenirken `ledger/logs/index.jsonl` fihristi kalici kalir.

---

## 2. Dogrulama ve Test Sonuclari

| Asama | Komut | Durum | Detay |
|---|---|---|---|
| **Birim ve Entegrasyon Testleri** | `npm test` | **[PASS]** | 524/524 test basarili (7 yeni telemetri/log testi dahil) |
| **Log Radari CLI** | `npm run logs` | **[PASS]** | 20 ms icinde ASCII fihrist ve anomali ozeti |
| **Sistem Nabzi CLI** | `npm run pulse` | **[PASS]** | Tema sablonlariyla zenginlestirilmis anlik sistem gorunumu |
| **Kod Stili & Linter** | `npm run lint` | **[PASS]** | 240 dosya Biome denetiminden 0 hata ile gecti |
| **Depo & Ortam Sagligi** | `npm run doctor` | **[PASS]** | 7 asamali doctor kontrolleri hatasiz tamamlandi |
| **Deterministik Dogrulama** | `npm run verify` | **[PASS]** | 6 katmanli dogrulama hatti eksiksiz gecti |
