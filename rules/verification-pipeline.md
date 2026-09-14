# Verification Pipeline — Deterministik Doğrulama Hattı

Kaynak: kurumsal 5 katmanlı denetim mimarisi araştırması. İstem
mühendisliği (prompt'ta "dikkatli ol" yazmak) güvenlik açığı oranını
istatistiksel olarak düşürmüyor — bu yüzden her katman bir **araç/script**
ile uygulanır, ajanın kendi kendine dikkatli olmasına güvenilmez.

## 1. Sözleşme & Mimari Sınırlar

- Katı tip kontrolü (`strict mode`) asla kapatılamaz — kapatma teklifi Tier 3 değildir.
- Modül sınırları: Bir modül kendi klasörünün dışına implementasyon detayı sızdıramaz (Clean Architecture).
- Biome Kod Stili & Statik Analiz (`biome.json`, `npm run lint`): Meta ve Google mühendislik prensipleriyle uyumlu Biome linter zorunludur. `noExplicitAny: error`, `noUnusedVariables: error`, `useConst: error`, `noDoubleEquals: error` kuralları gevşetilemez.
- İsimlendirme disiplini (`naming-discipline`) ve loglama disiplini (`logging-discipline`) her kontrolde sıfır hata vermelidir (`npm run verify`).

## 2. Bağımlılık & Tedarik Zinciri Denetimi

Paket halüsinasyonları ticari modellerde bile %5,2 — açık modellerde %21,7.
Bu yüzden:

- Yeni bir paket önerilmeden önce **canlı sorgu** zorunludur: `npm run sca <paket>` veya `node scripts/sca-check.mjs <paket>` çalıştırılıp gerçekten var olduğu, sürüm geçmişi ve indirme sayısı doğrulanır.
- Var olmayan veya uydurma sürüm numarası önerilirse, bu bir bilgi eksikliği sinyalidir — işlem durdurulur.
- `package.json`'a hiçbir paket, bu canlı sorgu adımı atlanarak eklenemez (Tier 3 asla).

## 3. Uzman-Uygulayıcı Gözetimi (Expert-Executor)

Tekil ajanların kilitlendiği vakaların %22,2'si dış gözlemciyle çözülüyor:

- Kod yazan ajan = **Uygulayıcı**. `code-review` becerisi = **Uzman**.
- Tier 2+ her değişiklik, teslimden önce `code-review` becerisinden geçer — aynı oturumda bile olsa, ayrı bir analiz adımı olarak.
- Uzman geçişi, standartlara uygunluk kadar "bu görev ne istemişti" sorusunu da sorar (spec-conformance).

## 4. Biçimsel Doğrulama (Eşzamanlılık & Durum)

Prensip: **Durum (state) taşıyan ve asenkron kod metin okumayla değil, çalıştırılarak denetlenir.**

- Paylaşılan durum, oturum yönetimi veya havuz mekanizmalarına dokunulduğunda eşzamanlılık (concurrency) testi zorunludur.
- Kaynak sızıntısı riski olan her değişiklikte (soket, dosya tanıtıcı, veritabanı bağlantısı) "hata yolunda temizleniyor mu" sorusu açıkça test edilir, varsayılmaz.

## 5. Mutasyon Tabanlı Test Süzgeci

%100 satır kapsamı, ajan üretimi testlerde mutasyon skorunun ~%18,8'e düşebildiğini gösteriyor — yani testler kırılgan kodu yakalamıyor.

- Kritik modüllerde periyodik olarak mutasyon testleri çalıştırılması önerilir.
- Bir testin şu deseni taşıyıp taşımadığı denetlenir: `assertEquals(fonksiyonunKendisi(), gerçekÇıktı)` — yani test, şartnameden bağımsız bir beklenen değer yerine fonksiyonun kendi çıktısını doğruluyorsa, o test geçersizdir (totolojik test).

---
 
## Otomasyon Hattı (`npm run verify` / `scripts/verify-pipeline.mjs`)

Hattın çalıştırdığı 5 deterministik adım:
1. `[1/5] Mimari Dosya Bütünlüğü`: `AGENTS.md`, `TASKS.md`, `biome.json`, `rules/`, `context/`, `skills/`, `docs/plans/`, `docs/walkthroughs/`, `archive/index.jsonl`.
2. `[2/5] İsimlendirme Disiplini`: Kod tabanında yasaklı pazarlama terimlerinin (`smart`, `intelligent`, `next-gen` vb.) otomatik taranması.
3. `[3/5] Loglama Disiplini`: Kodlarda ve betiklerde emoji bulunmaması garantisi (Sıfır emoji kuralı).
4. `[4/5] SCA & Paket Halüsinasyon Kontrolü`: Harici npm bağımlılıklarının resmi npm registry üzerinde canlı doğrulanması.
5. `[5/5] Kod Stili ve Statik Analiz (Biome Lint)`: `biome check` ile syntax, format, kullanılmayan değişkenler ve katı tip ihlallerinin sıfır toleransla taranması.

---

Bu beş katman `rules/failure-checklist.md` ile birlikte çalışır: checklist
ajanın **kendi kendine** taradığı refleks, bu dosya ise **dışarıdan**
(script/araç) uygulanan zorunlu kapıdır. İkisi çakışırsa dış araç kazanır.
