# Node.js Cekirdegi icin SQLite Kalici Kayit Defteri (RegistryDatabase) — Mimari Plan

Branch: `feature/core-sqlite-registry`
Trust Tier: 2 (Mevcut state-bearing bileşenlerde `RunRegistry`, `PipelineRunner`, `ScheduleBroker` entegrasyonu ve yeni `RegistryDatabase` sınıfı)

---

## 1. Sorun Tanimi

protokol-7 servisinin TypeScript / Node.js cekirdeginde yer alan uc kritik durum yonetim bileseni:
1. `RunRegistry` (`src/core/run-registry.ts`) — Aktor calistirma kayitlari ve canli SSE loglari,
2. `PipelineRunner` (`src/pipeline/pipeline-runner.ts`) — Pipeline calistirma gecmisi ve storage receipt kayitlari,
3. `ScheduleBroker` (`src/pipeline/schedule-broker.ts`) — Cron tabanli zamanlanmis gorev tanimlari ve calisma sayaclari,

tamamen bellek ici (in-memory `Map` ve `Array`) veri yapilarinda tutulmaktadir.
- Servis veya sunucu yeniden baslatildiginda (restart) tum calistirma gecmisi, log defterleri ve zamanlanmis islerin durumu kalici olmadan silinmektedir.
- `RunRegistry` icerisinde hafiza sizintisini onlemek adina `MAX_RUNS = 200` tahliye limiti bulunmakta, eski calistirma kayitlari kaybolmaktadir.
- Denetim izi (audit trail) ve gecmise donuk aktor basari metrikleri iliskisel olarak sorgulanamamaktadir.

---

## 2. Cozum Mimarisi

Node.js v22 ile gelen yerel `node:sqlite` (`DatabaseSync`) modulu kullanilarak sifir harici paket bagimliligiyla merkezi ve ACID uyumlu bir iliskisel veri katmani (`src/core/registry-database.ts`) insa edilir.

```
                    +---------------------------+
                    |    RegistryDatabase       |
                    |  (node:sqlite / Sync)     |
                    +-------------+-------------+
                                  |
         +------------------------+------------------------+
         |                        |                        |
         v                        v                        v
+------------------+    +--------------------+   +-------------------+
|   actor_runs     |    | pipeline_executions|   |  scheduled_jobs   |
| actor_run_logs   |    |                    |   |                   |
+------------------+    +--------------------+   +-------------------+
         ^                        ^                        ^
         |                        |                        |
+------------------+    +--------------------+   +-------------------+
|   RunRegistry    |    |   PipelineRunner   |   |  ScheduleBroker   |
| (SSE / EventBus) |    |  (Orchestrator)    |   |    (Cron Engine)  |
+------------------+    +--------------------+   +-------------------+
```

---

## 3. Veritabani Semasi ve Tablolar

Veritabani konumu:
- Uretim: `data/protokol_registry.sqlite` (ortam degiskeni: `PROTOKOL_DB_PATH`)
- Test ortami (`NODE_ENV === "test"`): Varsayilan `:memory:` (tamamen izole, sifir disk kirliligi)

### 3.1 Tablolar ve Iliskiler

1. **`actor_runs`**:
   - `run_id` TEXT PRIMARY KEY
   - `actor_name` TEXT NOT NULL
   - `status` TEXT NOT NULL CHECK(status IN ('pending', 'running', 'succeeded', 'failed', 'vetoed'))
   - `input_json` TEXT NOT NULL
   - `output_json` TEXT
   - `error_message` TEXT
   - `item_count` INTEGER DEFAULT 0
   - `duration_ms` INTEGER
   - `started_at` TEXT NOT NULL
   - `finished_at` TEXT

2. **`actor_run_logs`**:
   - `log_id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `run_id` TEXT NOT NULL REFERENCES actor_runs(run_id) ON DELETE CASCADE
   - `timestamp` TEXT NOT NULL
   - `level` TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR', 'PASS', 'VETO'))
   - `message` TEXT NOT NULL

3. **`pipeline_executions`**:
   - `execution_id` TEXT PRIMARY KEY
   - `pipeline_name` TEXT NOT NULL
   - `actor_id` TEXT NOT NULL
   - `status` TEXT NOT NULL CHECK(status IN ('succeeded', 'failed'))
   - `item_count` INTEGER NOT NULL DEFAULT 0
   - `duration_ms` INTEGER NOT NULL DEFAULT 0
   - `receipt_json` TEXT
   - `error_message` TEXT
   - `started_at` TEXT NOT NULL
   - `completed_at` TEXT NOT NULL

4. **`scheduled_jobs`**:
   - `job_id` TEXT PRIMARY KEY
   - `cron_expression` TEXT NOT NULL
   - `running` INTEGER NOT NULL DEFAULT 1 CHECK(running IN (0, 1))
   - `last_run_at` TEXT
   - `run_count` INTEGER NOT NULL DEFAULT 0
   - `created_at` TEXT NOT NULL
   - `updated_at` TEXT NOT NULL

### 3.2 Indeksler
- `CREATE INDEX IF NOT EXISTS idx_actor_runs_status ON actor_runs(status);`
- `CREATE INDEX IF NOT EXISTS idx_actor_runs_started_at ON actor_runs(started_at DESC);`
- `CREATE INDEX IF NOT EXISTS idx_actor_run_logs_run_id ON actor_run_logs(run_id);`
- `CREATE INDEX IF NOT EXISTS idx_pipeline_exec_started ON pipeline_executions(started_at DESC);`
- `CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_running ON scheduled_jobs(running);`

---

## 4. Entegrasyon ve Geriye Uyumluluk

1. **`src/core/registry-database.ts`**:
   - Baglanti yonetimi, DDL calistirma, WAL modu (`PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = NORMAL;`, `PRAGMA busy_timeout = 5000;`).
   - Prepared statement'lar ile yuksek hizli CRUD operasyonlari.
2. **`src/core/run-registry.ts`**:
   - `RunRegistry` yapici metoduna opsiyonel `db?: RegistryDatabase` eklenir.
   - `createRun`, `startRun`, `appendLog`, `completeRun`, `failRun` metotlarinda hem bellek ici durum hem de SQLite eszamanli guncellenir.
   - `getRun` ve `listRuns` metodlari veritabanindan okuma destegiyle sunucu yeniden baslatilsa dahi onceki kayitlari sunar.
3. **`src/pipeline/pipeline-runner.ts`**:
   - `PipelineRunnerOptions` arayuzune `registryDb?: RegistryDatabase` eklenir.
   - Pipeline calismasi tamamlandiginda calistirma sonucu `pipeline_executions` tablosuna yazilir.
   - `getRunHistory(limit?: number)` metodu veritabanindan beslenir.
4. **`src/pipeline/schedule-broker.ts`**:
   - `ScheduleBroker` yapici metoduna `db?: RegistryDatabase` eklenir.
   - Gorevler eklendiginde ve her tetiklendiginde `scheduled_jobs` tablosu guncellenir.
5. **Dogrulama ve Test**:
   - `tests/registry-database.test.ts` testi olusturulur.
   - Mevcut 417 testin hicbir kirilma yasamadan %100 calismaya devam etmesi saglanir.
   - `context/architecture-schema.md` guncellenir.
