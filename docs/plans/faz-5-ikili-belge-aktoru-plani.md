# Faz 5: İkili Belge Aktörü (`pdf-document-actor`) Uygulama Planı

Bu plan, **protokol-7** mikroservisine HTTP üzerinden indirilen veya Base64 olarak sağlanan PDF ikili belgelerinden sayfa bazlı metin, kelime/karakter metrikleri ve üstveri çıkaran `PdfDocumentActor` bileşeninin entegrasyonunu tanımlar.

## User Review Required

> [!IMPORTANT]
> - `rules/trust-tiers.md` gereğince bu görev **Tier 2 (Kısıtlı Otomasyon)** kapsamındadır çünkü yeni bir harici bağımlılık (`unpdf`), yeni aktör, API rotası ve `src/core/types.ts` genişletmesi içermektedir.
> - **Bağımlılık Güvenliği:** `unpdf` paketi Mozilla PDF.js tabanlı, sıfır çalışma zamanı bağımlılığına (`dependencies: {}`) sahip ve saf JavaScript/TypeScript modülüdür. NixOS üzerinde yerel C++ derlemesi gerektirmez. Canlı SCA kayıt denetimi (`scripts/sca-check.mjs`) ile onaylanmıştır.
> - **Bellek ve DoS Koruması:** İndirilen PDF dosyaları için azami 30MB boyut sınırı (`MAX_PDF_SIZE_BYTES`) ve isteğe bağlı `maxPages` sayfa sınırlaması uygulanacaktır.

## Proposed Changes

---

### 1. Bağımlılık Yönetimi

#### [MODIFY] [package.json](file:///home/l7v/l7v-dev/protokol-7/package.json)
- `dependencies` altına `unpdf: "^1.8.1"` eklenecek.
- `npm install unpdf` çalıştırılacak ve `flake.nix` devShell uyumluluğu doğrulanacak.

---

### 2. Çekirdek Tip Sözleşmeleri

#### [MODIFY] [src/core/types.ts](file:///home/l7v/l7v-dev/protokol-7/src/core/types.ts)
- `ActorType` union tipine `"pdf-document"` eklenecek.
- `PdfDocumentMetadata`, `PdfPageEntry`, `PdfDocumentResult` arayüzleri eklenecek:
  ```typescript
  export interface PdfDocumentMetadata {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
  }

  export interface PdfPageEntry {
    pageNumber: number;
    text: string;
    characterCount: number;
    wordCount: number;
  }

  export interface PdfDocumentResult {
    url?: string;
    totalPages: number;
    extractedPages: number;
    metadata?: PdfDocumentMetadata;
    pages: PdfPageEntry[];
    fullText: string;
    totalCharacters: number;
    totalWords: number;
  }
  ```

---

### 3. Aktör Katmanı

#### [NEW] [src/actors/pdf-document-actor.ts](file:///home/l7v/l7v-dev/protokol-7/src/actors/pdf-document-actor.ts)
- `Actor` arayüzünü uygulayan `PdfDocumentActor` sınıfı oluşturulacak.
- Desteklenen girdiler: `targetUrl` (HTTP GET ile indirme) veya `pdfBase64` (doğrudan ikili veri).
- Kontroller:
  1. `SSRFGuard.validateUrl(targetUrl)` kontrolü.
  2. Dosya boyutu kontrolü (maks 30MB).
  3. `%PDF-` (`0x25, 0x50, 0x44, 0x46`) magic byte kontrolü.
- `unpdf` ile sayfa metinleri ve üstveri (`title`, `author`, `creationDate`) çıkarımı.
- `maxPages` sınırlama desteği.

#### [MODIFY] [src/actors/actor-registry.ts](file:///home/l7v/l7v-dev/protokol-7/src/actors/actor-registry.ts)
- `PdfDocumentActor` import edilerek `createDefaultRegistry()` fonksiyonunda `registry.register(new PdfDocumentActor())` olarak kaydedilecek.

---

### 4. HTTP API Sunucusu

#### [MODIFY] [src/core/server.ts](file:///home/l7v/l7v-dev/protokol-7/src/core/server.ts)
- `POST /api/v1/pdf` ve `POST /pdf` rotası eklenecek.
- `targetUrl` veya `pdfBase64` parametrelerinin varlığı doğrulanacak.
- Başarılı sonuç durumunda 200 ile `PdfDocumentResult` nesnesi döndürülecek.

---

### 5. Test Paketi

#### [NEW] [tests/pdf-document-actor.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/pdf-document-actor.test.ts)
- Minimal geçerli PDF ikili verisi üzerinden metin ve üstveri çıkarma testi.
- Mock HTTP sunucusu üzerinden `targetUrl` ile PDF indirme ve ayrıştırma testi.
- SSRF engelleme testi (RFC 1918 ve IPv6 loopback adresleri).
- Geçersiz ikili veri (`%PDF-` olmayan veri) için hata yönetimi testi.
- `maxPages` sınırlandırma testi.

#### [MODIFY] [tests/server.test.ts](file:///home/l7v/l7v-dev/protokol-7/tests/server.test.ts)
- `POST /api/v1/pdf` rotası parametre doğrulama ve hata kontrolü testi.

---

### 6. Mimari ve Bağlam Senkronizasyonu

#### [MODIFY] [context/architecture-schema.md](file:///home/l7v/l7v-dev/protokol-7/context/architecture-schema.md)
- `src/actors/pdf-document-actor.ts` ve `tests/pdf-document-actor.test.ts` dosyaları şemaya eklenecek.

#### [MODIFY] [ARCHITECTURE.md](file:///home/l7v/l7v-dev/protokol-7/ARCHITECTURE.md)
- Aktörler tablosuna `pdf-document-actor` eklenecek.

#### [MODIFY] [context/connectome.md](file:///home/l7v/l7v-dev/protokol-7/context/connectome.md)
- `npm run connectome` ile otomatik olarak güncellenecek.

---

## Verification Plan

### Automated Tests
```bash
# 1. Paket SCA ve Güvenlik Denetimi
node scripts/sca-check.mjs unpdf

# 2. TypeScript Tip Sözleşmeleri
npm run typecheck

# 3. Birim Test Paketi (tüm testler)
npm test

# 4. Deterministik Doğrulama Hattı
npm run verify
```

### Manual Verification
- Birim testleri üzerinden üretilen geçerli PDF akışından metin ve başlık verisinin eksiksiz ayrıştırıldığı doğrulanacaktır.
