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
| **Serebellum (dev)** | `.agents/skills/dev/` | Kod geliştirme, hata teşhisi ve incelemede |
| **Serebellum (ops)** | `.agents/skills/ops/` | Veri toplama, kalite, provenance ve yayımlamada |
| **Korteks** | `context/` | Proje standartları ve mimari sözleşmelerde |
| **Planlama Deposu**| `docs/plans/` | `<gorev-adi>-plani.md` kalıcı depolanır |
| **Doğrulama Deposu**| `docs/walkthroughs/` | `<gorev-adi>-walkthrough.md` kalıcı depolanır |
| **Connectome** | `context/connectome.md` | `npm run connectome` ile üretilir |
| **Defter (Ledger)** | `ledger/` | `npm run consolidate` ile 3-5'ten eski işler buraya taşınır |

## Sabit İlkeler
- **Retrieve, don't preload:** Bütün repoyu belleğe doldurma, sadece gereken dosyayı aç.
- Kural (`rules/`) ile beceri (`skills/`) çelişirse **kural kazanır**.
- **Sıfır Emoji:** Hiçbir logda, kod yorumunda veya commit mesajında emoji kullanılamaz.
- **Kalıcı Görev Planları:** Antigravity ile üretilen planlar `docs/plans/<gorev-adi>-plani.md`, walkthrough'lar `docs/walkthroughs/<gorev-adi>-walkthrough.md` olarak saklanır.
- **Dürüst Mimari Danışmanlık ve Erken Uyarı:** Kullanıcı anti-pattern, katman kirliliği (ör. aktör içine transport/mcp gömme) veya verimsiz/hatalı bir yaklaşım önerdiğinde, ajanın körü körüne uygulaması kesinlikle yasaktır. Ajan derhal durup teknik riskleri açıkça belirtmeli, kullanıcıyı uyarmalı ve temiz standardı savunmalıdır.

## Mimari Sınırlar

- **Agent:** Görev kapsamındaki kararları verir; ActorRegistry aktör çözümlemesini, WorkerPool yürütmeyi sağlar.
- **Skill:** Sürüm ve girdi/çıktı sözleşmesiyle prosedürü tanımlar; araç yetkisi sağlamaz.
- **Tool:** Aktör metodu veya processor ile işlemi gerçekleştirir.
- **Connector:** `src/pipeline/connectors/` ve `src/pipeline/storage/` üzerinden dış sisteme erişir.
- **Workflow:** Pipeline yapılandırması ve ScheduleBroker ile adım sırasını yürütür.

`skills/` kök symlink'i korunur. Ops becerisinin çalışma zamanı bağımlılıkları eksikse sonuç `blocked` olur; planlanan tablolar veya release kapıları uygulanmış kabul edilmez.
