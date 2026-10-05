# Aktör Şablonu, Standart Sözleşme ve CLI İskele Üreteci (Scaffolding) Doğrulama Özeti

## 1. Uygulanan Değişiklikler

* **Teknik Sözleşme Şartnamesi (`docs/actor-contract.md`):**
  Aktör kategorileri (`web`, `corpus`, `documents`), zorunlu invariantlar (SSRFGuard, timeout, allowLocalNetwork, executionDurationMs telemetrisi) ve 8 adımlı tescil kontrol listesi belgelendi.

* **Referans Aktör Şablonu (`src/actors/actor.template.ts`):**
  Yeni aktörler için kopyalanıp iş mantığı doldurulabilecek tip korumalı (`IActor<TemplateActorResult>`) referans iskeleti oluşturuldu.

* **Aktör İskele Üreteci CLI (`scripts/scaffold-actor.mjs` & `npm run make:actor`):**
  Argüman doğrulama (kategori, kebab-case isim), aktör dosyası, örnek JSON ve birim test süiti üreten, kategori bareline export ekleyen ve sonraki adımları listeleyen otomasyon betiği yazıldı.

* **Test Süiti (`tests/scaffold-actor.test.ts`):**
  Scaffolding betiğinin argüman doğrulamasını (geçersiz kategori, geçersiz isim, yetersiz argüman, var olan aktör çakışması) ve şablon dosyasının güvenlik invariantlarını test eden 5 birim testi eklendi.

* **Dokümantasyon ve Barel Senkronizasyonu:**
  `scripts/README.md`, `context/architecture-schema.md` ve `package.json` güncellendi.

---

## 2. Doğrulama Sonuçları

### 2.1 Birim ve Entegrasyon Testleri (`npm test`)
```text
ℹ tests 502
ℹ suites 77
ℹ pass 502
ℹ fail 0
ℹ duration_ms 28875
```

### 2.2 Scaffolding Testi (`npx tsx --test tests/scaffold-actor.test.ts`)
```text
✔ fails with exit code 1 when insufficient arguments are provided
✔ fails with exit code 1 when an invalid category is provided
✔ fails with exit code 1 when an invalid actor name is provided
✔ fails with exit code 1 when target actor already exists
✔ verifies actor template file exists and contains mandatory security invariants
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

### 2.3 Deterministik Doğrulama Hattı (`npm run verify`)
* `[1/6]` Mimari dosya bütünlüğü: **[OK]**
* `[2/6]` İsimlendirme disiplini (sıfır pazarlama jargonu): **[OK]**
* `[3/6]` Loglama disiplini (sıfır emoji): **[OK]**
* `[4/6]` Gizli anahtar taraması: **[OK]**
* `[5/6]` Bağımlılık ve SCA denetimi (11 paket): **[PASS]**
* `[6/6]` Biome lint ve format: **[OK]** (231 dosya)
