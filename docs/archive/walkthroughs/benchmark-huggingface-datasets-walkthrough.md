# Doğrulama Raporu: Hugging Face Datasets Aktörü ve Açık Korpus Entegrasyonu (Faz 3 - Adım 1)

Bu walkthrough raporu, **protokol-7** Faz 3 (Matematik, Mantık ve Benchmark Kümeleri) kapsamındaki ilk bileşen olan `huggingface-datasets-actor` geliştirme, tip sözleşmesi, test süiti, MCP/REST entegrasyonu ve kalite kapılarının doğrulanmasını belgeler.

---

## 1. Uygulanan Değişiklikler

1. **Tip Sözleşmesi (`src/api/types.ts`):**
   - `ActorType` union listesine `"huggingface-datasets"` eklendi.
   - `HuggingFaceDatasetsFeatureItem`, `HuggingFaceDatasetsSplitItem`, `HuggingFaceDatasetsActorTaskOptions`, `HuggingFaceDatasetsActorResult` arayüzleri tanımlandı.
   - `ActorTask.options.huggingfaceDatasetsOptions` alanı eklendi.

2. **Aktör Sınıfı (`src/actors/corpus/huggingface-datasets-actor.ts`):**
   - `HuggingFaceDatasetsActor` sınıfı `IActor<HuggingFaceDatasetsActorResult>` olarak kodlandı.
   - SSRFGuard DNS hop-by-hop doğrulama ve AbortController 30s zaman aşımı invariantları sağlandı.
   - Hugging Face Datasets Serverless API (`https://datasets-server.huggingface.co`) ile 4 mod (`rows`, `splits`, `info`, `size`) geliştirildi.
   - `rows` modunda dataset satırlarını, sütun şema özelliklerini ve toplam satır sayısını ayıklayan ve ilk 20 satırı GFM Markdown tablosuna dönüştüren motor yazıldı.
   - `splits` modunda konfigürasyon ve split satır sayılarını tablo olarak listeleyen çıktı üretildi.
   - `info` modunda lisans, anasayfa, açıklama ve BibTeX atıf kartı render edildi.
   - `HF_TOKEN` opsiyonel desteği ile kapalı/özel veri setlerine erişim güvenceye alındı.

3. **Merkezi Tescil ve Katalog:**
   - `src/actors/corpus/index.ts` ve `src/index.ts` barel ihracı alfabetik sırayla tamamlandı.
   - `src/actors/actor-manifests.ts` içerisine Zod girdi şeması, etiketler ve `query_huggingface_datasets` MCP araç tanımı kaydedildi (toplam 49 araç).
   - `src/actors/actor-registry.ts` içerisinde `createDefaultActorRegistry` kaydı yapıldı.
   - `src/mcp/protokol-mcp-server.ts` `tools/call` yönlendiricisine `huggingfaceDatasetsOptions` eşlemesi eklendi.
   - `src/api/server.ts` içerisine `POST /api/v1/huggingface-datasets` ve `/huggingface-datasets` rotası eklendi.
   - `src/api/openapi-spec.ts` 3.1.0 şemasına `/api/v1/huggingface-datasets` uç noktası işlendi.
   - `examples/actors/huggingface-datasets.json` ve `examples/pipelines/huggingface-datasets-pipeline.yaml` şablonları oluşturuldu.

4. **Teknik Dokümantasyon ve Mimari Şema:**
   - `docs/actors/huggingface-datasets.md` Mermaid mimari/sıra/durum diyagramları ve 11 standart bölümle tamamlandı.
   - `context/architecture-schema.md` 39 aktör sayısıyla ve test envanteriyle güncellendi.
   - `src/actors/README.md` katalog fihristine 39. aktör olarak eklendi.
   - `context/connectome.md` başarıyla yeniden üretildi.

---

## 2. Test ve Kalite Kapısı Sonuçları

- **Hugging Face Datasets Aktörü Birim Testleri:** `tests/huggingface-datasets-actor.test.ts` (9/9 PASS)
  - Aktör başlatma ve açıklama doğrulaması
  - Hedef URL ve opsiyonlardan parametre ve eylem çözümleme
  - Rows, splits ve info için API URL inşası
  - SSRF engeli (169.254.169.254 bulut metadata koruması)
  - Zorunlu dataset parametresi eksikliğinde 400 hatası
  - GSM8K satır akıtma, sütun şeması ve GFM Markdown tablosu üretimi
  - Splits listeleme ve Markdown tablosu doğrulaması
  - Info meta-veri, açıklama ve BibTeX atıf kartı ayrıştırması
  - Upstream HTTP hata (404/500) yönetimi
- **HTTP Sunucu Entegrasyonu:** `tests/server.test.ts` (32/32 PASS)
  - `POST /api/v1/huggingface-datasets` rotasının doğrulanması
- **MCP Sunucu Entegrasyonu:** `tests/protokol-mcp-server.test.ts` (14/14 PASS)
  - 49 kayıtlı MCP aracı ve `query_huggingface_datasets` parametre yönlendirme doğrulaması
- **Statik Tip Güvenliği:** `npm run typecheck` (0 HATA)
- **Tüm Depo Test Süiti:** `npm test` (588/588 PASS, 87 test süiti)
- **Altı Aşamalı Doğrulama Hattı:** `npm run verify` (100% PASS)
- **Statik Kod Analizi ve Format:** `npx biome check src/ tests/ examples/` (221 dosya, 0 HATA)
