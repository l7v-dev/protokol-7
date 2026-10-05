# Doğrulama Raporu: Kamuoyu Aydınlatma Platformu (KAP) Aktörü ve Google Drive Entegrasyonu (Adım 3)

Bu walkthrough raporu, **protokol-7** Faz 1 yerel hukuk ve finans aktörleri kapsamındaki üçüncü bileşen olan `kap-actor` geliştirme, tip sözleşmesi, test süiti ve Google Drive boru hattı entegrasyonunun doğrulanmasını belgeler.

---

## 1. Uygulanan Değişiklikler

1. **Tip Sözleşmesi (`src/api/types.ts`):**
   - `ActorType` union listesine `"kap"` eklendi.
   - `KapDisclosureItem`, `KapActorTaskOptions`, `KapActorResult` sözleşmeleri tanımlandı.
   - `ActorTask.options.kapOptions` genişletildi.

2. **Aktör Sınıfı (`src/actors/corpus/kap-actor.ts`):**
   - `KapActor` sınıfı kodlandı.
   - SSRFGuard hop-by-hop DNS doğrulama ve AbortController 30s zaman aşımı invariantları sağlandı.
   - Hem KAP resmi JSON API bildirim yapıları hem de HTML bülten/şirket tabloları ve detay sayfalarını ayrıştıran çift modlu parser geliştirildi.
   - Şirket Kodu (BIST Ticker), Şirket Unvanı, Bildirim Tarihi/Saati, Bildirim Türü (ÖDA, FR, DG, GK), Başlık/Konu, Özet, İçerik Metni ve Ek Dosya URL'leri eksiksiz modellendi.
   - Türkçe karakter ve diyakritik normalizasyonu (`normalizeTurkishText`) ile hatasız hisse kodu (`THYAO`, `ASELS`), bildirim türü ve metin araması sağlandı.
   - LLM için yapılandırılmış GFM Markdown özet motoru entegre edildi.

3. **Merkezi Tescil ve Katalog:**
   - `src/actors/corpus/index.ts` ve `src/index.ts` barel ihracı tamamlandı.
   - `src/actors/actor-manifests.ts` içerisine Zod girdi şeması, etiketler ve `query_kap` MCP araç tanımı kaydedildi (toplam 45 araç).
   - `src/actors/actor-registry.ts` içerisinde `createDefaultActorRegistry` kaydı yapıldı.
   - `src/mcp/protokol-mcp-server.ts` `tools/call` yönlendiricisine `kapOptions` eşlemesi eklendi.
   - `src/api/server.ts` içerisine `POST /api/v1/kap` ve `/kap` rotası eklendi.
   - `src/api/openapi-spec.ts` 3.1.0 şemasına uç nokta işlendi.
   - `examples/actors/kap.json` ve `examples/pipelines/yerel-finans-kap.yaml` (Google Drive hedefli) şablonları oluşturuldu.

4. **Teknik Dokümantasyon ve Mimari Şema:**
   - `docs/actors/kap.md` Mermaid mimari/sıra/durum diyagramları ve girdi/çıktı sözleşmesiyle tamamlandı.
   - `context/architecture-schema.md` 35 aktör sayısıyla ve test envanteriyle güncellendi.
   - `src/actors/README.md` katalog fihristine 35. aktör olarak eklendi.
   - `context/connectome.md` başarıyla yeniden üretildi.

---

## 2. Test ve Kalite Kapısı Sonuçları

- **KAP Aktörü Birim Testleri:** `tests/kap-actor.test.ts` (7/7 PASS)
  - Aktör başlatma ve açıklama doğrulaması
  - Uç nokta URL çözümleme (şirket kodu, arama kriterleri, direct URL)
  - SSRF engeli (169.254.169.254 bulut metadata koruması)
  - JSON bildirim kayıtlarının ayrıştırılması ve künye çıkarımı
  - HTML bildirim tablolarının ayrıştırılması ve alan tespiti
  - Türkçe diyakritik normalizasyonu ile şirket kodu ve anahtar kelime filtreleme
  - 503 Upstream HTTP hata yönetimi
- **HTTP Sunucu Entegrasyonu:** `tests/server.test.ts` (38/38 PASS)
  - `POST /api/v1/kap` rotasının doğrulanması
- **MCP Sunucu Entegrasyonu:** `tests/protokol-mcp-server.test.ts` (10/10 PASS)
  - 45 kayıtlı MCP aracı ve `query_kap` mevcudiyet doğrulaması
- **Tüm Test Süiti:** `npm test` (548/548 PASS, 83 test süiti)
- **Statik Tip Güvenliği:** `npm run typecheck` (0 HATA)
- **Doğrulama Hattı:** `npm run verify` (6 aşamalı doğrulama: Mimari dosya, İsimlendirme disiplini, Sıfır emoji, Secret detection, SCA paket doğrulaması, Biome lint) (PASS)
