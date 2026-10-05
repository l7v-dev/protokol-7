# Türk Hukuku & Küresel Patent Mühendisliği Paketi (Set 4) Walkthrough

Bu doküman, `docs/plans/wikimedia-kardesleri-ve-yeni-aktor-setleri-plani.md` ve `docs/plans/turk-hukuku-ve-patent-aktorleri-plani.md` kapsamındaki **SET 4: Türk Hukuku & Küresel Patent Mühendisliği Paketi** dahilinde hayata geçirilen 3 aktörün (`anayasa-mahkemesi`, `danistay`, `google-patents`) mimari tasarımını, tip sözleşmelerini, REST/MCP entegrasyonlarını ve doğrulama sonuçlarını belgeler.

---

## 1. Uygulanan Aktörler Özeti

| Aktör Kodu | Sınıf Adı | Kategori | Kaynak ve Protokol | Desteklenen Modlar |
|---|---|---|---|---|
| `anayasa-mahkemesi` | `AnayasaMahkemesiActor` | `DOCUMENT` | T.C. Anayasa Mahkemesi Kararlar Bilgi Bankası | `individual_application`, `norm_review`, `search`, `decision` |
| `danistay` | `DanistayActor` | `DOCUMENT` | T.C. Danıştay Başkanlığı Emsal Karar Sistemi | `search`, `decision` |
| `google-patents` | `GooglePatentsActor` | `DOCUMENT` | Google Patents & USPTO/EPO Public Data | `patent`, `search`, `claims` |

---

## 2. Mimari Katmanlar ve Değişiklikler

1. **Tip Sözleşmeleri (`src/api/types.ts`)**:
   - `ActorType` union kümesine `"anayasa-mahkemesi" | "danistay" | "google-patents"` eklendi.
   - `AnayasaMahkemesiActorTaskOptions`, `AnayasaMahkemesiActorResult`, `AnayasaMahkemesiDecisionItem`, `AnayasaMahkemesiDecisionDetail` tanımlandı.
   - `DanistayActorTaskOptions`, `DanistayActorResult`, `DanistayDecisionItem`, `DanistayDecisionDetail` tanımlandı.
   - `GooglePatentsActorTaskOptions`, `GooglePatentsActorResult`, `GooglePatentItem`, `GooglePatentClaimItem` tanımlandı.
   - `ActorTask["options"]` nesnesine `anayasaMahkemesiOptions`, `danistayOptions`, `googlePatentsOptions` bağlandı.

2. **Aktör Sınıfları (`src/actors/corpus/`)**:
   - `anayasa-mahkemesi-actor.ts`: Norm denetimi iptal/itiraz davaları, bireysel başvuru hak ihlali hükümleri, olaylar, hukuki değerlendirmeler, hüküm ve karşı oyları çıkaran aktör.
   - `danistay-actor.ts`: İdari dava daireleri (1-13), İDDK, VDDK ve İBK emsal kararlarını, tetkik hakimi ve savcı düşüncelerini çıkaran aktör.
   - `google-patents-actor.ts`: Dünya patentleri, bağımsız/bağımlı teknik iddialar (claims) hiyerarşisi, tarifname ve CPC/IPC sınıflandırma kodlarını çıkaran aktör.

3. **Merkezi Kayıt & Dağıtım**:
   - `src/actors/corpus/index.ts` ve `src/index.ts` alfabetik sırada güncellendi.
   - `src/actors/actor-manifests.ts` içine Zod/JSON şemaları ve MCP araçları (`query_anayasa_mahkemesi`, `query_danistay`, `query_google_patents`) eklendi (toplam MCP araç sayısı 74'ten 77'ye çıktı).
   - `src/actors/actor-registry.ts` içinde `createDefaultActorRegistry()` fonksiyonuna 3 aktör kaydedildi (toplam kayıtlı aktör sayısı 57'den 60'a çıktı).
   - `src/mcp/protokol-mcp-server.ts` içinde görev opsiyonları haritalandı.

4. **HTTP REST Router & OpenAPI 3.1.0**:
   - `src/api/server.ts` rotaları:
     - `POST /api/v1/anayasa-mahkemesi` & `POST /anayasa-mahkemesi`
     - `POST /api/v1/danistay` & `POST /danistay`
     - `POST /api/v1/google-patents` & `POST /google-patents`
   - `src/api/openapi-spec.ts` altında `Corpus - Legal & Patent` etiketiyle OpenAPI 3.1.0 tanımları yapıldı.

5. **Dokümantasyon & Örnekler**:
   - `docs/actors/anayasa-mahkemesi.md`
   - `docs/actors/danistay.md`
   - `docs/actors/google-patents.md`
   - `examples/actors/anayasa-mahkemesi.json`
   - `examples/actors/danistay.json`
   - `examples/actors/google-patents.json`
