# Log Sablonlari, Log Indeksi ve Anomali Telemetrisi Plani

Bu plan, `protokol-7` projesinde calisan yapay zeka ajanlari ve muhendisler icin log ciktilarini standartlastiran, log dosyalarini fihristte indeksleyen, sistem duraklama/timeout/rate-limit anomalilerini telemetri olarak toplayan ve `npm run logs` CLI aracini devreye alan mimari uygulamayi tanimlar.

## Hedefler
1. `scripts/terminal-theme.mjs` ve `src/utils/terminal-theme.ts` ile sifir emojili, deterministik ASCII banner, rozet, panel ve tablo sablonlarini olusturmak.
2. `src/telemetry/anomalies.ts` ile sistem duraklama ve anomali taksonomisini (`STALL_TIMEOUT`, `RATE_LIMIT_BACKOFF`, `SECURITY_BLOCK_403`, `SSRF_INTERCEPTION`, vb.) sozlesmeye baglamak.
3. `src/api/run-logger.ts` ile calistirma loglarini `ledger/logs/runs/` altinda dosyalayip `ledger/logs/index.jsonl` kutugune tek satirlik kayit dusmek.
4. `scripts/logs.mjs` CLI aracini gelistirip `package.json`'a `npm run logs` komutunu eklemek.
5. `scripts/pulse.mjs` ve `scripts/consolidate-memory.mjs` betiklerini yeni tema ve log rotasyon politikasiyla (son 100 dosya siniri) entegre etmek.
6. Dogrulama kapilarini (`npm run verify`, `npm run doctor`, `npm test`) calistirarak degisiklikleri muhurlemek.

## Adimlar
- [ ] Adim 1: Plan dokumaninin olusturulmasi.
- [ ] Adim 2: `scripts/terminal-theme.mjs` ve `src/utils/terminal-theme.ts` sablon motorunun yazilmasi.
- [ ] Adim 3: `src/telemetry/anomalies.ts` anomali ve telemetri sozlesmesinin tanimlanmasi.
- [ ] Adim 4: `src/api/run-logger.ts` log fihrist motorunun yazilmasi ve `src/api/run-registry.ts` ile entegrasyonu.
- [ ] Adim 5: `scripts/logs.mjs` CLI aracinin kodlanmasi ve `package.json`'a `npm run logs` eklenmesi.
- [ ] Adim 6: `scripts/pulse.mjs` ve `scripts/consolidate-memory.mjs` entegrasyonu.
- [ ] Adim 7: 6 asamali dogrulama hatti, Biome linter ve birim testlerinin calistirilmasi.
