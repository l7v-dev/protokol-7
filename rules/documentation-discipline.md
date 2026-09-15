# Documentation & Comment Discipline — Dosya Açıklamaları ve Yorum Disiplini

Bu kural, protokol-7 kod tabanındaki tüm dosya başlıkları, fonksiyon/sınıf açıklamaları (JSDoc/TSDoc) ve kod içi satır yorumları için bağlayıcı standarttır.

## 1. Temel İlke: Sıfır Sohbet ve Sıfır Dolgu Dili (Zero Conversational Filler)

Kod içi yorumlar veya dosya başlıkları bir insanla sohbet eder gibi yazılamaz.
Ajanların ya da geliştiricilerin anlatısal, gevşek veya konuşma dili kullanması kesinlikle yasaktır.

### Kesin Olarak Yasaklanan İfadeler:
- "Şimdi burada şunu yapıyoruz..." / "Now we are doing..."
- "Hadi şunu kontrol edelim..." / "Let's check if..."
- "Burada küçük bir numara yapıyoruz..." / "A neat trick here..."
- "Bu fonksiyon sayesinde kolayca hallediyoruz..."
- "Umarım çalışır" / "Umarız hata vermez"
- "Dikkatli olalım burası önemli"
- "Gerektiği için buraya eklendi"

### Kabul Edilen Biçim:
Doğrudan teknik durum, kısıt veya invariant belirtilir:
- `// [INVARIANT] Port degeri 1024-65535 araliginda olmalidir.`
- `// [SIDE-EFFECT] BrowserContext kapanisi bellek kaynaklarini serbest birakir.`
- `// [PERF] O(1) erisim icin Map yapisi tercih edildi.`

---

## 2. Sıfır Pazarlama ve Buzzword Jargonu (Zero Marketing Jargon)

Kod açıklamalarında övgü, süsleme, pazarlama sıfatları ve duygusal abartılar kullanılamaz.

- **Yasaklı Sözcükler:** `smart`, `intelligent`, `next-gen`, `ultra`, `super`, `enhanced`, `optimized`, `seamless`, `powerful`, `ai-powered`, `autonomous`, `robust`, `magical`, `lightning`, `harika`, `mukemmel`, `kusursuz`, `guclu`, `akilli`.
- Yorumlar sistemi övmek için değil, teknik mekanizmayı açıklamak için vardır.

---

## 3. Açıklamalar Yalnızca Önemli ve Teknik Konuları İçerir

Bir yorum yalnızca aşağıdaki 4 durumdan birini karşılıyorsa yazılabilir:

1. **Mimari Invariant'lar ve Sözleşmeler:**
   Sistemin bozulmaması gereken temel kuralı nedir? (Örn: "Domain katmanı altyapı sınıflarını doğrudan import edemez").
2. **Karmaşık Algoritmik Kısıtlar ve Zaman/Bellek Karmaşıklığı:**
   Standart olmayan bir algoritmanın zaman veya alan karmaşıklığı gerekçesi (Örn: "DOM indeksleme sırasında derinlik sınırlandırması").
3. **Beklenmeyen Yan Etkiler ve Çekirdek/OS Davranışları:**
   İşletim sistemi sinyalleri, browser havuzu kapanışları, process ölüm koşulları veya yarış durumları (race conditions).
4. **"Neden" Sorusu (Mimari Niyet):**
   Kodun "nasıl" çalıştığı kodun kendisinden okunur; yorum yalnızca "neden bu alternatif seçildi" sorusunu açıklar.

---

## 4. Aşikar Kod Yorumlama Yasağı (No Redundant Comments)

Kodun kendisinden açıkça anlaşılan işlemler için yorum yazmak bağlam kirliliğidir (context pollution) ve yasaktır.

---

## 5. Doğrulama ve Yaptırım

- `npm run verify` ve `npm run doctor` boru hatları, kod dosyalarında yasaklı sohbet kalıplarını ve pazarlama buzzword'lerini otomatik olarak tarar.
- İhlal tespit edildiğinde derleme ve doğrulama reddedilir (`[FAIL]`).
