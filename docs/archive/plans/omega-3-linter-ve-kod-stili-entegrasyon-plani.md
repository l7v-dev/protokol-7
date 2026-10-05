# Omega-3 Biome Linter ve Kod Stili Entegrasyon Planı

Bu plan, projede ve gelecekteki projelerde yapay zeka ajanlarının sözdizimi hatalarını, tip kaçaklarını (`any`), ölü kodları ve kod biçimlendirme düzensizliklerini engellemek için Rust tabanlı endüstri standardı **Biome (`@biomejs/biome`)** linter ve formatter aracını deterministik doğrulama hattına (`npm run verify`) entegre etmeyi hedefler.

## User Review Required

> [!IMPORTANT]
> - Biome, ESLint ve Prettier'ın yerini alan tek paketli, sıfır bağımlılık cehennemine sahip ve 35 kat daha hızlı çalışan modern kurumsal standarttır.
> - Ajanların `any` tipine kaçmasını engellemek için `noExplicitAny: error`, kullanılmayan import ve değişkenleri engellemek için `noUnusedVariables: error` kuralları zorunlu kılınacaktır.
> - `npm run verify` artık kod stili ve statik analiz hatalarını da denetleyecektir.

## Proposed Changes

### 1. Konfigürasyon ve Paket Bağımlılıkları
#### [NEW] [biome.json](file:///home/l7v/l7v-dev/omega-3/biome.json)
- Meta/Google stili 2 space girinti, 100 satır sınırı.
- Katı linter kuralları (`noExplicitAny`, `noUnusedVariables`, `useConst`).

#### [MODIFY] [package.json](file:///home/l7v/l7v-dev/omega-3/package.json)
- `@biomejs/biome` devDependency olarak eklenecek.
- `npm run lint` ve `npm run format` komutları tanımlanacak.

### 2. Doğrulama ve Scaffolding Entegrasyonu
#### [MODIFY] [scripts/verify-pipeline.mjs](file:///home/l7v/l7v-dev/omega-3/scripts/verify-pipeline.mjs)
- `[5/5] Kod Stili ve Statik Analiz (Biome Lint)` adımı eklenecek.

#### [MODIFY] [scripts/init-omega.mjs](file:///home/l7v/l7v-dev/omega-3/scripts/init-omega.mjs)
- `biome.json` kopyalama listesine eklenecek, böylece yeni projelere de otomatik linter kurulacak.

#### [MODIFY] [rules/verification-pipeline.md](file:///home/l7v/l7v-dev/omega-3/rules/verification-pipeline.md)
- Biome statik analiz standardı belgelenecek.

### 3. Kalıcı Dokümantasyon
#### [NEW] [docs/plans/omega-3-linter-ve-kod-stili-entegrasyon-plani.md](file:///home/l7v/l7v-dev/omega-3/docs/plans/omega-3-linter-ve-kod-stili-entegrasyon-plani.md)
#### [NEW] [docs/walkthroughs/omega-3-linter-ve-kod-stili-entegrasyon-walkthrough.md](file:///home/l7v/l7v-dev/omega-3/docs/walkthroughs/omega-3-linter-ve-kod-stili-entegrasyon-walkthrough.md)

---

## Verification Plan

### Automated Tests
- `npm run lint` çalıştırılarak mevcut JavaScript/TypeScript dosyalarının analizi.
- `npm run format` ile biçimlendirme testi.
- `npm run verify` ile 5 katmanlı bütünleşik doğrulama testi.
- Git commit oluşturularak durumun temizlendiğinin doğrulanması.
