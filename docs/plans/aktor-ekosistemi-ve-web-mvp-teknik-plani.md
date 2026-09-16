# Actor Store ve Web MVP Kapsamlı Teknik Mimari Planı

Bu belge, **Protokol-7** çekirdek motoru üzerinde çalışacak; Web, CLI ve ileride Mobil istemcileri besleyecek olan **Actor Store, Dinamik Çalıştırma Konsolu ve Veri Havuzu Yönetimi** mimarisini tanımlar. İlk hedef **Web MVP**'nin hayata geçirilmesidir.

---

## 1. Genel Sistem Mimarisi ve İstemci Katmanları

Sistem, iş mantığını ve tarayıcı/kazıma motorunu istemci katmanlarından tamamen izole eden **Headless Service & Unified API Gateway** mimarisine dayanır:

```
+-------------------------------------------------------------------------+
|                           ISTEMCI KATMANI                               |
|                                                                         |
|  [ 1. Web MVP (Hedef) ]     [ 2. CLI İstemcisi ]    [ 3. Mobil (PWA) ]  |
|  - Store & Detay Sayfası    - Terminal Runner       - Durum Monitörü    |
|  - Dinamik Form (Schema)    - Headless Tetikleyici  - Hızlı Tetikleme   |
|  - Canlı Log & Dataset      - JSON Pipeline Çıktı   - Uyarı & Bildirim  |
+-------------------------------------------------------------------------+
                                    | (REST, SSE, MCP)
                                    v
+-------------------------------------------------------------------------+
|                  PROTOKOL-7 API GATEWAY & ORCHESTRATOR                  |
|                                                                         |
|  - /api/v1/store/actors     : Aktör kayıtları, sürümler, kategoriler    |
|  - /api/v1/actors/.../run   : Senkron/Asenkron çalıştırma & validasyon  |
|  - /api/v1/runs/:id/events  : SSE üzerinden canlı log & durum akışı     |
|  - /api/v1/datasets/:id     : Çıktı veri seti (JSON, CSV, MD.GZ)        |
|  - /.well-known/mcp.json    : Model Context Protocol (Ajan Keşfi)       |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                    PROTOKOL-7 MOTORU & VERI HAVUZU                      |
|                                                                         |
|  - Actor Registry (Cheerio, Playwright, PDF, Sitemap, SERP, E-Kütüphane)|
|  - Browser Session Pool & Stealth Manager                               |
|  - 4 Aşamalı Veto Zinciri (Metadata, Magic Bytes, Crypto, Content)      |
|  - Yerel Veri Havuzu: raw_landing, refined_content, quarantine, trash   |
+-------------------------------------------------------------------------+
```

---

## 2. Web MVP Fonksiyonel Kapsamı

Web MVP, Apify'ın en kritik işlevlerini gereksiz karmaşıklıktan arındırılmış, hafif ve yüksek performanslı bir arayüzle sunacaktır:

### 2.1 Aktör Mağazası / Kataloğu (`/actors`)
- **Filtreleme & Arama:** Kategori (`HEALTHCARE`, `ECOMMERCE`, `LEAD_GEN`, `SEARCH`, `DOCUMENT`, `GENERAL`), yazar ve anahtar kelimeye göre anlık arama.
- **Aktör Kartı Bileşenleri:** Başlık, kategori rozeti, kısa açıklama, 30 günlük başarı oranı (`%99.2`), toplam çalıştırma sayısı ve son güncelleme tarihi.

### 2.2 Aktör Detay Sayfası (`/actors/:namespace/:name`)
Apify incelemesinden elde edilen en iyi pratiklerle 4 ana sekme:
1. **Overview (Dokümantasyon):** `README.md` dosyasını GFM formatında başlık hiyerarşisi, parametre tabloları ve örnek çıktılarla render eder.
2. **Run (Dinamik Form & Konsol):** `INPUT_SCHEMA.json` sözleşmesine göre otomatik üretilen form.
   - İki yönlü mod: **Görsel Form** (metin kutusu, seçim listesi, boolean anahtarı, sayı alanı) $\leftrightarrow$ **JSON Editörü**.
   - "Tetikle / Çalıştır" butonu (Senkron veya Arka Plan).
3. **Runs & Canlı Monitör:**
   - Aktörün geçmiş çalıştırmaları (Durum: `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `VETOED`).
   - Çalışma anında SSE (Server-Sent Events) ile canlı log akışı ve bellek/süre sayacı.
4. **Dataset & Çıktı Gezgini:**
   - Çalıştırma sonucu üretilen verilerin tablo görünümü (Pagination, sütun bazlı sıralama).
   - Dışa aktarım formatları: `JSON`, `CSV`, `Markdown`, `.md.gz`.
5. **API & MCP Entegrasyonu:**
   - Aktörü dışarıdan çağırmak için hazır kod blokları: `cURL`, `TypeScript`, `Python`.
   - **MCP Tool Definition:** Claude, Gemini veya Cursor için tek tıkla kopyalanabilir tool konfigürasyonu.

### 2.3 Karantina ve Veto İzleme Paneli (`/quarantine`)
- 4 Aşamalı Veto Zinciri tarafından reddedilen hatalı/bozuk kayıtların (`veto_audit.json`) denetimi.
- Hangi kapıdan (`GATE1_METADATA`, `GATE2_MAGIC_BYTES`, `GATE3_CRYPTO`, `GATE4_CONTENT`) neden elendiğinin şeffaf görselleştirmesi.

---

## 3. Veri Sözleşmeleri ve Aktör Standartı

Her aktör kendi dizininde veya kayıt defterinde aşağıdaki 3 sözleşmeyi sağlar:

### A. `manifest.json`
```json
{
  "namespace": "core",
  "name": "pdf-document-actor",
  "title": "PDF Document Extractor",
  "version": "1.0.0",
  "description": "Binary PDF belgelerinden metin akışlarını, sayfa sınırlarını ve metaverileri ayıklar.",
  "category": "DOCUMENT",
  "tags": ["pdf", "extraction", "distillation"],
  "author": "protokol-7"
}
```

### B. `input.schema.json` (Zod Destekli)
```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "title": "Hedef URL",
      "description": "Taranacak veya ayıklanacak hedef web adresi.",
      "ui:widget": "url"
    },
    "maxPages": {
      "type": "integer",
      "title": "Maksimum Sayfa",
      "default": 50,
      "minimum": 1
    }
  },
  "required": ["url"]
}
```

### C. `output.schema.json`
Veri seti sütunlarını ve tiplerini tanımlar (Tablo bileşeninin dinamik kolon başlıkları üretmesi için).

---

## 4. Kullanıcı İncelemesi Gerektiren Konular

> [!IMPORTANT]
> **Web MVP Teknoloji Seçimi:**
> Web arayüzü için iki temiz seçenek mevcuttur:
> 1. **Vite + React + Tailwind CSS (Önerilen):** `protokol-7` deposu içinde `web/` klasöründe yer alır. Build alındığında tek bir statik bundle haline gelir ve doğrudan `src/core/server.ts` tarafından da `http://localhost:3000/` altında sunulabilir (Sıfır ek sunucu bağımlılığı, ultra hafif).
> 2. **Next.js (App Router):** Ayrı bir frontend servisi olarak koşar. SSR yetenekleri güçlüdür ancak ek bir Node.js süreci gerektirir.
> 
> *Önerimiz:* Geliştirme hızı, CLI ve yerel kullanım kolaylığı açısından **Seçenek 1 (Vite + React + Tailwind)**.

---

## 5. Uygulama Adımları (Aşama Aşama)

### Aşama 1: Aktör Kayıt Defteri ve Şema Motorunun Genişletilmesi (Backend)
- [ ] Mevcut tüm aktörlerin (`Cheerio`, `Playwright`, `Pdf`, `Sitemap`, `Serp`, `ApiExtractor`, `SaglikEkutuphane`) manifest ve Zod input/output şemalarının standartlaştırılması.
- [ ] `src/core/server.ts` içerisine Store API uçlarının eklenmesi:
  - `GET /api/v1/store/actors` (Katalog listesi)
  - `GET /api/v1/store/actors/:name` (Detay, README, şemalar)
  - `POST /api/v1/store/actors/:name/run` (Doğrulama ve çalıştırma)
  - `GET /api/v1/store/runs/:id/events` (SSE canlı log akışı)
  - `GET /api/v1/store/datasets/:id` (Sonuç veri seti)
  - `GET /api/v1/store/quarantine` (Veto denetim listesi)
  - `GET /.well-known/mcp.json` (Ajan tool kataloğu)

### Aşama 2: Web MVP Arayüzünün İnşası (Frontend)
- [ ] `web/` altında Vite + React + Tailwind CSS + Lucide Icons projesinin kurulması.
- [ ] **Bileşen 1: Store & Arama:** Kategori filtreleri, arama çubuğu ve aktör kartları.
- [ ] **Bileşen 2: Dinamik Form Motoru (`SchemaForm`):** `INPUT_SCHEMA.json`'dan dinamik UI üreten ve Zod validasyonu yapan form bileşeni.
- [ ] **Bileşen 3: Canlı Çalıştırma Konsolu (`RunConsole`):** SSE log akışını ASCII/ANSI formatında gösteren terminal bileşeni.
- [ ] **Bileşen 4: Veri Seti Görüntüleyici (`DatasetViewer`):** JSON ve tablo modunda çıktı inceleme ve indirme.
- [ ] **Bileşen 5: Karantina Monitörü (`QuarantineViewer`):** Veto edilen dosyaların neden elendiğini gösteren denetim tablosu.

### Aşama 3: CLI ve Mobil Hazırlığı
- [ ] CLI için `src/cli/index.ts` komut arabiriminin tanımlanması (`npx protokol run <actor>`).
- [ ] Web arayüzünün mobil uyumlu (Responsive / PWA) olarak tasarlanması (ileriki aşamada mobil uygulamaya dönüştürülebilir yapı).

---

## 6. Doğrulama Planı

### Otomatik Testler
```bash
# Backend Store API testleri
npm test tests/store-api.test.ts

# Linter ve Naming standartları kontrolü
npm run lint
npm run lint:naming
```

### Manuel Doğrulama
1. Tarayıcıda `http://localhost:3000` adresine girip Store kataloğunu listeleme.
2. Bir aktör seçip (örneğin `PdfDocumentActor` veya `CheerioScraperActor`) dinamik formdan girdi verme ve çalıştırma.
3. Canlı logların terminal bileşenine aktığını doğrulama.
4. Çıktı veri setinin tablo ve JSON formatında görüntülendiğini ve indirildiğini doğrulama.
5. Veto zincirine takılan bir girdinin `/quarantine` panelinde göründüğünü doğrulama.
