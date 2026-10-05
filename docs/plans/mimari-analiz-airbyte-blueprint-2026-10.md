# Protokol-7: Tam Kapsamlı Mimari Analiz ve Yol Haritası

**Tarih:** Ekim 2026
**Revizyon:** v4 — Araştırma entegrasyonu, stack kararları, ADR-formatında gerekçeler eklendi.
**Kapsam:** Airbyte CDK + Blueprint + araştırma bulguları ile projenin gerçek durumu karşılaştırması.
Her karar ALINAN / ALINMAYAN / ERTELENEN olarak sınıflandırıldı ve gerekçelendirildi.

---

## 0. Temel Mimari Model (Araştırma Kararı)

Araştırmanın özü doğru ve protokol-7'nin mevcut yapısı bunu zaten uyguluyor. Eksik parçalar var.

```
SOURCE
  ↓  [source-descriptor.schema.json — source_id, method, rights, budget]
INGESTION RUN
  ↓  [actor_runs tablosu — run_id, actor_name, started_at]
RAW ARTIFACT
  ↓  [storage_replicas — raw_artifact_id, sha256, uri]    ← YAZILMIYOR (boşluk)
TRANSFORMATION RUN
  ↓  [pipeline_executions — execution_id, pipeline_name]
CURATED ARTIFACT
  ↓  [dataset_shards — shard_id, sha256_hash, record_count]
DATASET VERSION
  ↓  [dataset_snapshots — snapshot_id, version, manifest_json]
TRAINING / RAG / EVALUATION
```

**Yanında akan metadata (şu an ne var, ne eksik):**

| Alan | Şu An | Eksik |
|---|---|---|
| run_id | actor_runs.run_id ✓ | pipeline_run_manifests tablosu |
| trace_id | YOK | otel_log_events + actor_runs kolonu |
| source_id | source-descriptor ✓ | actor_runs'a foreign key yok |
| document_id | YOK (SHA-256 canonical) | document_provenance tablosu |
| dataset_id | datasets tablosu ✓ | — |
| dataset_version | dataset_snapshots.version ✓ | release gates tablosu |
| git_commit | YOK | pipeline_run_manifests.git_commit |
| config_hash | YOK | pipeline_run_manifests.config_sha256 |
| schema_version | YOK | manifest.v1 alanı |
| agent_id | actor_runs.actor_name (kısmi) | skill_id, skill_sha256 |
| parent_run_id | YOK | pipeline_run_manifests |
| checksums | dataset_shards.sha256_hash ✓ | document seviyesinde yok |
| license | datasets.license_group ✓ | document_provenance.rights_status |
| provenance | YOK | document_occurrences tablosu |
| quality metrics | quality-filter.ts ✓ | kayıt seviyesinde Parquet kolonu yok |

---

## 1. Güvenlik Denetimi — Temiz

```
token.json       → .gitignore'da, hiç commit'e girmemiş ✓
credentials.json → .gitignore'da, hiç commit'e girmemiş ✓
.env             → .gitignore'da ✓
skills           → root'ta symlink → .agents/skills/ (bilinçli tasarım, koru) ✓
```

---

## 2. Git Temizliği

### 2.1 Branch Envanteri

27 local branch var, tamamı main'e merge edilmiş, silinmemiş.

```bash
# Aşama 1 — Tüm merged feature/refactor branch'leri sil
git branch -d \
  refactor/api-layer-rename \
  refactor/headless-core-consolidation \
  feature/mcp-http-transport \
  feature/pipeline-orchestrator \
  feature/core-sqlite-registry \
  feature/governance-skills-and-context \
  feature/document-ocr-archive \
  feature/book-periodical-extractor \
  feature/corpus-deep-reasoning-actors \
  feature/corpus-developer-knowledge-actors \
  feature/corpus-formal-logic-actors \
  feature/corpus-legal-patent-actors \
  feature/corpus-open-textbooks-actors \
  feature/corpus-classical-heritage-actors \
  feature/corpus-wikimedia-sisters \
  feature/enterprise-dataset-actors \
  feature/github-actions-wikipedia-etl \
  feature/modular-data-ingestion-architecture \
  feature/pubmed-corpus-and-pipeline \
  feature/biorxiv-corpus-and-pipeline \
  feature/doaj-corpus-and-pipeline \
  feature/dergipark-corpus-and-pipeline \
  feature/control-plane-v3-integration \
  feature/aperta-and-binance-vision-pipelines \
  feature/aperta-multiformat-ingestion \
  feature/binance-all-symbols-pipeline

# Aşama 2 — Remote tracking temizliği
git remote prune origin

# Aşama 3 — Remote'dan da sil (yukarıdaki liste ile)
git push origin --delete <branch-listesi>

# Aşama 4 — Object temizliği
git gc --prune=now

# KORU: main, legacy/monolith-initial
```

### 2.2 Uncommitted Dosyalar — Hemen Commit

```bash
echo "ledger/telemetry.jsonl" >> .gitignore

git add .gitignore TASKS.md \
  docs/plans/huggingface-veri-toplama-plani.md \
  docs/plans/mimari-analiz-airbyte-blueprint-2026-10.md \
  docs/walkthroughs/huggingface-veri-toplama-walkthrough.md \
  pipelines/snapshot/huggingface/

git commit -m "docs(memory): add huggingface pipeline artifacts and architecture analysis v4"
```

### 2.3 Yeni Branch Stratejisi

```
main        ← production-ready, her release tag'lı (v1.x.x)
develop     ← aktif geliştirme birleşim noktası
feature/*   ← yeni özellik
fix/*       ← hata düzeltme
chore/*     ← bakım, temizlik, dokümantasyon
```

---

## 3. Doküman Arşivleme

85 plan + 87 walkthrough tamamlanmış görevlere ait.

```bash
mkdir -p docs/archive/plans docs/archive/walkthroughs

# Aktif kalanlar hariç hepsini arşive taşı
find docs/plans -name "*.md" \
  ! -name "mimari-analiz-airbyte-blueprint-2026-10.md" \
  ! -name "huggingface-veri-toplama-plani.md" \
  -exec mv {} docs/archive/plans/ \;

find docs/walkthroughs -name "*.md" \
  ! -name "huggingface-veri-toplama-walkthrough.md" \
  -exec mv {} docs/archive/walkthroughs/ \;

git add docs/archive/ docs/plans/ docs/walkthroughs/
git commit -m "chore(docs): archive 170 completed task documents"
```

**GEMINI.md:** Eski bir agent kuralları dosyası — eski kural seti içeriyor, artık AGENTS.md var.
Arşive taşı: `mv GEMINI.md docs/archive/`

**scratch/:** .gitignore'da ama boş. Koru, zaten etki yok.

---

## 4. DB Şema Analizi

### 4.1 Mevcut 9 Tablo — Durum

| Tablo | Durum | Not |
|---|---|---|
| datasets | Saglam | license_group CHECK kısıtı var |
| actor_runs | Saglam, genişletilecek | trace_id + span_id kolonu eklenecek |
| actor_run_logs | Saglam | — |
| pipeline_executions | Saglam | — |
| scheduled_jobs | Saglam | fail_count, cron recovery var |
| dataset_shards | Saglam, genişletilecek | pii_status + rights_status kolonu |
| storage_replicas | Saglam | PENDING/UPLOADING/VERIFIED/FAILED |
| verification_audit_ledger | Saglam | raw_purged lifecycle var |
| dataset_snapshots | Saglam, genişletilecek | release_state + run_id + trace_id |

### 4.2 Eklenecek 5 Tablo + 4 Alter + Index'ler

Tüm DDL `context/schema.sql`'e eklenecek, `infra/migrations/` altına migration dosyası yazılacak.

```sql
-- ================================================================
-- MIGRATION 0002: Blueprint provenance + OTel + release gates
-- ================================================================

-- Tablo 10: Pipeline Run Manifests (Blueprint manifest.v1 uyumlu)
CREATE TABLE IF NOT EXISTS pipeline_run_manifests (
    manifest_id     TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL UNIQUE,
    parent_run_id   TEXT,
    trace_id        TEXT NOT NULL,
    pipeline        TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT NOT NULL CHECK(status IN ('success','partial','failed','aborted')),
    agent_id        TEXT NOT NULL,
    agent_version   TEXT NOT NULL,
    skill_id        TEXT,
    skill_version   TEXT,
    skill_sha256    TEXT,
    git_commit      TEXT,
    dependency_lock_sha256 TEXT,
    config_sha256   TEXT NOT NULL,
    counts_json     TEXT NOT NULL DEFAULT '{}',
    quality_json    TEXT NOT NULL DEFAULT '{}',
    checkpoint_committed INTEGER NOT NULL DEFAULT 0,
    errors_json     TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL
);

-- Tablo 11: Document Provenance (per-record, document.v1 uyumlu)
CREATE TABLE IF NOT EXISTS document_provenance (
    document_id             TEXT PRIMARY KEY,
    canonicalization_version TEXT NOT NULL DEFAULT 'nfc-lf-strip-v1',
    language                TEXT NOT NULL,
    pii_status              TEXT NOT NULL DEFAULT 'unchecked'
        CHECK(pii_status IN ('unchecked','clear','redacted','quarantined')),
    split                   TEXT NOT NULL DEFAULT 'unassigned'
        CHECK(split IN ('train','validation','test','unassigned')),
    rights_license          TEXT,
    rights_evidence_uri     TEXT,
    rights_reviewed_at      TEXT,
    rights_allowed_purposes TEXT,
    rights_status           TEXT NOT NULL DEFAULT 'unknown'
        CHECK(rights_status IN ('approved','unknown','blocked')),
    created_at              TEXT NOT NULL
);

-- Tablo 12: Document Occurrences (çok-kaynaklu provenance)
CREATE TABLE IF NOT EXISTS document_occurrences (
    occurrence_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id      TEXT NOT NULL
        REFERENCES document_provenance(document_id) ON DELETE CASCADE,
    source_id        TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    source_uri       TEXT NOT NULL,
    acquired_at      TEXT NOT NULL,
    raw_artifact_id  TEXT NOT NULL
);

-- Tablo 13: Dataset Release Gates
CREATE TABLE IF NOT EXISTS dataset_release_gates (
    gate_id           TEXT PRIMARY KEY,
    snapshot_id       TEXT NOT NULL
        REFERENCES dataset_snapshots(snapshot_id) ON DELETE CASCADE,
    schema_gate       INTEGER NOT NULL DEFAULT 0 CHECK(schema_gate IN (0,1)),
    quality_gate      INTEGER NOT NULL DEFAULT 0 CHECK(quality_gate IN (0,1)),
    privacy_gate      INTEGER NOT NULL DEFAULT 0 CHECK(privacy_gate IN (0,1)),
    contamination_gate INTEGER NOT NULL DEFAULT 0 CHECK(contamination_gate IN (0,1)),
    rights_gate       INTEGER NOT NULL DEFAULT 0 CHECK(rights_gate IN (0,1)),
    release_state     TEXT NOT NULL DEFAULT 'candidate'
        CHECK(release_state IN ('candidate','released','withdrawn')),
    reviewed_by       TEXT,
    reviewed_at       TEXT,
    created_at        TEXT NOT NULL
);

-- Tablo 14: OTel Structured Log Events (log-event.v1 uyumlu)
CREATE TABLE IF NOT EXISTS otel_log_events (
    event_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp        TEXT NOT NULL,
    observed_timestamp TEXT NOT NULL,
    event_name       TEXT NOT NULL,
    severity_text    TEXT NOT NULL CHECK(severity_text IN ('DEBUG','INFO','WARN','ERROR')),
    severity_number  INTEGER NOT NULL CHECK(severity_number IN (5,9,13,17)),
    body             TEXT NOT NULL,
    trace_id         TEXT NOT NULL,
    span_id          TEXT NOT NULL,
    service_name     TEXT NOT NULL,
    service_version  TEXT NOT NULL,
    deployment_env   TEXT NOT NULL DEFAULT 'development',
    blueprint_run_id    TEXT,
    blueprint_agent_id  TEXT,
    blueprint_skill_id  TEXT,
    blueprint_status    TEXT,
    blueprint_duration_ms INTEGER
);

-- Tablo 15: Source Verification Evidence
CREATE TABLE IF NOT EXISTS source_verification_evidence (
    evidence_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id          TEXT NOT NULL,
    verification_level TEXT NOT NULL DEFAULT 'not_checked'
        CHECK(verification_level IN
              ('not_checked','index_evidence','page_fetched',
               'docs_inspected','sample_tested','downloaded')),
    uri                TEXT NOT NULL,
    checked_at         TEXT NOT NULL,
    finding            TEXT NOT NULL
);

-- Mevcut tablolara yeni kolonlar
ALTER TABLE actor_runs     ADD COLUMN trace_id TEXT;
ALTER TABLE actor_runs     ADD COLUMN span_id  TEXT;
ALTER TABLE dataset_snapshots ADD COLUMN release_state TEXT DEFAULT 'candidate';
ALTER TABLE dataset_snapshots ADD COLUMN run_id TEXT;
ALTER TABLE dataset_snapshots ADD COLUMN trace_id TEXT;
ALTER TABLE dataset_snapshots ADD COLUMN git_commit TEXT;
ALTER TABLE dataset_shards    ADD COLUMN pii_status TEXT DEFAULT 'unchecked';
ALTER TABLE dataset_shards    ADD COLUMN rights_status TEXT DEFAULT 'unknown';

-- Yeni index'ler
CREATE INDEX IF NOT EXISTS idx_doc_prov_lang ON document_provenance(language);
CREATE INDEX IF NOT EXISTS idx_doc_prov_pii  ON document_provenance(pii_status);
CREATE INDEX IF NOT EXISTS idx_doc_occ_source ON document_occurrences(source_id);
CREATE INDEX IF NOT EXISTS idx_otel_trace    ON otel_log_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_otel_sev      ON otel_log_events(severity_text);
CREATE INDEX IF NOT EXISTS idx_gates_snap    ON dataset_release_gates(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_manifests_run ON pipeline_run_manifests(run_id);
```

---

## 5. API Katmanı

### 5.1 Mevcut Endpoint'ler — Sağlam

Tüm mevcut router'lar (Store, Pipeline, Dataset, Job, Vault, Control) düzgün çalışıyor. Dokunma.

### 5.2 Eklenecek Endpoint'ler

| Endpoint | Açıklama | Öncelik |
|---|---|---|
| `GET /api/v1/datasets/:name/gates` | Release kapı durumu | ORTA |
| `POST /api/v1/datasets/:name/release` | Kapılar geçildi → state=released | ORTA |
| `GET /api/v1/lineage/:run_id` | Run + artifact provenance zinciri | ORTA |
| `GET /api/v1/sources/:id/evidence` | Kaynak doğrulama kanıtları | DUSUK |

### 5.3 OpenAPI Spec

`src/api/openapi-spec.ts`'e yeni endpoint'ler + genişletilmiş response tipleri eklenecek.

---

## 6. Stack Kararları — ALINAN / ALINMAYAN / ERTELENEN

Araştırma çok kapsamlı bir stack öneriyor. Her birini projenin gerçek ölçeği ve ihtiyacı ile karşılaştırarak karar verdim.

### 6.1 ALINAN — Hemen veya kısa vadede

| Araştırma Önerisi | Karar | Gerekçe |
|---|---|---|
| Run manifest (run_id, trace_id, git_commit, gates) | **ALINIR** | Blueprint + araştırma tam örtüşüyor. DB şeması + DatasetPublisher genişletmesi. |
| document_id = SHA256(canonical_text) | **ALINIR** | TextNormalizer zaten SHA-256 hesaplıyor ama kayıt etmiyor. Minimal değişiklik. |
| document_provenance + occurrences tabloları | **ALINIR** | Multi-source provenance zaten ihtiyaç var (aynı metin birden fazla kaynakta). |
| Structured log events (OTel format) | **ALINIR** | anomalies.ts zaten var, format değişikliği. trace_id/span_id ekleme. |
| Release gates (schema + quality + privacy + contamination + rights) | **ALINIR** | DatasetPublisher'a 5 kapı kontrolü eklemek. Mevcut QualityFilter + DedupFilter kullanılır. |
| Raw → Parsed → Normalized → Curated → Release storage path | **ALINIR** | Mantıksal olarak zaten bu sıra var ama storage_replicas tablosunda path prefix standartı yok. |
| part-00017-of-00128.parquet naming convention | **ALINIR** | Mevcut naming tutarsız. DatasetPublisher'da standart. |
| Skill SKILL.md'ye input/output schema + allowed-tools alanı | **ALINIR** | ops/ skills için yeni format. Minimal overhead, büyük kazanım. |
| MCP server üzerinden platform tools expose etme | **ALINIR** | Zaten var (protokol-mcp-server.ts). gates/lineage/release tool'ları eklenecek. |
| content_capture = false default (PII/prompt güvenliği) | **ALINIR** | Zaten logging-discipline.md'de var, MCP server'a da enforce edilecek. |

### 6.2 ALINMAYAN — Projenin ölçeği veya mimari sınırları nedeniyle

| Araştırma Önerisi | Karar | Gerekçe |
|---|---|---|
| **Dagster / Airflow orchestration** | **ALINMAZ** | Protokol-7'nin kendi `ScheduleBroker` + `WorkerPool` + SQLite cron sistemi var ve yeterli. Dagster'ı monte etmek şu anda overkill — tek makine, kişisel ölçek. `npm run verify` + `scripts/run-worker.ts` iş görüyor. |
| **Apache Kafka** | **ALINMAZ** | Gerçek zamanlı olay akışı ihtiyacı yok. Tüm pipeline'lar batch + checkpoint ile çalışıyor. Kafka'nın maliyeti (broker, ZooKeeper/KRaft, consumer group yönetimi) bu ölçeğe değmez. |
| **Debezium / CDC** | **KISMEN ERTELENDI** | Dış veritabanlarından CDC ihtiyacı şu an yok. Kendi SQLite'tan CDC anlamsız. Gelecekte OpenAlex delta / Wikidata recentchanges için `pipelines/cdc/` paradigması kurulacak ama Debezium değil, basit watermark. |
| **Apache Spark** | **ALINMAZ** | Şu an için Python + Polars/PyArrow + DuckDB yeterli. 5 TB altında Spark'ı çalıştırmanın operasyonel maliyeti faydayı geçiyor. Geçiş kriteri: ölçek 10+ TB'a ulaşınca. |
| **Apache Iceberg** | **ERTELENDI** | Dataset versioning için değerli ama şu an dataset_snapshots tablosu + immutable shard'lar yeterli. Geçiş kriteri: 100 TB+ veya schema evolution ihtiyacı. |
| **lakeFS** | **ALINMAZ** | Object storage'da Git benzeri branch/merge isteyecek ölçek yok. |
| **Sigstore/Cosign** | **ALINMAZ** | SHA-256 + manifest + checksums.sha256 yeterli. Sigstore transparency log, public dataset dağıtımı için anlamlı — şu an internal kullanım. |
| **SLSA provenance** | **ERTELENDI** | Kavramsal olarak run manifest bunu karşılıyor. Formal SLSA sertifikasyonu için dağıtık build pipeline'ı gerekir. |
| **A2A protocol** | **ALINMAZ** | Ajanlar aynı Python/Node process içinde çalışıyor. A2A farklı vendor/servisler arası. Şu an için MCP yeterli. |
| **DVC** | **ALINMAZ** | Git + immutable shards + storage_replicas zaten veri versioning sağlıyor. DVC ayrı toolchain maliyeti yaratır. |
| **MLflow tracing** | **ERTELENDI** | LLM inference kullanımı arttığında anlamlı. Şu an agent inference takibi yok. |
| **DataHub / OpenMetadata catalog** | **ERTELENDI** | Metadata catalog için şu an SQLite registry + system-manifest.md yeterli. Ekip büyüdüğünde değerlendirilebilir. |
| **Scrapy** | **ALINMAZ** | crawler-actor.ts + CrawlFrontier zaten var ve Playwright fallback ile çalışıyor. İkinci bir crawler framework gereksiz. |
| **Apache Tika** | **ALINMAZ** | EPUB, DOCX, PDF, CSV extractors zaten native yazılmış. Tika JVM dependency getirir. |
| **Ray Data** | **ERTELENDI** | Büyük dataset için değerli. Geçiş kriteri: bellekten taşan veri işleme ihtiyacı. |

### 6.3 ERTELENEN — Değerli ama öncelik değil

| Araştırma Önerisi | Geçiş Kriteri |
|---|---|
| OpenLineage entegrasyonu | Birden fazla makine / shared ekip |
| Croissant metadata (MLCommons) | Dataset public yayınında |
| Iceberg table format | 100 TB+ veya schema evolution |
| Dagster | 3+ kişilik ekip, karmaşık DAG ihtiyacı |
| CDC paradigması (Debezium değil watermark) | Yeni pipeline'larda |
| Ray Data | 10 GB+ bellekten taşan transform ihtiyacı |

---

## 7. Skills Yeniden Yapılandırma (Seçenek A)

### 7.1 Yapı

```
.agents/skills/
├── dev/    ← Proje geliştirirken (kod yaz, incele, debug et)
└── ops/    ← Veri işlerinde (çek, temizle, yayımla, denetle)
```

`skills/` root symlink → `.agents/skills/` — korunur.

### 7.2 Mevcut Skill Taşıma (16 skill)

dev/ → code-review, codebase-design, diagnosing-bugs, domain-modeling, grilling,
       naming-discipline, neuro-ergonomic-communication, prototype, research,
       resolving-merge-conflicts, setup-pre-commit, tdd, wizard, writing-for-agents

ops/ → data-ingestion-protocol, dbx-management

### 7.3 Yeni ops/ Skills — Genişletilmiş SKILL.md Formatı

Araştırmadan alınan kritik karar: **Skill bir prompt değil, versiyonlanmış operasyon prosedürüdür.**

Her yeni ops skill şu yapıyı kullanır:

```
ops/<skill-adi>/
├── SKILL.md           ← procedure + allowed-tools + input/output
├── schemas/
│   ├── input.schema.json
│   └── output.schema.json
└── references/
    └── platform-policy.md  (symlink → context/code-standards.md)
```

SKILL.md front-matter formatı (araştırma önerisi alındı):
```yaml
---
name: deduplicate-corpus
version: "1.0.0"
category: ops
description: >
  Exact ve near-duplicate kayıtları provenance zinciriyle ayır.
allowed-tools:
  - hash-service
  - minhash-service
  - artifact-writer
  - ledger-reader
input-schema: schemas/input.schema.json
output-schema: schemas/output.schema.json
---
```

**9 Yeni ops Skill:**

| Skill | Araştırma Bölümü | Protokol-7 Karşılığı |
|---|---|---|
| detect-pii | §13 (güvenlik) | document_provenance.pii_status → 'redacted' |
| deduplicate-corpus | §6 (dedup) | DedupFilter.ts + occurrences tablosu |
| score-quality | §6 (quality) | QualityFilter.ts + kayıt seviyesinde metrik |
| audit-lineage | §11 (lineage) | pipeline_run_manifests + occurrences zinciri |
| publish-dataset | §9 (manifest) | DatasetPublisher + release gates enforce |
| validate-schema | §8 (document_id) | document.v1 + manifest.v1 şema kontrolü |
| profile-dataset | §21 (format) | dataset_shards istatistik raporu |
| normalize-document | §8 (canonical) | TextNormalizer + canonicalization_version |
| decontaminate-dataset | §16 (skill seti) | test/validation split hash → train overlap |

### 7.4 AGENTS.md Güncellemesi

```markdown
| **Serebellum (dev)** | `.agents/skills/dev/` | Kod yazarken, debug'da, incelemede |
| **Serebellum (ops)** | `.agents/skills/ops/` | Veri çekerken, yayımlarken, denetlerken |
```

---

## 8. Dataset Release Formatı (Araştırma Kararı)

Araştırmanın §6 ve §21 önerileri alındı. Her dataset versiyonu bu yapıyı izleyecek:

```
data/snapshots/<dataset-name>/<version>/
├── data/
│   ├── part-00000-of-00128.parquet
│   ├── part-00001-of-00128.parquet
│   └── ...
├── manifest.json         ← run_id, trace_id, git_commit, gates, counts, quality
├── schema.json           ← Parquet column schema
├── checksums.sha256      ← part dosyaları SHA-256
├── statistics.json       ← kayıt sayısı, token tahmini, dil dağılımı, kalite metrikleri
└── README.md             ← Dataset Card (license, language, task, usage, limitations)
```

**Croissant (MLCommons):** ERTELENDI — public yayın öncesinde eklenecek.

Naming convention kararı (araştırma §7 alındı):
- Shard dosyaları: `part-{N:05d}-of-{total:05d}.parquet`
- Dataset: kebab-case
- Version: semver (`v1.4.0`)
- Run ID: UUIDv4 — `dataset_snapshots.run_id`

---

## 9. Telemetri ve Observability (Araştırma Kararı)

### 9.1 4 Sistem Ayrımı (Araştırma §11 tam alındı)

| Sistem | Cevap | Protokol-7'de |
|---|---|---|
| Logs | Ne oldu? | otel_log_events tablosu [YENİ] |
| Metrics | Ne kadar? | dataset_shards + counts_json [VAR] |
| Traces | Nerede zaman harcadı? | trace_id + span_id [YENİ] |
| Lineage | Bu data nereden üretildi? | pipeline_run_manifests + document_occurrences [YENİ] |

### 9.2 OTel Entegrasyonu — Ne Alınır

```
src/telemetry/
├── anomalies.ts    ← Mevcut, log-emitter.ts kullanacak şekilde güncelle
└── log-emitter.ts  ← YENİ: log-event.v1 şemasına uyumlu structured emitter
```

**Dışarıya export:** OTLP exporter opsiyonel, sonraki adım. Şu an local otel_log_events tablosuna yaz.

**OpenLineage:** ERTELENDI (birden fazla makine ortamında anlamlı).

**MLflow:** ERTELENDI (LLM inference trace ihtiyacı gelince).

### 9.3 MCP Logging Değil OTel

Araştırma §18 kararı alındı: MCP'nin deprecated eski logging mekanizması kullanılmayacak.
Telemetri doğrudan OpenTelemetry formatında log-emitter.ts üzerinden.

---

## 10. Agent / Skill / Tool / Connector Ayrımı (Araştırma §14 alındı)

Protokol-7'de bu sınırlar zaten var ama yazılı değil. AGENTS.md ve ARCHITECTURE.md'ye eklenecek:

```
AGENT       → karar verir (ActorRegistry, WorkerPool)
SKILL       → prosedürü tanımlar (.agents/skills/ops/ + dev/)
TOOL        → aksiyonu gerçekleştirir (actor metotları, pipeline processors)
CONNECTOR   → dış sistemle konuşur (pipeline/connectors/, pipeline/storage/)
WORKFLOW    → adımları deterministik sıraya koyar (YAML pipeline + ScheduleBroker)
```

**Multi-agent (A2A):** ALINMAZ — aynı process içinde çalışıyor, MCP yeterli.

---

## 11. Agent Permission Modeli (Araştırma §26 kısmi alındı)

Şu an permission enforcement yok. Minimal başlangıç olarak source-descriptor'a eklenmeli:

```json
"agent_permissions": {
  "read": ["raw/**"],
  "write": ["staging/**"],
  "delete": false,
  "shell": false
}
```

Bu alanı `source-descriptor.schema.json`'a opsiyonel olarak ekle.
Tam IAM enforcement ertelenmiş — önce şema, sonra server middleware.

---

## 12. Storage Path Standardizasyonu (Araştırma §4 alındı)

Raw immutable prensibi. `storage_replicas` tablosunda path prefix standartı yok.
Eklenecek convention (migration ile):

```
raw/{source_id}/{run_id}/{artifact_id}         ← ham, değişmez
staging/{run_id}/{artifact_id}                 ← dönüşüm süreci
parsed/{source_id}/{version}/{artifact_id}
normalized/{dataset_id}/{version}/{shard_id}
curated/{dataset_id}/{version}/{shard_id}
quarantine/{source_id}/{run_id}/{artifact_id}  ← PII/schema drift
datasets/{dataset_id}/{version}/               ← final release
```

`storage_replicas` tablosuna `path_tier` kolonu ekle:
```sql
ALTER TABLE storage_replicas ADD COLUMN path_tier TEXT
  CHECK(path_tier IN ('raw','staging','parsed','normalized','curated','quarantine','datasets'));
```

---

## 13. Tam Hedef Dizin Mimarisi

`[YENİ]` = oluşturulacak · `[TAŞI]` = yer değiştirecek · `[GÜNCELLE]` = revize edilecek

```
protokol-7/
│
├── .agents/skills/
│   ├── dev/                    [YENİ] — 14 mevcut skill
│   └── ops/                    [YENİ] — 2 mevcut + 9 yeni skill
│       └── <skill>/
│           ├── SKILL.md        (genişletilmiş format: version, category, allowed-tools)
│           ├── schemas/
│           └── references/
│
├── config/
│   ├── auth/
│   └── dbs/
│
├── context/
│   ├── architecture-schema.md  [GÜNCELLE] — skills ayrımı, CDC, telemetri bölümü
│   ├── schema.sql              [GÜNCELLE] — 5 yeni tablo + 4 ALTER + path_tier
│   └── ...
│
├── contracts/
│   ├── schemas/                [YENİ] — Blueprint JSON Schema v1 dosyaları
│   │   ├── document.v1.schema.json
│   │   ├── manifest.v1.schema.json
│   │   ├── log-event.v1.schema.json
│   │   ├── source.v1.schema.json
│   │   └── dataset-release.v1.schema.json
│   └── source-descriptor.schema.json  [GÜNCELLE] — verification_level + evidence[] + streams[] + agent_permissions
│
├── docs/
│   ├── archive/                [YENİ]
│   │   ├── plans/              ← 83 eski plan
│   │   ├── walkthroughs/       ← 86 eski walkthrough
│   │   └── README.md
│   ├── adr/                    [GÜNCELLE] — ADR-0010: provenance model kararı
│   ├── plans/                  ← sadece aktif planlar
│   ├── walkthroughs/           ← sadece son 3-5
│   └── research/               [YENİ] — scratch/ + notebooks/ içeriği
│
├── infra/
│   ├── compose/                [YENİ] — docker-compose.yml buraya
│   ├── migrations/
│   │   └── 0002-blueprint-provenance.sql  [YENİ]
│   └── monitoring/             [YENİ] — otel-collector-config.yaml (ilerisi için)
│
├── pipelines/
│   ├── shared/                 [GÜNCELLE] — ledger_base cursor interface
│   ├── api_stream/
│   ├── dump/
│   ├── snapshot/
│   ├── multimodal/
│   └── cdc/                    [YENİ] — watermark tabanlı CDC paradigması
│
├── scripts/
│   └── runners/                [YENİ] — uzantısız dosyalar .py olarak buraya
│
├── src/
│   ├── api/
│   │   └── routers/
│   │       └── dataset-router.ts  [GÜNCELLE] — /gates + /release + /lineage
│   ├── dataset/
│   │   └── dataset-publisher.ts   [GÜNCELLE] — 5 release gate enforce
│   ├── pipeline/
│   │   └── processors/
│   │       ├── text-normalizer.ts [GÜNCELLE] — canonicalization_version kayıt
│   │       └── decontaminate-filter.ts  [YENİ]
│   ├── telemetry/
│   │   ├── anomalies.ts           [GÜNCELLE] — log-emitter.ts kullan
│   │   └── log-emitter.ts         [YENİ] — OTel log-event.v1 emitter
│   └── ...
│
├── AGENTS.md                   [GÜNCELLE] — dev/ops skills + agent/skill/tool/connector ayrımı
├── ARCHITECTURE.md             [GÜNCELLE] — src/core→api düzeltme, yeni bölümler
└── GEMINI.md                   [TAŞI] → docs/archive/
```

---

## 14. Veri Akış Paradigmaları — Tam Harita

| Paradigma | Araştırma §2 | Protokol-7 Karşılığı | Durum |
|---|---|---|---|
| REST API pagination | rest / incremental | api_stream/ pipeline'ları | VAR |
| GraphQL cursor | graphql | api-extractor-actor.ts | VAR |
| Webhook / event push | webhook | — | YOK (gelecek ihtiyaç değil) |
| Polling | polling | scheduled_jobs cron | VAR |
| Full DB snapshot | snapshot | pipelines/snapshot/ | VAR |
| Incremental watermark | incremental | ledger cursor (standartize edilecek) | KISMI |
| CDC | cdc | pipelines/cdc/ | YENİ |
| Static crawl | crawl | crawler-actor.ts + CrawlFrontier | VAR |
| Dynamic browser | browser | playwright-browser-actor.ts | VAR |
| File / object | file | document-extractor-actor.ts | VAR |
| SPARQL / graph | semantic/graph | wikidata-actor, eur-lex-actor | VAR |
| S3 bucket scan | s3_bucket | binance-vision, openalex-snapshot | VAR |
| OAI-PMH | oai_pmh | dergipark, aperta, doaj | VAR |
| RSS/Atom feed | feed | sitemap-xml-actor | VAR |
| PDF/EPUB/DOCX | file | actors/documents/ | VAR |
| OCR | multimodal | src/ocr/ — 6 connector | VAR |

---

## 15. Uygulama Sırası

### Faz 0: Temizlik (1-2 gün — sıfır kod değişikliği)

```
[  ] ledger/telemetry.jsonl → .gitignore
[  ] Uncommitted dosyaları commit et
[  ] docs/archive/ oluştur, 83+86 dosyayı taşı
[  ] GEMINI.md → docs/archive/
[  ] 26 merged branch sil (local + remote)
[  ] git gc --prune=now
[  ] scripts/ uzantısız dosyalar → scripts/runners/*.py
[  ] docker-compose.yml → infra/compose/
```

### Faz 1: Yapısal (3-5 gün)

```
[  ] .agents/skills/dev/ + ops/ oluştur, skill'leri taşı
[  ] 9 yeni ops SKILL.md yaz (genişletilmiş format)
[  ] contracts/schemas/ oluştur, Blueprint JSON Schema'ları kopyala
[  ] source-descriptor.schema.json genişletme (verification_level + streams[] + agent_permissions)
[  ] AGENTS.md güncellemesi (dev/ops satırları + agent/skill/tool/connector ayrımı)
[  ] ARCHITECTURE.md revize
[  ] ADR-0010 yaz: provenance model ve immutable artifact kararı
```

### Faz 2: Şema + Telemetri (1 hafta)

```
[  ] infra/migrations/0002-blueprint-provenance.sql
[  ] context/schema.sql güncelle (5 tablo + ALTER'lar + path_tier)
[  ] src/api/registry-database.ts — yeni tablolar TypeScript tarafına
[  ] src/telemetry/log-emitter.ts — OTel log-event.v1 emitter
[  ] src/telemetry/anomalies.ts — log-emitter.ts kullan
```

### Faz 3: Provenance + Release Kapıları (2-3 hafta)

```
[  ] src/dataset/types.ts — run_id, trace_id, git_commit, gates alanları
[  ] src/dataset/dataset-publisher.ts — 5 gate enforcement
[  ] src/api/routers/dataset-router.ts — /gates + /release + /lineage
[  ] src/pipeline/processors/text-normalizer.ts — canonicalization_version kayıt
[  ] pipelines/shared/ledger_base.py — get_cursor() / commit_cursor() standardı
[  ] storage_replicas path_tier convention
[  ] Dataset Card README.md şablonu (araştırma §24)
[  ] statistics.json üretimi (DatasetPublisher'a ek çıktı)
```

### Faz 4: Uzun Vadeli

```
[  ] pipelines/cdc/ — ilk CDC pipeline (OpenAlex delta watermark)
[  ] src/pipeline/processors/decontaminate-filter.ts
[  ] Document-level pii_status Parquet kolonları
[  ] Croissant JSON-LD metadata (public yayın öncesi)
[  ] OpenLineage entegrasyonu (ekip büyüdüğünde)
[  ] infra/monitoring/ — OTel collector
```

---

## 16. Karar Günlüğü (ADR-0010 için ham material)

| Karar | Tercih | Ret | Neden |
|---|---|---|---|
| Orchestration | ScheduleBroker + WorkerPool | Dagster | Tek makine ölçeği, mevcut sistem yeterli |
| Streaming | Batch checkpoint | Kafka | Gerçek zamanlı ihtiyaç yok |
| Lake format | Parquet + SQLite registry | Iceberg | 100 TB altı, şema evrimi yok |
| Data versioning | Immutable shards + snapshots | DVC / lakeFS | Mevcut SHA-256 + storage_replicas yeterli |
| Agent communication | MCP (mevcut) | A2A | Aynı process, farklı servis yok |
| Artifact signing | SHA-256 + checksums.sha256 | Sigstore | Internal kullanım, public dağıtım yok |
| Document parsing | Native extractors | Tika | JVM dependency, native karşılığı var |
| Web crawling | crawler-actor + Playwright | Scrapy | Mevcut yeterli, duplicate framework |
| Distributed compute | Polars + PyArrow | Spark / Ray | 5 TB altı, tek makine yeterli |
| Lineage | pipeline_run_manifests + occurrences | OpenLineage | Tek ekip, lokal kullanım |
| Observability export | OTel format local + opsiyonel OTLP | Grafana stack | Altyapı kurulum maliyeti şimdilik |

---

## 17. Dokunulmayacaklar

| Bileşen | Durum |
|---|---|
| Nix + devenv ortamı | Mükemmel — dokunma |
| SSRF Guard | Sağlam |
| Actor-Registry (70+ aktör) | İyi tasarlanmış |
| Quality Filter (FineWeb/Gopher) | Yeterli |
| Worker + TaskWorker + outbox | Sağlam |
| ColdVaultExporter | Sağlam |
| OCR (6 connector) | Sağlam |
| MCP server (protokol-mcp-server.ts) | Sağlam |
| Trust-tier + failure-checklist | Dokunma |
| npm run verify (5 katman) | Dokunma |
