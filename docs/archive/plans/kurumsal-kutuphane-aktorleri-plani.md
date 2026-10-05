# Kurumsal Kütüphane Scraping Aktörleri Planı (Sağlık Bakanlığı & KTB E-Kitap)

Bu plan, `scripts/harvest-ekutuphane.mjs` ve `scripts/harvest-ktb-ekitap.mjs` bağımsız veri çekme betiklerinin protokol-7 birinci sınıf aktör mimarisine (`SaglikEkutuphaneActor` ve `KtbEkitapActor`) dönüştürülmesini, REST rotalarının, MCP araçlarının, OpenAPI spesifikasyonunun ve birim testlerinin hazırlanmasını kapsar.

## 1. Hedefler ve Kapsam

1. **`SaglikEkutuphaneActor` (`src/actors/saglik-ekutuphane-actor.ts`)**:
   - Hedef: `https://ekutuphane.saglik.gov.tr`
   - İşlemler:
     - `list`: Kitap, dergi ve makaleleri sayfalama desteğiyle listeleme (`/YayinTur/{Kitap|Dergi|Makale}?sayfa={page}`).
     - `detail`: Belirli bir yayın kimliği (ID) için ayrıntılı metaverileri çıkarma (`/Yayin/{id}`).
     - `extract`: Yayın detayını alma ve PDF içeriğini (`/Eklenti/{id}`) `unpdf` ile ayıklayarak temiz Markdown/metin formatında sunma.
   - Güvenlik: `SSRFGuard`, timeout yönetimi ve kontrollü hata fırlatma.

2. **`KtbEkitapActor` (`src/actors/ktb-ekitap-actor.ts`)**:
   - Hedef: `https://ekitap.ktb.gov.tr` (Kültür ve Turizm Bakanlığı E-Kitap Portalı).
   - İşlemler:
     - `list`: Kategorilere göre (`edebiyat`, `tarih`, `sanat`, `kultur`, `halk-bilimi`, `son-eklenen`, vb.) kitap listeleme.
     - `detail`: Kitap detay sayfası metaverilerini (yazar, yayınevi, sayfa sayısı, özet, indirme URL'i) çıkarma.
     - `extract`: Anti-hotlinking korumasını aşmak için dinamik `Referer` başlığıyla PDF indirme ve metin arındırma (başlık/altbilgi temizliği, hece birleştirme, Markdown üretimi).
   - Güvenlik: `SSRFGuard`, anti-hotlinking referer enjeksiyonu ve timeout yönetimi.

3. **Tip ve Şema Tanımları (`src/core/types.ts`)**:
   - `ActorType`: `"saglik-ekutuphane"` ve `"ktb-ekitap"`
   - `SaglikEkutuphaneTaskOptions`, `SaglikEkutuphaneItem`, `SaglikEkutuphaneActorResult`
   - `KtbEkitapTaskOptions`, `KtbEkitapItem`, `KtbEkitapActorResult`
   - `ActorTask.options` içinde `saglikEkutuphaneOptions` ve `ktbEkitapOptions` alanları.

4. **Kayıt ve Manifest Güncellemeleri**:
   - `src/actors/actor-registry.ts`: Her iki aktörün `createDefaultActorRegistry`'ye kaydedilmesi.
   - `src/actors/actor-manifests.ts`: Şemaların, kategori ve örneklerin tanımlanması.

5. **REST API ve OpenAPI 3.1.0 Entegrasyonu**:
   - `src/core/server.ts`:
     - `POST /api/v1/saglik-ekutuphane` ve `POST /saglik-ekutuphane`
     - `POST /api/v1/ktb-ekitap` ve `POST /ktb-ekitap`
   - `src/core/openapi-spec.ts`: Yeni uç noktaların ve şemaların OpenAPI spesifikasyonuna eklenmesi.

6. **Model Context Protocol (MCP) Sunucusu**:
   - `src/mcp/protokol-mcp-server.ts`: `saglik_ekutuphane` ve `ktb_ekitap` araçlarının tanımlanması ve `tools/call` yönlendiricisine eklenmesi.

7. **Test ve Doğrulama**:
   - `tests/saglik-ekutuphane-actor.test.ts`
   - `tests/ktb-ekitap-actor.test.ts`
   - `npm test`, `npm run lint`, `npm run typecheck`, `npm run verify`

## 2. Risk ve Güvenlik Değerlendirmesi
- `Trust-Tier: 2` (Orta etki alanı, mevcut API sözleşmelerini kırmadan yeni modül ekleme).
- SSRF Koruması: Dış HTTP istekleri `safeRedirectFetch` veya `SSRFGuard` kontrolünden geçirilmelidir.
- Sıfır Emoji ve Naming Discipline: Tüm log, yorum ve açıklamalarda pazarlama jargonu ve emojiden kaçınılmalıdır.
