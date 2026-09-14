---
name: naming-discipline
description: Kod, dosya, klasör, sınıf, fonksiyon, değişken, commit veya PR adı üretirken ya da mevcut isimleri incelerken kullan. Pazarlama dilinden (smart, intelligent, advanced, next-gen, ultra, super, enhanced, optimized, seamless, powerful, ai-powered, autonomous, robust vb.) arındırılmış, tamamen teknik/mühendis odaklı isimlendirme dayatır. Kullanıcı açıkça istemese bile — her kod üretimi, dosya/klasör oluşturma, sınıf/fonksiyon adlandırma, refactor, code review veya commit mesajı yazma görevinde MUTLAKA bu skill'e bak ve önerilen isimleri bu kurallara göre süz. "isimlendirme", "naming convention", "dosya adı", "bu kod için isim öner" gibi ifadelerde de tetiklenmeli.
---

# Naming Discipline — Pazarlama Dilinden Arındırılmış İsimlendirme

Amaç: Kod tabanındaki her isim (dosya, klasör, sınıf, fonksiyon, değişken, repo, commit,
PR başlığı) yalnızca **teknik olarak ne yaptığını** anlatsın; nasıl hissettirdiğini,
ne kadar iyi olduğunu ya da pazarlama vaadini değil.

LLM'ler eğitim verisinde pazarlama diliyle kirlenmiş isimlere (`SmartCache`,
`UltraFastRouter`, `NextGenValidator`) çok maruz kaldığı için, açıkça engellenmediği
sürece bu kalıba kayar. Bu skill o kaymayı önlemek için var.

## Kullanım akışı

1. Bir isim üretmeden ÖNCE (dosya oluşturma, sınıf/fonksiyon tanımlama, klasör
   yapısı kurma, commit/PR başlığı yazma) `references/banned-words.md` içindeki
   yasaklı liste ile aday ismi zihinsel olarak kontrol et.
2. Aday isim listeye takılıyorsa veya "bu ismi silip yerine kodun tek cümlelik
   teknik açıklamasını koysam aynı bilgiyi verir mi?" testinden geçemiyorsa,
   `references/rewrite-patterns.md` içindeki kalıplardan uygun olanı kullanarak
   yeniden yaz.
3. Mevcut bir kod tabanını incelerken (code review, refactor, "bu proje neden
   böyle isimlendirilmiş" gibi görevlerde), `scripts/check-naming.sh` betiğini
   çalıştırarak ihlalleri toplu tara — tek tek dosya okumaya gerek yok.
4. Kullanıcı bunu bir projeye kalıcı olarak yerleştirmek isterse (CI gate,
   pre-commit hook, agent steering dosyası), `references/enforcement.md`'ye bak.

Sessizce arka planda uygula — kullanıcıya "naming-discipline skill'ine baktım"
diye anlatma, doğrudan temiz ismi üret.

## Hızlı test (tek cümle)

> İsmi kodun bir cümlelik teknik açıklamasıyla değiştirsem bilgi kaybı olur mu?

Olmuyorsa isim zaten pazarlama katmanı taşıyordu — at.

## Teknik Önemi Olmayan İfadelerin Reddi (Zero Fluff)

Markdown dosyaları, kod açıklamaları veya commit mesajlarında şablon geçmişi ("X şablonu üzerine kurulmuştur"), genel geçer pazarlama girişleri veya teknik işlevi olmayan dolgu cümleler kesinlikle yazılamaz. Her cümle doğrudan bir teknik mekanizmayı, protokolü, veri yapısını, arayüzü, girdi/çıktıyı veya mimari sınırı belgelemelidir.

## Referans dosyaları

- `references/banned-words.md` — yasaklı kelime kategorileri + gerekçe
- `references/rewrite-patterns.md` — kötü→iyi isim kalıpları, çoklu örnek
- `references/enforcement.md` — CI/pre-commit/agent-steering'e nasıl gömülür
- `scripts/check-naming.sh` — bir dizini/diff'i yasaklı kelimelere karşı tarayan grep betiği
