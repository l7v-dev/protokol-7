# Kök Dizin ve Modüler Mimari Şeması (Domain-Driven Organization) — Walkthrough

Bu doküman, **protokol-7** projesinde kök dizinden itibaren uygulanan etki alanı odaklı modüler mimari şemasını, dizin hiyerarşisini ve doğrulama sonuçlarını özetler.

---

## 1. Uygulanan Mimari Değişiklikler

### A. Kök Dizin Mimari Şartnamesi (`ARCHITECTURE.md`)
- Kök dizinde yer alan tüm klasör ve dosyaların teknik sınırları, Omega-3 bilişsel bölgeleriyle eşleşmesi, veri akış diyagramı (Mermaid) ve mimari ilkeleri belgelendi.

### B. `src/` Dizin Hiyerarşisi (Domain-Driven Structure)
24 adet düz dosya, 5 izole teknik etki alanına ayrıldı:
1. **`src/core/`**:
   - `types.ts`: Tüm paylaşılan sözleşme ve arayüzler.
   - `server.ts`: HTTP REST yönlendiricisi ve uç nokta yöneticisi.
   - `index.ts`: Çekirdek barrel dışa aktarımı.
2. **`src/actors/`**:
   - `actor-registry.ts`: Aktör kayıt ve yaşam döngüsü yöneticisi.
   - 8 uzmanlaşmış aktör (`cheerio-scraper`, `playwright-browser`, `api-extractor`, `crawler`, `sitemap-xml`, `markdown-reader`, `network-interceptor`, `serp-search`).
3. **`src/browser/`**:
   - `browser-pool.ts`: Chromium havuz yönetimi ve SSRF yönlendirme denetleyicisi.
   - `browser-session-manager.ts`: Çok sekmeli ve durum bilgisi saklayan oturum yöneticisi.
   - `interactive-browser-controller.ts`: Tarayıcı aksiyon yürütücüsü.
   - `stealth-manager.ts`: Bot algılama maskelemesi ve donanım profilleri.
   - `dom-indexer.ts`: Set-of-Mark DOM eleman indeksleyicisi.
4. **`src/extractors/`**:
   - `readability-extractor.ts`: HTML'den GFM markdown ayrıştırıcısı.
   - `structured-extractor.ts`: Tablo ve Schema.org JSON-LD çıkarıcısı.
   - `robots-parser.ts`: RFC 9309 robots.txt kural motoru.
5. **`src/network/`**:
   - `ssrf-guard.ts`: Özel IP, bulut metaveri ve DNS rebinding koruması.
   - `politeness-limiter.ts`: Domain nezaket ve hız sınırlayıcısı.
   - `url-normalizer.ts`: Kanonik URL standardizasyonu.
   - `url-pattern-matcher.ts`: Wildcard desen eşleştiricisi.
   - `crawl-url-accumulator.ts`: Tekilleştirilmiş tarama kuyruğu.

### C. Geriye Dönük Uyumluluk ve Barrel Köprüleri
- **`src/server.ts`**: Kök sunucu tramplini (`export * from "./core/server";`) korunarak mevcut komut dosyaları ve testler güvenceye alındı.
- **`src/index.ts`**: Tüm modülleri tek bir noktadan dışa aktaran merkezi barrel export güncellendi.
- **`tsconfig.json`**: `@/*` path alias'ı hem kök hem de tüm domain dizinlerini destekleyecek şekilde genişletildi.
- **`scripts/generate-connectome.mjs`**: Yeni modüler dosya yapısını destekleyecek şekilde dinamikleştirildi ve `context/connectome.md` güncellendi.

---

## 2. Doğrulama ve Test Sonuçları

### Birim Testleri
```bash
npm test
nix develop --command npm test
```
- **Toplam Test:** 68
- **Başarılı:** 68 (%100)
- **Başarısız:** 0
- **Süre:** 7,4 saniye

### Doğrulama Hattı (Verification Pipeline)
```bash
npm run verify
```
- **[1/5] Mimari Dosya Bütünlüğü:** Başarılı (`ARCHITECTURE.md`, `rules/`, `context/` eksiksiz)
- **[2/5] İsimlendirme Disiplini:** Başarılı (Sıfır pazarlama jargonu)
- **[3/5] Sıfır Emoji Disiplini:** Başarılı (Sıfır emoji)
- **[4/5] Canlı SCA Paket Kontrolü:** 6 paketin tamamı resmi npm kayıt defterinde onaylandı
- **[5/5] Biome Linter & Format:** 53 dosya hatasız doğrulandı
