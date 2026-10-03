# Geliştirici Paketi V3 Entegrasyon Walkthrough (Faz 0)

## Genel Bakış
Google Drive üzerinden temin edilen `Protokol7-Developer-Package-v3.zip` teslim paketindeki sözleşmeler (`contracts/`), kurumsal mimari şartnameleri (`docs/architecture-rfcs/`), PostgreSQL başlangıç migrasyonları (`infra/migrations/`) ve zenginleştirilmiş kaynak katılım protokolü (`.agents/skills/data-ingestion-protocol/SKILL.md`), projenin mevcut işleyişi ve canlı çalışan DOAJ daemon akışı korunarak entegre edildi.

## Yapılan İşlemler

### 1. Sözleşmeler ve Şemalar (`contracts/`)
- `contracts/storage.ts`: `StorageRef`, `Capabilities`, `ObjectStore` tip arayüzleri taşındı.
- `contracts/source-descriptor.schema.json`: JSON Schema (Draft 2020-12) standart kaynak katılım ve bütçe/hak kontrol şeması eklendi.
- `contracts/job.schema.json`: JSON Schema (Draft 2020-12) asenkron iş bildirim zarfı eklendi.
- `contracts/source-descriptor.example.json`, `contracts/field-mapping.example.json`, `contracts/job.example.json`, `contracts/connection.example.json`, `contracts/release.example.json`, `contracts/retention.example.json` örnekleri dahil edildi.
- `contracts/index.ts`: TypeScript tipi dışa aktarımları (`StorageRef`, `Capabilities`, `ObjectStore`, `SourceDescriptor`, `JobNotification`) oluşturuldu.
- `tsconfig.json` ve `biome.json` dosyaları `contracts/` dizinini kapsayacak şekilde güncellendi.

### 2. Mimari Şartnameler (`docs/architecture-rfcs/`)
Paketteki 13 mimari spesifikasyon belgesi ve Mermaid diyagramları `docs/architecture-rfcs/` altına kalıcı kurumsal referans olarak taşındı:
- `01-architecture.md`
- `02-storage-integrations.md`
- `03-workers-control-plane.md`
- `04-ai-llm-skills.md`
- `05-production-runbook.md`
- `06-backlog-acceptance.md`
- `07-evidence-decisions.md`
- `08-connector-permissions.md`
- `09-raw-retention-deletion.md`
- `10-methods-formats.md`
- `11-runtime-directory-tools.md`
- `12-capacity-failure-matrix.md`
- `13-source-onboarding-protocol.md`
- `diagrams/` (`01-architecture.mmd`, `04-ai-llm-skills.mmd`, `09-retention.mmd`)

### 3. Veritabanı Migrasyonları (`infra/migrations/`)
PostgreSQL başlangıç DDL ve sorgu şablonları taşındı:
- `infra/migrations/001-control-plane.sql`: Temel kontrol düzlemi tabloları (`source`, `crawl_partition`, `document`, `content_object`, `artifact`, `job`, `job_attempt`, `outbox_event`, `dataset_release`).
- `infra/migrations/002-lease-examples.sql`: Atomik satır sahiplenme (`lease_epoch`, `SKIP LOCKED`), heartbeat ve reaper sorguları.
- `infra/migrations/003-operational-extension.sql`: Bağlantı, edinim koşusu, sürüm takibi, hak/kalite denetimleri ve silme planı tabloları.

### 4. Ajan Kaynak Katılım Becerisi (`.agents/skills/data-ingestion-protocol/`)
`.agents/skills/data-ingestion-protocol/SKILL.md` belgesi güncellendi:
- Kaynak tanımlayıcısı (`contracts/source-descriptor.schema.json`) doğrulama adımı eklendi.
- Bütçe kısıtları (`max_requests`, `max_bytes`, `max_seconds`) ve hak denetimi (`rights_status: approved | pending | denied`) zorunlu kılındı.
- `docs/architecture-rfcs/12-capacity-failure-matrix.md` doğrultusunda ağ dayanıklılığı (DNS timeout, NXDOMAIN, SSRF/IP sabitleme, Range doğrulamalı resume) entegre edildi.

### 5. Doğrulama ve Testler
- `tests/contracts.test.ts` test süiti yazıldı (6/6 test yeşil).
- `context/architecture-schema.md` dosyası güncellendi.
- `npm run connectome` çalıştırıldı.
- `npm run verify` ile tüm katmanlar doğrulandı.
- Canlı çalışan DOAJ arka plan daemon'ının (616.000+ kayıt) kesintisiz devam ettiği teyit edildi.
