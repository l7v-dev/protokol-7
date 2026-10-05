# Aktör Şablonu, Standart Sözleşme ve CLI İskele Üreteci (Scaffolding) Planı

## 1. Amaç ve Kapsam

Protokol-7 içerisinde yeni bir aktör (web kazıyıcı, corpus veri toplayıcı veya belge/arşiv çıkarıcı) eklerken yaşanan 8 dosyalık entegrasyon yükünü, kopyala-yapıştır kaynaklı güvenlik/hata risklerini ve kazan plakası (boilerplate) tekrarını ortadan kaldırmak.
Tüm aktörlerin uyması gereken teknik şartnameyi belgelemek ve `npm run make:actor` CLI komutu ile deterministik iskele üretimini sağlamak.

## 2. Mimari Bileşenler

| Bileşen | Dosya Yolu | Sorumluluk |
|---|---|---|
| **Aktör Şartnamesi** | `docs/actor-contract.md` | Aktör yaşam döngüsü, güvenlik sınırları (SSRF, DoS, timeout), veri yapıları ve 8 adımlı tescil kontrol listesi. |
| **Referans Şablon** | `src/actors/actor.template.ts` | `IActor<T>` uygulayan, SSRF koruması, `allowLocalNetwork`, abort controller, süre telemetrisi ve hata blokları hazır TypeScript iskeleti. |
| **İskele Üreteci (CLI)** | `scripts/scaffold-actor.mjs` | `node scripts/scaffold-actor.mjs <kategori> <ad> "<aciklama>"` komutu ile aktör dosyası, test süiti, JSON örneği üreten ve barellere export ekleyen otomasyon betiği. |
| **NPM Script** | `package.json` (`make:actor`) | CLI betiğini pratik olarak çalıştırma komutu (`npm run make:actor -- <kategori> <ad> "<aciklama>"`). |
| **Birim Testi** | `tests/scaffold-actor.test.ts` | Scaffolding betiğinin argüman doğrulamasını, dosya üretimini ve şablon tutarlılığını test eden test süiti. |

## 3. Uygulama Adımları

1. **Aşama 1**: `docs/actor-contract.md` dosyasının yazılması.
2. **Aşama 2**: `src/actors/actor.template.ts` dosyasının oluşturulması ve derleme kontrolü.
3. **Aşama 3**: `scripts/scaffold-actor.mjs` betiğinin yazılması ve `package.json`'a `make:actor` komutunun eklenmesi.
4. **Aşama 4**: `tests/scaffold-actor.test.ts` entegrasyon testinin eklenmesi.
5. **Aşama 5**: `context/architecture-schema.md` dosyasının güncellenmesi.
6. **Aşama 6**: `npm run verify` (typecheck, lint, test, naming) ile doğrulama.

## 4. Değiştirilmeyecek / Korunacak Bileşenler

* Mevcut 31 aktörün kod yapısı bozulmayacak, geriye dönük uyumluluk %100 korunacak.
* Mevcut 497 testin tamamı regülasyonsuz yeşil kalacak.
* `IActor<T>` ve `ActorTask` çekirdek sözleşmeleri değiştirilmeyecek.
