# Beceri Seti Temizliği ve Konsolidasyon Walkthrough

## 1. Amaç ve Kapsam
Kullanıcının "Beceri setinde eski olanlar vs var ise temizle karışıklık olmasın" direktifi doğrultusunda, hem proje içi (`.agents/skills/`) hem de global Antigravity ortamındaki (`~/.gemini/config/skills/`) atıl, mükerrer ve bağlam tüketen beceriler elden geçirildi.

## 2. Gerçekleştirilen Eylemler

### A. Proje İçi Beceriler (.agents/skills/ ve skills/)
Eylül 2024'te harici Matt Pocock şablonundan miras kalan ve protokol-7'nin mimarisiyle örtüşmeyen veya yönlendirme amaçlı boş stut niteliğindeki 15 beceri `.agents/skills/` altından `ledger/legacy-skills/` dizinine arşivlendi:
- **Yönlendirme / Boş Stutlar:** `grill-me`, `grill-with-docs`, `implement-spec`, `wait-what`
- **Harici Issue Tracker / Claude Code Bağımlıları:** `to-spec`, `to-tickets`, `triage`, `wayfinder`, `handoff`
- **Genel Şablon Kalıntıları:** `implement`, `improve-codebase-architecture`, `loop-me`, `retro`, `setup-ts-deep-modules`, `to-questionnaire`

Geriye kalan **16 çekirdek ve aktif beceri**:
1. `data-ingestion-protocol` (Veri çekme protokolü ve mimari kural seti)
2. `dbx-management` (SQLite katalogları ve dbx masaüstü entegrasyonu)
3. `naming-discipline` (Sıfır pazarlama jargonu ve saf teknik isimlendirme)
4. `neuro-ergonomic-communication` (Bilişsel yükü azaltan stoik iletişim)
5. `tdd` (Test-driven development)
6. `code-review` (Kod ve şartname inceleme)
7. `codebase-design` (Derin modüller ve sistem sınırları)
8. `diagnosing-bugs` (Hata ayıklama döngüsü)
9. `domain-modeling` (Alan modelleme ve ADR yönetimi)
10. `grilling` (Tasarım ve plan sağlamlaştırma mülakatı)
11. `prototype` (Hızlı prototipleme)
12. `research` (Birincil kaynak araştırması)
13. `resolving-merge-conflicts` (Git çakışma çözümü)
14. `setup-pre-commit` (Husky ve Git kancaları)
15. `wizard` (Otomasyon ve kurulum sihirbazları)
16. `writing-for-agents` (Ajan dokümantasyon teknikleri)

### B. Kural ve Doküman Çapraz Referans Güncellemeleri
- `rules/failure-checklist.md`: `grill-me` ve `wait-what` yerine `skills/grilling` ve üst-biliş (`rules/metacognition.md`) referansı yerleştirildi.
- `rules/task-discipline.md`: `grill-me`, `to-spec` ve `to-tickets` yerine `grilling` ve atomik alt görev bölme kuralı güncellendi.

### C. Global Ortam Çift Kopyalarının Arşivlenmesi
- `~/.gemini/config/skills/` (25 Temmuz tarihli 30 eski kopya) `~/.gemini/config/skills.legacy_backup/` olarak arşivlendi.
- `~/.gemini/skills/` (23 Eylül tarihli eski kopya) `~/.gemini/skills.legacy_backup/` olarak arşivlendi.
- Tüm Google Cloud ve veri becerileri modern eklenti olan `~/.gemini/config/plugins/data-agent-kit-plugin/skills/` üzerinden tekil, temiz ve güncel olarak yüklenmektedir.
- Bu işlem sayesinde prompt'ta 30 becerinin mükerrer enjeksiyonu sonlandırılmış, bağlam bütçesi aşımı (context budget limit exclusion) engellenmiştir.

## 3. Doğrulama Sonuçları
- `npm run lint:naming`: Başarılı.
- `npm run verify`: 6/6 katman başarılı (dosya bütünlüğü, isimlendirme, sıfır emoji, secret denetimi, SCA ve Biome linter 357 dosyada 0 hata).
- `npx tsx --test`: Tüm 35 Developer Package V3 birim/entegrasyon testi 3.4 saniyede hatasız geçti.
- **DOAJ Kesintisiz Akış:** PID `106385` kesintisiz çalışmaya devam etmektedir (790.000+ kayıt işlendi).
