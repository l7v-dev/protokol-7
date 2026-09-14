# AGENTS.md — Prefrontal Korteks (Router)

Bu dosya **protokol-7** projesinde çalışan yapay zeka ajanlarının ana yönlendiricisidir.
Bilerek **kısa** tutulur — her oturumda tam bağlamla yüklenen tek dosya budur.

## Okuma Sırası (Göreve Başlarken)

1. `TASKS.md` — şu an ne yapılıyor, nerede kalınmış (Hipokampüs).
2. Kod değişikliği yapılacaksa → `rules/trust-tiers.md`'den görevin tier'ını belirle (Amigdala).
3. Mimari veya kural sorgusu gerekirse → `npm run memory "<kavram>"` veya `context/` (Korteks).
4. Planlama gerekirse → Antigravity planını ve walkthrough'unu `docs/plans/` altında da sakla.
5. Değişiklik bitmeden önce → `rules/failure-checklist.md` refleks taraması (Bazal Ganglia).
6. Teslim öncesi → `npm run verify` (verification-pipeline).

## Bilişsel Bölgeler

| Bölge | Dosya / Araç | Ne Zaman Açılır |
|---|---|---|
| **Hipokampüs** | `TASKS.md` | Her oturum başında — zorunlu |
| **Amigdala** | `rules/trust-tiers.md` | Kod yazmadan önce (Tier 0-3 blast radius) |
| **Bazal Ganglia** | `rules/failure-checklist.md` | İş bitmeden önce (%79,5 hata önleme) |
| **Loglama Disiplini** | `rules/logging-discipline.md` | Sıfır emoji, standart ASCII loglama |
| **Üst-Biliş** | `rules/metacognition.md` | Döngüye girildiğinde veya 3+ dosyada |
| **Serebellum** | `skills/` | İhtiyaç duyulan teknik prosedürlerde |
| **Korteks** | `context/` | Proje standartları ve mimari sözleşmelerde |
| **Planlama Deposu**| `docs/plans/` | `<gorev-adi>-plani.md` kalıcı depolanır |
| **Doğrulama Deposu**| `docs/walkthroughs/` | `<gorev-adi>-walkthrough.md` kalıcı depolanır |
| **Connectome** | `context/connectome.md` | `npm run connectome` ile üretilir |
| **Arşiv** | `archive/` | `npm run consolidate` ile 5'ten eski işler buraya taşınır |

## Sabit İlkeler
- **Retrieve, don't preload:** Bütün repoyu belleğe doldurma, sadece gereken dosyayı aç.
- Kural (`rules/`) ile beceri (`skills/`) çelişirse **kural kazanır**.
- **Sıfır Emoji:** Hiçbir logda, kod yorumunda veya commit mesajında emoji kullanılamaz.
- **Kalıcı Görev Planları:** Antigravity ile üretilen planlar `docs/plans/<gorev-adi>-plani.md`, walkthrough'lar `docs/walkthroughs/<gorev-adi>-walkthrough.md` olarak saklanır.
