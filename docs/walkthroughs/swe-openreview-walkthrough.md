# Doğrulama Raporu: OpenReview Aktörü ve Akademik Hakemlik/Muhakeme Korpus Entegrasyonu (Faz 2 - Adım 2)

Bu walkthrough raporu, **protokol-7** Faz 2 yazılım mühendisliği (SWE) ve bilimsel muhakeme aktörleri kapsamındaki ikinci bileşen olan `openreview-actor` geliştirme, tip sözleşmesi, test süiti ve MCP/REST entegrasyonunun doğrulanmasını belgeler.

---

## 1. Uygulanan Değişiklikler

1. **Tip Sözleşmesi (`src/api/types.ts`):**
   - `ActorType` union listesine `"openreview"` eklendi.
   - `OpenReviewNoteItem`, `OpenReviewActorTaskOptions`, `OpenReviewActorResult` sözleşmeleri tanımlandı.
   - `ActorTask.options.openreviewOptions` alanı genişletildi.

2. **Aktör Sınıfı (`src/actors/corpus/openreview-actor.ts`):**
   - `OpenReviewActor` sınıfı kodlandı.
   - SSRFGuard hop-by-hop DNS doğrulama ve AbortController 30s zaman aşımı invariantları sağlandı.
   - OpenReview REST API v1 ve v2 (`api2.openreview.net`) desteği sağlandı.
   - v1 düz alanlar ile v2 `{ value: ... }` sarmalı içerikleri şeffaf biçimde çözen çift modlu ayrıştırıcı (`parseNotes`) yazıldı.
   - Üç eylem modu (`submissions`, `forum`, `note`) geliştirildi.
   - `forum` modunda kök makale, nihai karar (decision/meta-review), resmi hakem incelemeleri (puan, güven skoru, metin) ve yazar yanıtları (rebuttal) hiyerarşik ve diyalektik bir yapıda GFM Markdown formatına dönüştürüldü.

3. **Merkezi Tescil ve Katalog:**
   - `src/actors/corpus/index.ts` ve `src/index.ts` barel ihracı alfabetik sırayla tamamlandı.
   - `src/actors/actor-manifests.ts` içerisine Zod girdi şeması, etiketler ve `query_openreview` MCP araç tanımı kaydedildi (toplam 47 araç).
   - `src/actors/actor-registry.ts` içerisinde `createDefaultActorRegistry` kaydı yapıldı.
   - `src/mcp/protokol-mcp-server.ts` `tools/call` yönlendiricisine `openreviewOptions` eşlemesi eklendi.
   - `src/api/server.ts` içerisine `POST /api/v1/openreview` ve `/openreview` rotası eklendi.
   - `src/api/openapi-spec.ts` 3.1.0 şemasına `/api/v1/openreview` uç noktası işlendi.
   - `examples/actors/openreview.json` ve `examples/pipelines/openreview-pipeline.yaml` şablonları oluşturuldu.

4. **Teknik Dokümantasyon ve Mimari Şema:**
   - `docs/actors/openreview.md` Mermaid mimari/sıra/durum diyagramları ve girdi/çıktı sözleşmesiyle tamamlandı.
   - `context/architecture-schema.md` 37 aktör sayısıyla ve test envanteriyle güncellendi.
   - `src/actors/README.md` katalog fihristine 37. aktör olarak eklendi.
   - `context/connectome.md` başarıyla yeniden üretildi.

---

## 2. Test ve Kalite Kapısı Sonuçları

- **OpenReview Aktörü Birim Testleri:** `tests/openreview-actor.test.ts` (7/7 PASS)
  - Aktör başlatma ve açıklama doğrulaması
  - Hedef URL ve opsiyonlardan parametre ve eylem çözümleme
  - Forum, bildiri, not ve arama için API URL inşası
  - SSRF engeli (169.254.169.254 bulut metadata koruması)
  - v1 ve v2 formatındaki bildiri notlarının ayrıştırılması
  - Kök makale, hakem puanları, güven metrikleri ve yazar yanıtları ile diyalektik Markdown üretimi
  - Upstream HTTP hata (500) yönetimi
- **HTTP Sunucu Entegrasyonu:** `tests/server.test.ts` (30/30 PASS)
  - `POST /api/v1/openreview` rotasının doğrulanması
- **MCP Sunucu Entegrasyonu:** `tests/protokol-mcp-server.test.ts` (12/12 PASS)
  - 47 kayıtlı MCP aracı ve `query_openreview` parametre yönlendirme doğrulaması
- **Statik Tip Güvenliği:** `npm run typecheck` (0 HATA)
