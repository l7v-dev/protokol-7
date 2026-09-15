# Faz 5: İkili Belge Aktörü (`pdf-document-actor`) Walkthrough

## 1. Genel Bakış

Bu aşamada **protokol-7** mikroservisine HTTP üzerinden indirilen veya doğrudan Base64/ikili veri olarak sağlanan PDF belgelerinden metin akışları, sayfa sınırları, kelime/karakter metrikleri ve üstveri (başlık, yazar, oluşturma tarihi vb.) çıkaran `PdfDocumentActor` eklendi.

Bileşen, Mozilla PDF.js tabanlı, saf JavaScript ve sıfır çalışma zamanı bağımlılığına sahip `unpdf` kütüphanesi üzerine inşa edildi. Bu sayede NixOS ortamında yerel C++/libc/cairo derlemesine ihtiyaç duymadan platformdan bağımsız, hafif ve güvenli bir şekilde çalışmaktadır.

---

## 2. Yapılan Değişiklikler

### A. Bağımlılık Yönetimi
- **`package.json`**: `unpdf` (^1.8.1) bağımlılığı eklendi.
- **SCA Denetimi**: `node scripts/sca-check.mjs unpdf` ile paket orijinalliği ve güvenliği resmi npm kayıt defterinde doğrulandı.

### B. Çekirdek Tip Sözleşmeleri (`src/core/types.ts`)
- `ActorType` union'ına `"pdf-document"` eklendi.
- `PdfDocumentMetadata`, `PdfPageEntry`, `PdfDocumentTaskOptions`, `PdfDocumentResult` arayüzleri tanımlandı.
- `ActorTask.options.pdfOptions` ile görev yapılandırması genişletildi.

### C. Aktör Katmanı (`src/actors/pdf-document-actor.ts` & `src/actors/actor-registry.ts`)
- **`PdfDocumentActor`**:
  - `SSRFGuard.validateUrl()` ile uzak PDF indirme isteklerinde RFC 1918, loopback ve bulut metadata adreslerini engelleyen ağ güvenliği.
  - `%PDF-` (`0x25, 0x50, 0x44, 0x46, 0x2d`) magic byte denetimi ile geçersiz ikili verileri reddetme.
  - Azami 30MB (`MAX_PDF_SIZE_BYTES`) boyut sınırlaması.
  - `maxPages` desteği ile büyük belgelerde sayfa sınırlaması.
  - `getDocumentProxy` üzerinden tek seferlik belge ayrıştırması ile hem sayfa metinlerini hem üstveriyi (`Title`, `Author`, `Creator`, `CreationDate`) çıkarma.
- **`ActorRegistry`**: `createDefaultActorRegistry()` içine `PdfDocumentActor` kaydedildi.

### D. HTTP API Sunucusu (`src/core/server.ts`)
- `POST /api/v1/pdf` ve `POST /pdf` uç noktaları eklendi.
- `targetUrl` ve `pdfBase64` doğrulama mantığı uygulandı.

### E. Test Paketi (`tests/pdf-document-actor.test.ts` & `tests/server.test.ts`)
- Minimal geçerli PDF ikili verisinden metin ve üstveri çıkarma testi.
- Uzak HTTP PDF indirme ve SSRF engelleme testleri.
- Geçersiz magic byte ve eksik parametre hata testleri.
- `maxPages` sınırlandırma testi.
- `POST /api/v1/pdf` uç noktası doğrulama ve veri çıkarma testleri.
- Toplam test sayısı 68'den 76'ya çıkarıldı.

### F. Mimari ve Sistem Haritası Senkronizasyonu
- `ARCHITECTURE.md` ve `context/architecture-schema.md` güncellendi.
- `scripts/generate-connectome.mjs` güncellendi ve `context/connectome.md` otomatik yenilendi.

---

## 3. Doğrulama ve Test Sonuçları

### Birim Testleri
```text
ℹ tests 76
ℹ suites 3
ℹ pass 76
ℹ fail 0
ℹ duration_ms 6895ms (nix develop: 7711ms)
```

### Deterministik Doğrulama Hattı (`npm run verify`)
```text
=== OMEGA-3 DETERMINISTIK DOGRULAMA HATTI BASLATILIYOR ===
[1/5] Mimari Dosya Butunlugu Denetleniyor... [OK]
[2/5] Isimlendirme Disiplini (Naming Discipline) Taranıyor... [OK]
[3/5] Loglama Disiplini (Sıfır Emoji) Taranıyor... [OK]
[4/5] Bagimlilik ve Paket Halusinasyonu (SCA) Denetleniyor... [PASS] (7 paket doğrulandı)
[5/5] Kod Stili ve Statik Analiz (Biome Lint) Denetleniyor... [OK] (55 dosya)
[PASS] DOGRULAMA BASARILI: Kod tabani tum dogrulama katmanlarindan gecti.
```
