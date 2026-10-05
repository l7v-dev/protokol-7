# Beceri Seti Temizliği ve Konsolidasyon Planı

## Hedef ve Bağlam
Projede ve geliştirme ortamında yer alan, güncelliğini yitirmiş (obsolete), çift (duplicate) oluşturan ve bağlam penceresini (context budget) tüketen eski becerilerin (skills) temizlenmesi; aktif becerilerin standartlaştırılması.

## 1. Analiz Edilen Durum
1. **Çalışma Alanı (.agents/skills / skills):**
   - Eylül 2024'ten kalma ve harici Matt Pocock şablonundan miras kalan 15 atıl/şablon beceri bulunmaktadır:
     - Yönlendirme stutları: `grill-me`, `grill-with-docs`, `implement-spec`, `wait-what`
     - Harici issue tracker bağımlıları: `to-spec`, `to-tickets`, `triage`, `wayfinder`
     - Protokol-7 mimarisiyle örtüşmeyenler: `handoff` (Claude Code odaklı), `implement` (GEMINI.md dal kurallarını ihlal eden), `improve-codebase-architecture`, `loop-me`, `retro`, `setup-ts-deep-modules`, `to-questionnaire`.
   - Bu beceriler daha önce taşınan 10 becerinin (`ask-matt`, `setup-matt-pocock-skills` vb.) devamıdır.
   - Aktif ve korunacak çekirdek 16 beceri: `data-ingestion-protocol`, `dbx-management`, `naming-discipline`, `neuro-ergonomic-communication`, `tdd`, `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grilling`, `prototype`, `research`, `resolving-merge-conflicts`, `setup-pre-commit`, `wizard`, `writing-for-agents`.

2. **Global Ortam (~/.gemini/config/skills):**
   - 25 Temmuz'dan kalma 30 adet eski beceri kopyası bulunmaktadır.
   - Bu becerilerin tamamı `~/.gemini/config/plugins/data-agent-kit-plugin/skills/` altında modern eklenti olarak zaten mevcuttur.
   - Çift yükleme yüzünden sistem prompt'unda 30 beceri mükerrer görünmekte ve 8 meşru beceri ("context budget limits" nedeniyle) dışarıda kalmaktadır.

## 2. Uygulama Adımları
- [ ] **Adım 1: Çalışma Alanı Atıl Becerilerini Arşivleme**
  - 15 atıl beceriyi `.agents/skills/` altından `ledger/legacy-skills/` dizinine taşı.
- [ ] **Adım 2: Kural ve Doküman Çapraz Referanslarını Güncelleme**
  - `rules/failure-checklist.md` içindeki `grill-me` / `wait-what` referansını `grilling` ve üst-biliş (`metacognition`) ile güncelle.
  - `rules/task-discipline.md` içindeki `grill-me`, `to-spec`, `to-tickets` referanslarını protokol kurallarıyla güncelle.
  - `context/architecture-schema.md` içindeki beceri kütüphanesi envanterini güncelle.
- [ ] **Adım 3: Global Ortam Çift Kopyalarını Arşivleme**
  - `~/.gemini/config/skills/` dizinini güvenli şekilde `~/.gemini/config/skills_legacy_archive/` olarak arşivle.
  - Böylece `data-agent-kit-plugin` temiz ve tekil olarak yüklenir, bağlam bütçesi ferahlar.
- [ ] **Adım 4: Doğrulama ve Test**
  - `npm run verify` çalıştırarak 6 katmanlı doğrulamayı tamamla.
  - `npm test` ile test paketlerinin yeşil kaldığını teyit et.
  - DOAJ kesintisiz akışının (PID 106385) korunduğunu doğrula.
- [ ] **Adım 5: Walkthrough ve Bellek Senkronizasyonu**
  - `docs/walkthroughs/beceri-seti-temizligi-walkthrough.md` oluştur.
  - `TASKS.md` güncelle.
