# Doğrulama Raporu: T.C. Resmî Gazete Aktörü ve Google Drive Entegrasyonu (Adım 1)

Bu walkthrough raporu, **protokol-7** Faz 1 yerel hukuk aktörleri kapsamındaki ilk bileşen olan `resmi-gazete-actor` geliştirme, tip sözleşmesi, test süiti ve Google Drive boru hattı entegrasyonunun doğrulanmasını belgeler.

---

## 1. Uygulanan Değişiklikler

1. **Tip Sözleşmesi (`src/api/types.ts`):**
   - `ActorType` union listesine `"resmi-gazete"` eklendi.
   - `ResmiGazeteItem`, `ResmiGazeteActorTaskOptions`, `ResmiGazeteActorResult` sözleşmeleri tanımlandı.
   - `ActorTask.options.resmiGazeteOptions` genişletildi.

2. **Aktör Sınıfı (`src/actors/corpus/resmi-gazete-actor.ts`):**
   - `ResmiGazeteActor` sınıfı kodlandı.
   - SSRFGuard hop-by-hop DNS doğrulama ve AbortController zaman aşımı invariantları sağlandı.
   - Resmî Gazete günlük bülten başlıkları (Sayı, Tarih, Mükerrer), kategorileri (Yürütme ve İdare, Yargı, İlanlar), kanun/karar numaraları ve PDF/HTML linkleri Cheerio ile modellendi.
   - Türkçe diakritik normalizasyonu (`normalizeTurkishText`) ile hatasız kategori (`kanun`, `yonetmelik`, `teblig`, `cumhurbaskanligi`, `kurul-karari`, `ilanlar`) ve metin içi sorgulama sağlandı.
   - LLM için yapılandırılmış GFM Markdown özet motoru entegre edildi.

3. **Merkezi Tescil ve Katalog:**
   - `src/actors/corpus/index.ts` ve `src/index.ts` barel ihracı tamamlandı.
   - `src/actors/actor-manifests.ts` içerisine Zod girdi şeması, etiketler ve `query_resmi_gazete` MCP araç tanımı kaydedildi.
   - `src/actors/actor-registry.ts` içerisinde `createDefaultActorRegistry` kaydı yapıldı.
   - `src/api/server.ts` içerisine `POST /api/v1/resmi-gazete` rotası eklendi.
   - `src/api/openapi-spec.ts` 3.1.0 şemasına uç nokta işlendi.
   - `examples/actors/resmi-gazete.json` ve `examples/pipelines/yerel-hukuk-resmi-gazete.yaml` (Google Drive hedefli) şablonları oluşturuldu.

4. **Teknik Dokümantasyon ve Mimari Şema:**
   - `docs/actors/resmi-gazete.md` Mermaid mimari/sıra/durum diyagramları ve girdi/çıktı sözleşmesiyle tamamlandı.
   - `context/architecture-schema.md` 33 aktör sayısıyla ve test envanteriyle güncellendi.
   - `src/actors/README.md` katalog fihristine eklendi.
   - `context/connectome.md` başarıyla yeniden üretildi.

---

## 2. Test ve Kalite Kapısı Sonuçları

- **Resmi Gazete Birim Testleri:** `tests/resmi-gazete-actor.test.ts` (7/7 PASS)
  - Uç nokta URL çözümleme ve tarih inşası (2024-03-15 -> eskiler/2024/03/20240315.htm)
  - SSRF engeli (169.254.169.254 / döngüsel adresler)
  - Yerel HTTP mock sunucusu ile bülten, kanun (7499), karar (8250) ve PDF linklerinin çıkarılması
  - Kategori filtreleme (`category: "yonetmelik"`)
  - Anahtar kelime arama (`query: "Anayasa"`)
  - 503 Upstream HTTP hata yönetimi
- **HTTP Sunucu Entegrasyonu:** `tests/server.test.ts` (26/26 PASS)
  - `POST /api/v1/resmi-gazete` rotasının doğrulanması
- **Statik Tip Güvenliği:** `npm run typecheck` (0 HATA)
- **Kod ve İsimlendirme Standardı:** `npm run lint` & `npm run lint:naming` (0 HATA)
- **Doğrulama Hattı:** `npm run verify` (6 aşamalı doğrulama: Mimari dosya, İsimlendirme disiplini, Sıfır emoji, Secret detection, SCA paket doğrulaması, Biome lint) (PASS)
