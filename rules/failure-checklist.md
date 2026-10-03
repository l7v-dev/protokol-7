# Failure Checklist — Refleks Hata Kontrolü (Bazal Ganglia)

Kaynak: SWE-bench Verified trajektori analizleri. Ampirik olarak ajan
hatalarının **%79,5'i** ilk 4 kategoriden çıkıyor — bu yüzden checklist
onları en üste koyuyor. Bu dosya bir görev **bitmeden önce** (Tier 1+),
prosedürel bir refleks gibi taranır — muhakeme değil, kontrol listesidir.

## Bilişsel önyargı karşılıkları (neden bu hatalar sistematik)

Bu maddelerin rastgele bir liste olmadığını, insan bilişindeki bilinen
önyargılarla birebir eşleştiğini bilmek, ajanın (ve inceleyen insanın)
"bu neden tekrar tekrar oluyor" sorusuna cevap verir:

| Bulgu | Karşılık gelen bilişsel önyargı | Neden önemli |
|---|---|---|
| Yanlış öncül (%30,7) | **Çapa etkisi (anchoring)** | İlk varsayım düzeltilmeden sonrakilerin temeli olur |
| Sinyal ihmali (%4,1) | **Doğrulama yanlılığı (confirmation bias)** | Çürüten kanıt yerine ilk hipotezi destekleyen okuma tercih edilir |
| Aynı yaklaşımı ~%65 tekrarlama | **Batık maliyet safsatası (sunk cost)** | "Bu kadar ilerledim, terk edemem" mantığı — ajanda da ölçülmüş |
| Güvenlik açıklı kodda üst düzey güven | **Kalibrasyon açığı (overconfidence / Dunning-Kruger benzeri)** | İfade edilen güven, gerçek doğruluğu yansıtmıyor — bu yüzden hiçbir zaman ajanın kendi güven beyanına güvenilmez, her zaman dış araçla doğrulanır |

Not: Buraya bilinçli olarak Maslow/Freud tarzı derin motivasyon teorileri
**eklenmedi** — hiçbirinin ölçülmüş bir ajan hatasıyla karşılığı yok, dekoratif
kalırdı. Yukarıdaki dört madde, gözlemlenmiş veriyle birebir eşleştiği için var.

## Kod değişikliğinden önce (erken eylem riskini kapat)

- [ ] **Yanlış öncül / çapa etkisi (%30,7):** Dosya yapısı / mevcut davranış hakkındaki varsayımımı doğruladım mı, yoksa görmeden mi varsaydım?
- [ ] **Bilgi eksikliği (%24,0):** Kullandığım API/kütüphane fonksiyonunun imzasını gerçekten okudum mu, yoksa örüntüden mi tahmin ettim?
- [ ] **Erken eylem (%3,7):** Ortamı (dosya var mı, test suite nasıl çalışıyor) kontrol etmeden düzenlemeye başlamadım mı?
- [ ] **ACI / Pencereli erişim kuralı:** Dosya 100 satırdan uzunsa tümünü tek seferde okumak yerine pencereli okuma kullandım mı? (SWE-agent ACI standardı)
- [ ] **Format uygunluğu ve NL-to-Format:** Girdi/çıktı formatı seçimi `context/format-standards.md` matrisine (MD/YAML/JSON/XML) uygun mu? Yapılandırılmış çıktılarda doğrudan katı JSON zorlamak yerine iki aşamalı çıkarım gözetildi mi?

## Kod değişikliği sırasında

- [ ] **Şartname ihmali (%14,9):** Görevde açıkça yazan bir kısıt/format/kural var mıydı ve onu atladım mı?
- [ ] **Bağımlılık halüsinasyonu:** Eklediğim her paket adını `npm view <paket>` ile gerçekten var olduğunu ve güvenilir indirme sayısına sahip olduğunu doğruladım mı? (bkz. `verification-pipeline.md` §2)
- [ ] **Mimari kayma:** Bu değişiklik `architecture-context.md`'deki katman sınırlarını (server → registry → actor) ihlal ediyor mu?
- [ ] **Eşzamanlılık körlüğü:** `BrowserPool`, `BrowserSessionManager` gibi paylaşılan durum taşıyan modüllere dokunuyorsam, race condition ihtimalini düşündüm mü — yoksa metni sırayla mı okudum?
- [ ] **Atomik yama kuralı:** Dosyayı baştan yazmak (full rewrite) yerine aralık tabanlı atomik düzenleme (`replace_file_content`) uyguladım mı?
- [ ] **Yorum ve açıklama disiplini:** Kod içi yorumlarda veya dosya başlıklarında sohbet dili ("şimdi şunu yapıyoruz"), dolgu veya pazarlama jargonu kullanılmadı; yalnızca teknik invariant ve kısıtlar yazıldı mı? (bkz. `rules/documentation-discipline.md`)
- [ ] **Ajan baskısı ve normatif sapma ($W / C_{rem}$):** Çevresel kısıtlar ve azalan bağlam penceresi karşısında kuralları esnetme veya var olmayan araç/parametre uydurma (enstrümantal halüsinasyon) eğilimi başladı mı?

## Kod değişikliğinden sonra (test aşırı uyumunu kapat)

- [ ] **Çıktı yanlış okuma (%4,4):** Test/derleyici çıktısını gerçekten okudum mu, yoksa "muhtemelen geçti" mi varsaydım?
- [ ] **Sinyal ihmali / doğrulama yanlılığı (%4,1):** Bir test/derleme beni açıkça yalanladıysa, ilk planımı terk edip yeniden mi değerlendirdim?
- [ ] **İçsel öz-düzeltme yanılsaması (Huang et al. 2024):** Harici bir doğrulayıcı (linter/compiler/test) olmadan "aklımca kontrol ettim, doğru" diyerek mi karar verdim, yoksa deterministik bir oracle çıktısına mı dayandım?
- [ ] **Sessiz arıza / entropi birikimi (E = ∑ δ_i):** Her adım 200 dönse bile kümülatif sapma oldu mu; uçtan uca kabul kriteri ve biçimsel şema tam doğrulandı mı?
- [ ] **Totolojik test:** Yazdığım test, şartnameden bağımsız bir beklenen değeri mi kontrol ediyor, yoksa kendi ürettiğim kodun çıktısını mı doğrudan `assert`liyor?
- [ ] **Sahte başarı (reward hacking):** Test dosyasını "geçsin diye" değiştirmedim, `git log`/`git show` ile geçmişten hazır bir çözüm çekmedim.

## Döngü tespiti (batık maliyet safsatası)

Aynı yaklaşımı 2. kez sözdizimsel varyasyonla deniyorsam **dur** — bu,
ajan trajektorilerinin ~%65'inde görülen "bilişsel kilitlenme" belirtisidir
ve insan psikolojisindeki batık maliyet safsatasının doğrudan karşılığıdır:
"bu kadar zaman harcadım, bırakamam" mantığı ajanı da yanlış yönde tutar.
Planı terk et, `skills/grilling` veya üst-biliş (`rules/metacognition.md`) ile durumu yeniden çerçevele.

- [ ] **Epipleksite ve Duraklama İndeksi:** Harcanan jeton/araç sayısına rağmen çalışma alanında doğrulanabilir durum farkı (`git diff`) 3 adım boyunca sıfır kaldıysa yürütmeyi derhal durdur; döngüyü kır ve üst bilişsel değerlendirme (`rules/metacognition.md`) başlat.
