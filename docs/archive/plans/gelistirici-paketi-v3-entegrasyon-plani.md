# Geliştirici Paketi V3 Entegrasyon Planı (Faz 0)

## Hedef
Google Drive üzerinden temin edilen `Protokol7-Developer-Package-v3.zip` arşivindeki kurumsal mimari şartnameleri, JSON sözleşme şemalarını, SQL başlangıç migrasyonlarını ve kaynak katılım protokolünü, mevcut çalışan sisteme ve canlı DOAJ akışına zarar vermeden `protokol-7` projesine entegre etmek.

## Kapsam ve Güven Kademesi (Trust-Tier)
- **Güven Kademesi:** `Tier 1` (Yeni dosyalar, sözleşme arayüzleri ve kural dokümantasyonu; mevcut çalışan kodlara yıkıcı müdahale yok).
- **Blast Radius:** İzole yeni dizinler (`contracts/`, `docs/architecture-rfcs/`, `infra/migrations/`) ve `.agents/skills/data-ingestion-protocol/SKILL.md` zenginleştirmesi.

## Uygulama Adımları

1. **TASKS.md Güncellemesi (Hipokampüs):**
   - Yeni aktif görevi `TASKS.md`'ye kaydet, DOAJ canlı akışının arka planda devam ettiğini belirt.

2. **Sözleşmelerin (Contracts) Taşınması ve İndekslenmesi:**
   - `contracts/` dizinini oluştur:
     - `contracts/storage.ts`: `StorageRef`, `Capabilities`, `ObjectStore` tip tanımları.
     - `contracts/source-descriptor.schema.json`: JSON Schema (Draft 2020-12) kaynak katılım şeması.
     - `contracts/job.schema.json`: JSON Schema (Draft 2020-12) iş bildirim şeması.
     - `contracts/source-descriptor.example.json`
     - `contracts/field-mapping.example.json`
     - `contracts/connection.example.json`
     - `contracts/job.example.json`
     - `contracts/release.example.json`
     - `contracts/retention.example.json`
     - `contracts/index.ts`: TypeScript tipi dışa aktarımları.
   - `tsconfig.json` ve `biome.json` dosyalarını `contracts/` dizinini kapsayacak şekilde güncelle.

3. **Kurumsal Mimari Şartnamelerinin (RFC) Kalıcı Konumlandırılması:**
   - `docs/architecture-rfcs/` dizinini oluştur:
     - `docs/architecture-rfcs/01-architecture.md`
     - `docs/architecture-rfcs/02-storage-integrations.md`
     - `docs/architecture-rfcs/03-workers-control-plane.md`
     - `docs/architecture-rfcs/04-ai-llm-skills.md`
     - `docs/architecture-rfcs/05-production-runbook.md`
     - `docs/architecture-rfcs/06-backlog-acceptance.md`
     - `docs/architecture-rfcs/07-evidence-decisions.md`
     - `docs/architecture-rfcs/08-connector-permissions.md`
     - `docs/architecture-rfcs/09-raw-retention-deletion.md`
     - `docs/architecture-rfcs/10-methods-formats.md`
     - `docs/architecture-rfcs/11-runtime-directory-tools.md`
     - `docs/architecture-rfcs/12-capacity-failure-matrix.md`
     - `docs/architecture-rfcs/13-source-onboarding-protocol.md`
     - `docs/architecture-rfcs/diagrams/` (01, 04, 09 mmd diyagramları)

4. **Veritabanı Başlangıç Şemalarının (PostgreSQL Migrations) Eklenmesi:**
   - `infra/migrations/` dizinini oluştur:
     - `infra/migrations/001-control-plane.sql`
     - `infra/migrations/002-lease-examples.sql`
     - `infra/migrations/003-operational-extension.sql`

5. **Kaynak Katılım Becerisinin (.agents/skills/data-ingestion-protocol) Zenginleştirilmesi:**
   - `docs/13-source-onboarding-protocol.md` doğrultusunda:
     - `contracts/source-descriptor.schema.json` zorunlu şema doğrulaması adımı,
     - Bütçe kısıtları (`max_requests`, `max_bytes`, `max_seconds`),
     - Telif/hak durumu (`rights_status: approved | pending | denied`) onay kapısı,
     - DNS/SSRF ve atomik cursor kayıt protokolü eklenir.

6. **Mimari Şema ve Doğrulama (Connectome & Verification Pipeline):**
   - `context/architecture-schema.md` dosyasına yeni `contracts/`, `infra/migrations/`, `docs/architecture-rfcs/` bileşenlerini ekle.
   - `npm run verify` (Biome lint, TypeScript check, unit testler, naming discipline) çalıştırıp 6/6 katmanda tam yeşil doğrula.
   - Walkthrough dokümanını `docs/walkthroughs/gelistirici-paketi-v3-entegrasyon-walkthrough.md` olarak kaydet.
