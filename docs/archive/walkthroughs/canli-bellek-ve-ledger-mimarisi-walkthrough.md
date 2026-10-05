# Canli Bellek, Ledger ve Sistem Haritasi Mimarisi Dogrulama Raporu (Walkthrough)

Bu dokuman, `protokol-7` projesinde yapay zeka ajanlarinin ve gelistiricilerin calisan bellek kirliligini ve token tuketimini minimize eden, tek sayfada sistem durumunu sunan canli mimari donusumunun dogrulama sonuclarini kaydeder.

---

## 1. Gerceklestirilen Degisiklikler

### A. `archive/` -> `ledger/` Donusumu
- `archive/` dizini, ACID ve denetim defteri felsefesine uygun olarak `ledger/` olarak yeniden adlandirildi.
- `scripts/consolidate-memory.mjs`, `scripts/omega-memory.mjs`, `scripts/telemetry-logger.mjs`, `scripts/checkpoint.mjs`, `scripts/doctor.mjs` ve `scripts/verify-pipeline.mjs` yeni `ledger/` yoluyla senkronize edildi.
- `ledger/index.jsonl` ve `ledger/sessions/*.md.gz` yapisi korunarak `ledger/README.md` dokumantasyonu guncellendi.

### B. Calisan Bellek (`TASKS.md`) Konsolidasyonu
- `## Aktif` bolumunde biriken 11 tamamlanmis gorev ve `## Son tamamlananlar` bolumundeki eski kayitlar taranarak toplam 13 gorev `ledger/sessions/2026-09-28--session-1790590415505.md.gz` dosyasina sikistirildi ve `ledger/index.jsonl`'e muhurlendi.
- `TASKS.md` 9.2 KB'dan 3.5 KB'a indirildi; `## Aktif` altinda yalnizca tek bir aktif gorev tutularak `rules/task-discipline.md` standardi saglandi.

### C. Sistem Manifestosu (`context/system-manifest.md`) ve Atil Dosya Temizligi
- 470 testte kalmis ve `TASKS.md` ile ciftlik yaratan `context/progress-tracker.md` silindi.
- Veritabani yollarini (`data/catalog.sqlite`), 14 REST rotasini, 4 depolama motorunu, 32 kayitli aktoru ve uretim ortam degiskenlerini tek sayfada ozetleyen `context/system-manifest.md` uretildi.

### D. Sistem Nabzi CLI Araci (`npm run pulse`)
- `scripts/pulse.mjs` betigi kodlandi ve `package.json` icine `npm run pulse` olarak kaydedildi.
- 20 milisaniyede konsantre ASCII sistem paneli basarak aktif gorevi, DB durumunu, aktor sayisini, depolama hedeflerini ve ledger durumunu gosterir.

### E. Beceri (Skills) Ciftliginin ve Fazlaliklarinin Giderilmesi
- 108 dosyalik kopya `skills/` dizini silinerek `.agents/skills/` sembolik bagina (symlink) donusturuldu.
- Projeyle ilgisiz 10 egitim ve blog becerisi (`ask-matt`, `setup-matt-pocock-skills`, `teach`, `scaffold-exercises`, `writing-beats`, `writing-fragments`, `writing-shape`, `migrate-to-shoehorn`, `claude-handoff`, `git-guardrails-claude-code`) guvenli sekilde `ledger/legacy-skills/` altina tasindi.
- Antigravity sistem komutundaki beceri metaveri yuku belirgin bicimde hafifletildi.

---

## 2. Dogrulama Sonuclari

| Asama | Komut | Durum | Detay |
|---|---|---|---|
| **Sistem Nabzi** | `npm run pulse` | **[PASS]** | 20 ms icinde temiz ASCII konsol ozeti |
| **Kod Stili & Linter** | `npm run lint` | **[PASS]** | 234 dosya Biome denetiminden 0 hata ile gecti |
| **Depo & Ortam Sagligi** | `npm run doctor` | **[PASS]** | 7 asamali doctor kontrolleri hatasiz tamamlandi |
| **Deterministik Dogrulama** | `npm run verify` | **[PASS]** | 6 katmanli mimari, isimlendirme, loglama, SCA kapilari basarili |
| **Birim ve Entegrasyon Testleri** | `npm test` | **[PASS]** | 517/517 Node.js testi basarili (%100 gecis, 0 fail) |
| **Kulliyat Boru Hatti Testleri** | `npm run test:corpus` | **[PASS]** | 8/8 Python DuckDB/PyArrow testi basarili |
