# Pipeline Orchestrator — Mimari Plan

Branch: `feature/pipeline-orchestrator`
Trust Tier: 1 (yeni modül, insan onayı gerekli)

---

## 1. Sorun Tanımı

18 aktör veri çeker, temizler, döndürür. Ancak:
- Aktör çıktısı nereye gidecek? Kim karar verir?
- Günlük çalışma nasıl zamanlanacak?
- Çıktı Parquet'e nasıl dönüşecek?
- Drive veya R2'ye nasıl yüklenecek?

Bu kararlar şu an her pipeline script'inde ayrı ayrı, hardcoded yapılıyor
(`wikipedia_pipeline/`, `bigdata_pipeline/`). Genel amaçlı, yapılandırılabilir
bir orkestrasyon katmanı yok.

---

## 2. Dürüst Kapsam Değerlendirmesi

Bu plan **küçük bir özellik değildir.** Tam bir pipeline orkestrasyon katmanıdır.

Bağlayıcılar (connectors) bu sistemde **zorunludur** — kaçış yok:
- Google Drive → OAuth2 veya service account credential yönetimi
- S3 / R2 / B2 → access key + secret + endpoint yönetimi
- Pipedream remote → API token + webhook URL yönetimi

Credential yönetimi olmadan storage routing çalışmaz.
Bu planın en karmaşık kısmı connector güvenliği ve credential lifecycle'ıdır.

---

## 3. Hedef Akış

```
pipeline.yaml (Pipeline Config)
    |
    v
[1] Config Validator       -- Zod şeması, YAML parse, hata mesajı
    |
    v
[2] Actor Resolver         -- aktör registry'de var mı?
    |-- Evet --> devam
    |-- Hayır --> PipelineError("actor not found: <id>")
    |
    v
[3] Schedule Broker        -- one-time / cron
    |-- local cron: setInterval / node-cron
    |-- remote: execution target'a devret
    |
    v
[4] Execution Target       -- nerede çalışacak?
    |-- LocalExecutor      --> doğrudan HTTP POST /api/v1/<actor>/run
    |-- RemoteHttpExecutor --> uzak protokol-7 instance'ına POST
    |-- PipedreamExecutor  --> Pipedream webhook trigger
    |
    v
[5] Output Sink            -- ham çıktıyı havuza indir
    |-- StreamSink         --> akış halinde yaz (bellek dostu)
    |-- BufferedSink       --> tüm çıktıyı topla
    |
    v
[6] Output Processor       -- format dönüşümü
    |-- JsonlWriter        --> newline-delimited JSON
    |-- ParquetPacker      --> ZSTD-6 Parquet (Python subprocess bridge)
    |-- CsvWriter          --> RFC 4180 CSV
    |-- PassthroughWriter  --> ham JSON (dönüşüm yok)
    |
    v
[7] Storage Router         -- nereye gönderilecek?
    |-- LocalStorage       --> PROTOKOL_POOL_ROOT altına yaz
    |-- GoogleDriveStorage --> Drive API v3 (OAuth2 / service account)
    |-- S3Storage          --> AWS S3 (aws-sdk v3)
    |-- R2Storage          --> Cloudflare R2 (S3-uyumlu, custom endpoint)
    |-- B2Storage          --> Backblaze B2 (S3-uyumlu API)
```

---

## 4. Pipeline Config Şeması (YAML)

```yaml
# pipeline.yaml örnek
name: wikimedia-tr-daily
version: 1

actor:
  id: wikimedia
  config:
    query: "Türkiye tarihi"
    action: article
    includeReferences: false

schedule:
  type: cron               # one-time | cron
  expression: "0 2 * * *" # her gece 02:00

execution:
  target: local            # local | remote-http | pipedream
  # remote-http için:
  # endpoint: "https://my-server.com"
  # token: "${REMOTE_API_TOKEN}"

output:
  format: parquet          # jsonl | parquet | csv | passthrough
  compression: zstd        # zstd | gzip | none (parquet için)
  max_rows_per_file: 100000

storage:
  backend: r2              # local | drive | s3 | r2 | b2
  connector: my-r2         # connectors/ altındaki connector adı
  prefix: "wikimedia/tr/"  # remote path prefix
  # drive için:
  # folder_id: "1BxiMV..."

connectors:
  my-r2:
    type: r2
    bucket: "${R2_BUCKET_NAME}"
    account_id: "${R2_ACCOUNT_ID}"
    access_key_id: "${R2_ACCESS_KEY_ID}"
    secret_access_key: "${R2_SECRET_ACCESS_KEY}"
```

Connector credentialları **daima env var referansı** (`${VAR}`) olur —
düz değer kabul edilmez, config şeması bunu reddeder.

---

## 5. Modül Yapısı

```
src/pipeline/
  schema.ts                -- Zod şeması, YAML parser, PipelineConfig tip
  actor-resolver.ts        -- registry lookup, hata üretimi
  schedule-broker.ts       -- cron / one-time zamanlama motoru
  output-sink.ts           -- StreamSink, BufferedSink
  pipeline-runner.ts       -- ana orkestrasyon döngüsü
  execution/
    index.ts               -- ExecutionTarget interface
    local-executor.ts      -- HTTP POST /api/v1/<actor>/run
    remote-http-executor.ts
    pipedream-executor.ts
  processors/
    index.ts               -- OutputProcessor interface
    jsonl-writer.ts
    parquet-packer.ts      -- Python subprocess bridge
    csv-writer.ts
    passthrough-writer.ts
  storage/
    index.ts               -- StorageBackend interface + StorageReceipt
    local-storage.ts
    google-drive-storage.ts
    s3-storage.ts          -- AWS S3
    r2-storage.ts          -- Cloudflare R2 (S3-compat)
    b2-storage.ts          -- Backblaze B2 (S3-compat)
  connectors/
    index.ts               -- connector registry, env var resolver
    connector-schema.ts    -- ConnectorConfig Zod şeması

tests/
  pipeline-schema.test.ts
  actor-resolver.test.ts
  pipeline-runner.test.ts  -- mock executor + mock storage
  storage-router.test.ts   -- mock S3/Drive client
```

---

## 6. Bağlayıcılar (Connectors) — Dürüst Karmaşıklık Haritası

| Backend | Auth Mekanizması | Karmaşıklık | Bağımlılık |
|---|---|---|---|
| Local | Yok | Trivial | Yok |
| S3 | access key + secret | Orta | `@aws-sdk/client-s3` |
| R2 | access key + secret + endpoint | Orta | `@aws-sdk/client-s3` (endpoint override) |
| B2 | access key + secret + endpoint | Orta | `@aws-sdk/client-s3` (S3-compat) |
| Google Drive | OAuth2 veya service account JSON | Yüksek | `googleapis` |
| Pipedream remote | webhook URL + token | Düşük | Yok (native fetch) |
| Remote HTTP | endpoint + bearer token | Düşük | Yok (native fetch) |

**Önemli:** S3, R2, B2 üçü de AWS S3 API uyumlu — tek `@aws-sdk/client-s3`
bağımlılığı, sadece `endpoint` ve `region` değişiyor. Üç ayrı SDK değil.

Google Drive ayrı bir OAuth2 lifecycle gerektirir. Bu en karmaşık parça.
Service account JSON yolu önerilir — OAuth2 consent flow'dan kaçınır.

---

## 7. Parquet Çıktısı — Mimari Karar

TypeScript'te sıfır-bağımlılık native Parquet yazıcısı mevcut değildir.
Seçenekler:

| Yaklaşım | Artı | Eksi |
|---|---|---|
| Python subprocess (`packer.py`) | Mevcut kod var, ZSTD-6 destekli | Python env bağımlılığı |
| `parquet-wasm` (WebAssembly) | Pure JS | Deneysel, büyük bundle |
| Apache Arrow JS (`apache-arrow`) | Stabil, resmi | Parquet yazma desteği sınırlı |

**Karar:** Faz 1'de Python subprocess bridge kullan (`scripts/bigdata_pipeline/packer.py`).
Bu en az riskli ve mevcut testlere sahip yol.
Faz 2'de `apache-arrow` + native TS Parquet yazıcısına geçiş değerlendirilebilir.

---

## 8. Uygulama Fazları

### Faz 1 — Çekirdek (Core) [Öncelik: Yüksek]

1. `src/pipeline/schema.ts` — PipelineConfig Zod şeması + YAML parser (`js-yaml`)
2. `src/pipeline/actor-resolver.ts` — registry lookup
3. `src/pipeline/execution/local-executor.ts` — HTTP POST to local server
4. `src/pipeline/output-sink.ts` — StreamSink
5. `src/pipeline/processors/jsonl-writer.ts` — JSONL çıktı
6. `src/pipeline/storage/local-storage.ts` — local pool
7. `src/pipeline/pipeline-runner.ts` — one-time çalışma
8. `tests/pipeline-runner.test.ts` — mock executor + mock storage
9. CLI: `npm run pipeline -- --config pipeline.yaml`

Faz 1 çıktısı: `pipeline.yaml` ile local actor → JSONL → local storage akışı çalışır.

### Faz 2 — Storage Connectors [Öncelik: Orta]

1. `src/pipeline/connectors/` — env var resolver, connector registry
2. `src/pipeline/storage/s3-storage.ts` — AWS S3
3. `src/pipeline/storage/r2-storage.ts` — Cloudflare R2
4. `src/pipeline/storage/b2-storage.ts` — Backblaze B2
5. `src/pipeline/processors/parquet-packer.ts` — Python subprocess bridge
6. `src/pipeline/processors/csv-writer.ts`
7. `tests/storage-router.test.ts` — mock S3 client (aws-sdk-client-mock)

### Faz 3 — Scheduler + Remote Execution [Öncelik: Düşük]

1. `src/pipeline/schedule-broker.ts` — cron expression engine
2. `src/pipeline/execution/remote-http-executor.ts`
3. `src/pipeline/execution/pipedream-executor.ts`
4. `src/pipeline/storage/google-drive-storage.ts` — service account
5. Pipeline server modu: arka planda çalışan scheduler daemon

### Faz 4 — Config Editability [Öncelik: Düşük]

1. REST endpoint: `GET /api/v1/pipelines` — pipeline listesi
2. REST endpoint: `GET /api/v1/pipelines/:name` — config oku
3. REST endpoint: `PUT /api/v1/pipelines/:name` — config güncelle + yeniden yükle
4. `tests/pipeline-api.test.ts`

---

## 9. Yeni Bağımlılıklar

| Paket | Kullanım | Faz |
|---|---|---|
| `js-yaml` | YAML parser | 1 |
| `@aws-sdk/client-s3` | S3, R2, B2 storage | 2 |
| `googleapis` | Google Drive storage | 3 |

`node-cron` **eklenmeyecek** — `node:timers` ve cron expression manuel parser
yeterli. Gereksiz bağımlılık eklenmez.

---

## 10. Mimari Sınırlar (Invariants)

- Connector credentialı hiçbir zaman pipeline config dosyasına düz string olarak yazılmaz.
- `StorageBackend.upload()` her zaman `StorageReceipt` döndürür (checksum + remote URI).
- `ExecutionTarget.run()` her zaman aktör ham JSON çıktısını stream olarak döndürür.
- Pipeline Runner hatada `failedRuns[]` listesine kaydeder, process'i çökertemez.
- Parquet packer subprocess başarısızsa JSONL fallback'e geçer, sessizce yutmaz.

---

## 11. Sıradaki Adım

Faz 1 uygulaması için onay ver — `feature/pipeline-orchestrator` branch'inde başlanır.
`js-yaml` bağımlılığı eklenmeden önce SCA doğrulaması yapılacak.
