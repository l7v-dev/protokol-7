# Beyin İlhamlı Ajan Çalışma Alanı (Omega-3) Konsolidasyon ve Entegrasyon Planı

Bu plan, projede geliştirilen kurumsal araştırma raporları ve bilişsel mimari (Prefrontal Korteks, Hipokampüs, Amigdala, Bazal Ganglia, Serebellum, Korteks, Connectome, Arşiv) tasarımını fiziksel dosya sistemiyle birebir uyumlu, deterministik ve ajanlar tarafından eksiksiz tüketilebilir hale getirmeyi hedefler.

## User Review Required

> [!IMPORTANT]
> - `frontal/` altındaki `context/` ve `skills/` klasörleri doğrudan repo kök dizinine (`context/` ve `skills/`) taşınacaktır. Böylece `AGENTS.md` ve `TASKS.md` içindeki tüm yollar hatasız çalışacaktır.
> - Kökteki `README.md` aslında `archive/` klasörünün dokümanı olduğundan `archive/README.md` altına taşınacak; repo köküne bu bilişsel mimariyi ve araştırmaları anlatan yeni bir ana `README.md` yazılacaktır.
> - Duplicate olan `AGENTS(1).md` ve `failure-checklist(1).md` dosyaları temizlenecektir.
> - `rules/` klasörü oluşturularak amigdala, bazal ganglia, üst-biliş ve doğrulama dosyaları buraya toplanacaktır.

## Proposed Changes

---

### 1. Dizin Hiyerarşisi ve Dosya Hizalaması (Path Alignment)

`AGENTS.md` ve `TASKS.md`'nin referans verdiği ancak kökte dağınık veya eksik duran dizin yapısı kurulacaktır:

#### [NEW] `rules/`
- [rules/trust-tiers.md](file:///home/l7v/l7v-dev/omega-3/rules/trust-tiers.md) (Amigdala / Blast Radius)
- [rules/failure-checklist.md](file:///home/l7v/l7v-dev/omega-3/rules/failure-checklist.md) (Bazal Ganglia / Refleks Hata Kontrolü)
- [rules/metacognition.md](file:///home/l7v/l7v-dev/omega-3/rules/metacognition.md) (Prefrontal Üst-Biliş & Döngü Kırıcı)
- [rules/verification-pipeline.md](file:///home/l7v/l7v-dev/omega-3/rules/verification-pipeline.md) (Deterministik 5 Katmanlı Doğrulama)

#### [NEW] `scripts/`
- [scripts/generate-connectome.mjs](file:///home/l7v/l7v-dev/omega-3/scripts/generate-connectome.mjs) (Kök dizindeki script buraya taşınacak ve proje yokluğunda çökmesini engelleyen güvenli mekanizma eklenecek)
- [scripts/sca-check.mjs](file:///home/l7v/l7v-dev/omega-3/scripts/sca-check.mjs) (Paket halüsinasyonunu `npm view` ile denetleyen hafif yardımcı script)

#### [MOVE] `context/` ve `skills/`
- `frontal/context/` -> `context/` (Korteks: proje standartları, mimari sözleşmeler, connectome)
- `frontal/skills/` -> `skills/` (Serebellum: Matt Pocock becerileri, naming-discipline, neuro-ergonomic communication vb.)

#### [NEW] `archive/`
- [archive/README.md](file:///home/l7v/l7v-dev/omega-3/archive/README.md) (Mevcut kök README.md buraya taşınacak)
- [archive/index.jsonl](file:///home/l7v/l7v-dev/omega-3/archive/index.jsonl) (Oturum özetlerinin JSONL formatında tutulduğu tek giriş noktası)
- [archive/sessions/](file:///home/l7v/l7v-dev/omega-3/archive/sessions/) (Gzip oturum transkript dizini)

#### [NEW] `docs/adr/`
- [docs/adr/0001-brain-inspired-agent-architecture.md](file:///home/l7v/l7v-dev/omega-3/docs/adr/0001-brain-inspired-agent-architecture.md) (Epizodik bellek: Neden beyin ilhamlı mimari ve katmanlı context seçildi?)

#### [DELETE] Artık / Kopya Dosyalar
- `AGENTS(1).md`
- `failure-checklist(1).md`
- Kökteki taşınan `.md` dosyalarının kök kopyaları

---

### 2. Router ve Dokümantasyon İyileştirmesi

#### [MODIFY] [AGENTS.md](file:///home/l7v/l7v-dev/omega-3/AGENTS.md)
- Dosya yollarının yeni dizin yapısıyla (`rules/`, `context/`, `skills/`, `scripts/`, `archive/`) %100 örtüştüğünün teyidi.
- Router ilkelerinin ve çalışma adımlarının netleştirilmesi.

#### [NEW] [README.md](file:///home/l7v/l7v-dev/omega-3/README.md)
- Projenin ana manifestosu:
  - Araştırma temelleri (SWE-bench Verified %79.5 hata analizi, Slopsquatting, Monorepo sembol grafları, DORA metrikleri).
  - Beyin ilhamlı mimari haritası (Prefrontal, Hipokampüs, Bazal Ganglia, Amigdala, Serebellum, Korteks, Connectome, Arşiv).
  - Context Lifecycle v1.0 işleyiş şeması.
  - Ajanların ve insan geliştiricilerin bu repoyu nasıl kullanacağı.

#### [MODIFY] [TASKS.md](file:///home/l7v/l7v-dev/omega-3/TASKS.md)
- Aktif ve tamamlanan görevlerin yeni duruma göre güncellenmesi (Faz 3 entegrasyonu tamamlandı durumuna getirilmesi).

---

## Verification Plan

### Automated Tests & Checks
- Dizin yapısı bütünlük kontrolü: `ls -la rules/ context/ skills/ scripts/ archive/ docs/adr/`
- Dosya bağlantı kontrolü: `AGENTS.md` ve `TASKS.md` içinde referans verilen tüm yolların dosya sisteminde var olduğunu doğrulama.
- `scripts/generate-connectome.mjs` çalıştırma testi: `node scripts/generate-connectome.mjs` komutunun hatasız çalışıp çalışmadığını test etme.
- İsimlendirme ve standart kontrolü: `skills/naming-discipline` kurallarına aykırı pazarlama terimi bulunmadığını doğrulama.

### Manual Verification
- Ajan çalışma döngüsünün (Boot -> Orient -> Guardrail -> On-Demand -> Execute -> Basal Reflex -> Verification -> Consolidate) simülasyonu.
