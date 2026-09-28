# Yerel Hukuk ve Finans Aktörleri Uygulama Planı (Faz 1)

Bu plan, **protokol-7** bünyesinde Türkçe LLM eğitimi, yasal muhakeme ve finansal analiz için kritik veri sağlayan yerel aktörlerin (`resmi-gazete`, `yargitay`, `kap`) geliştirilmesini ve Google Drive depolama bağlayıcısı ile entegrasyonunu tanımlar.

---

## 1. Amaç ve Kapsam

- **resmi-gazete-actor:** T.C. Resmî Gazete arşivi ve günlük bültenlerinden Kanun, Cumhurbaşkanlığı Kararnamesi, Yönetmelik, Tebliğ ve Genelge metinlerinin çıkarılması.
- **yargitay-actor:** Yargıtay ve Danıştay emsal kararlarının, daire içtihatlarının ve gerekçeli hükümlerinin çıkarılması.
- **kap-actor:** Kamuoyu Aydınlatma Platformu (KAP) üzerinden BIST şirketlerinin özel durum açıklamaları, finansal dipnotları ve bağımsız denetim raporlarının çıkarılması.
- **Google Drive Entegrasyonu:** Çıkarılan metinlerin `GoogleDriveStorage` bağlayıcısı aracılığıyla ZSTD sıkıştırmalı Parquet ve JSONL şardları halinde SHA-256 makbuzlarıyla Google Drive'a arşivlenmesi.
- **Metadata Garantisi:** Belge no, tarih, mevzuat/içtihat türü, daire/kurul, kaynak URL, hash ve token metriklerinin eksiksiz kaydedilmesi.

---

## 2. Mimari Sözleşmeler ve Güvenlik İnvariantları

`docs/actor-contract.md` 8 adımlı tescil protokolü:
1. `src/api/types.ts`: `ActorType` union güncellemesi, TaskOptions ve Result arayüzleri.
2. `src/actors/corpus/<ad>-actor.ts`: `IActor<T>` arayüzünün uygulanması, SSRFGuard ve zaman aşımı kontrolleri.
3. `src/actors/corpus/index.ts`: Kategori bareli ihracı.
4. `src/index.ts`: Kök barel ihracı.
5. `src/actors/actor-manifests.ts`: Zod girdi şeması, etiketler ve MCP aracı tanımı.
6. `src/actors/actor-registry.ts`: `createDefaultActorRegistry` kaydı.
7. `examples/actors/<ad>.json`: Örnek REST/MCP çalışma yükü.
8. `tests/<ad>-actor.test.ts`: Başarılı çıkarma, SSRF engeli ve sınır durum testleri.
9. `docs/actors/<ad>.md`: Mermaid diyagramlı teknik wiki dokümantasyonu.
10. `context/architecture-schema.md`: Dosya ve bileşen envanterinin senkronizasyonu.

---

## 3. Adım Adım Uygulama Takvimi

### Adım 1: T.C. Resmî Gazete Aktörü (`resmi-gazete-actor`)
- Resmi Gazete web arşivi ve HTML/PDF yapısının incelenmesi.
- Tip sözleşmelerinin tanımlanması (`ResmiGazeteItem`, `ResmiGazeteActorTaskOptions`, `ResmiGazeteActorResult`).
- `ResmiGazeteActor` sınıfının `src/actors/corpus/resmi-gazete-actor.ts` olarak kodlanması.
- Manifesto, merkezi kayıt ve JSON örneğinin eklenmesi.
- `tests/resmi-gazete-actor.test.ts` test süitinin yazılması ve doğrulanması.
- `docs/actors/resmi-gazete.md` teknik dokümantasyonunun üretilmesi.

### Adım 2: Yargıtay / Danıştay İçtihat Aktörü (`yargitay-actor`)
- Emsal karar ve daire içtihatları arama ve detay yapısının çözümlenmesi.
- Tip sözleşmelerinin tanımlanması (`YargitayDecisionItem`, `YargitayActorTaskOptions`, `YargitayActorResult`).
- `YargitayActor` sınıfının `src/actors/corpus/yargitay-actor.ts` olarak kodlanması.
- Manifesto, kayıt ve testlerinin yazılması.
- `docs/actors/yargitay.md` teknik dokümantasyonunun üretilmesi.

### Adım 3: Kamuoyu Aydınlatma Platformu Aktörü (`kap-actor`)
- KAP bildirim ve finansal rapor API/veri yapısının incelenmesi.
- Tip sözleşmelerinin tanımlanması (`KapNotificationItem`, `KapActorTaskOptions`, `KapActorResult`).
- `KapActor` sınıfının `src/actors/corpus/kap-actor.ts` olarak kodlanması.
- Manifesto, kayıt ve testlerinin yazılması.
- `docs/actors/kap.md` teknik dokümantasyonunun üretilmesi.

### Adım 4: Google Drive Depolama Boru Hattı Şablonları ve Doğrulama
- `examples/pipelines/yerel-hukuk-resmi-gazete.yaml` boru hattı dosyasının hazırlanması.
- `GoogleDriveStorage` entegrasyonunun test edilmesi.
- Bütün testlerin (`npm test`) ve `npm run verify` kalite kapısının çalıştırılması.
