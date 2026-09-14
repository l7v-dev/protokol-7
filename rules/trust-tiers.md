# Trust-Tiers — Güven Kademeleri (Amigdala)

Kaynak: kurumsal ajan mimarileri araştırması (Google/Amazon/Meta pratiği).
Bu dosya ajanın **kendi başına ne kadar ileri gidebileceğinin** sınırını
çizer — patlama yarıçapını (blast radius) prosedürel olarak sınırlar.

Her görev `TASKS.md`'ye yazılırken bir Tier etiketi alır. Ajan kendi
inisiyatifiyle bir üst tier'a geçemez; geçiş için insan onayı gerekir.

| Tier | İzin Verilen Otonomi | Kapsanan Görev Örnekleri | İnsan Denetimi |
|---|---|---|---|
| **0 — Salt Okunur & Keşif** | Dizin tarama, sembol arama, dokümantasyon okuma/sentezleme | `research`, `ask-matt`, mimari analiz, kök neden araştırması | Yok — tam otonom, dosyaya yazma yetkisi yok |
| **1 — Öneri & İzole Taslak** | Yeni dosyada kod yazma, yerel derleme, taslak PR | Yeni modül/bileşen ekleme, yeni endpoint taslağı | Zorunlu — en az 1 insan onayı, doğrudan merge yok |
| **2 — Kısıtlı Otomasyon** | Var olan dosyada değişiklik, test çalıştırma, koşullu merge | Bağımlılık güncelleme, mevcut fonksiyonda bugfix, durum (state) taşıyan modüllerde değişiklik | Regresyon testlerinin %100 geçmesi + 1 insan onayı |
| **3 — Tam Otonom** | Doğrudan değişiklik + otomatik merge | Lint/format düzeltmeleri, ölü kod temizliği, tip hatası düzeltmeleri | Yok — ama telemetri ve geri alma (rollback) zorunlu |

## Sabit Kurallar

- **Güvenlik ve mimari invariant dosyaları her zaman Tier 2'nin üzerine çıkamaz.** Güvenlik kapıları, kimlik doğrulama, `package.json` ve kural dosyaları Tier 3'te otomatik merge edilemez, daima insan gözden geçirir.
- Yeni bir harici paket/bağımlılık eklemek **hiçbir zaman Tier 3 değildir** — bkz. `rules/verification-pipeline.md` §2 (paket halüsinasyonu / slopsquatting riski).
- Bir görev Tier 1'de başlayıp genişliyorsa (yeni dosya → var olan çekirdek dosyaları da etkiliyor), ajan görevi durdurup `TASKS.md`'de tier'ı yükseltir, kendiliğinden ilerlemez.
