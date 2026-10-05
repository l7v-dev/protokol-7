# Boru Hattı REST API ve MCP Tetikleme Uç Noktaları Planı

Bu plan; `protokol-7` bildirimsel YAML külliyat işleme ve veri damıtma boru hatlarının HTTP REST API (`/api/v1/pipelines/*`) ve Model Context Protocol (MCP) arayüzleri (`run_pipeline`, `list_pipelines`) üzerinden tetiklenmesini, izlenmesini ve OpenAPI 3.1.0 ile belgelenmesini tanımlar.

---

## 1. Temel İlkeler ve Kararlar (Core Invariants)

1. **Çoklu Girdi Desteği (Flexible Inputs with Strict Validation):**
   * Boru hattı çalıştırma uç noktası (`POST /api/v1/pipelines/run`), doğrudan ham YAML metni (`yaml`), ayrıştırılmış konfigürasyon nesnesi (`config`) veya depodaki örnek YAML dosya yolu (`filePath`, ör. `examples/pipelines/corpus-parquet-sample.yaml`) kabul eder.
2. **Güvenli Dosya Yolu Denetimi (Path Traversal Guard):**
   * `filePath` parametresi verildiğinde `..` (üst dizin) geçişleri engellenir ve dosyanın yalnızca izin verilen çalışma dizini sınırları içinde olması zorunlu kılınır.
3. **Senkron ve Asenkron Çalıştırma Modu:**
   * Varsayılan senkron modda boru hattı sonuçları (`PipelineRunResult`) doğrudan yanıt olarak döndürülür.
   * `async: true` bayrağı ile çalıştırmalarda anında HTTP 202 Accepted ve `runId` dönülür; istemci durumu `GET /api/v1/pipelines/runs/:id` veya SSE üzerinden izleyebilir.
4. **Yapay Zeka Ajanları için MCP Araçları:**
   * `run_pipeline`: Claude, Cursor, Antigravity ve Cline ajanlarının doğrudan bildirimsel boru hattı koşturmasını sağlar.
   * `list_pipelines`: Mevcut hazır boru hattı şablonlarını ve geçmiş çalıştırmaları listeler.
5. **Nöro-Ergonomik ve Standart Hata Yanıtları:**
   * Tüm hatalar `SelfHealingError` standardına (`code`, `error`, `remedy`, `retryable`) uygun üretilir.

---

## 2. Faz Faz Uygulama Adımları

### Faz 1: HTTP REST Uç Noktalarının Eklenmesi (`src/core/server.ts`)
* `POST /api/v1/pipelines/run`: Boru hattını `PipelineRunner` ile koşturur.
* `GET /api/v1/pipelines/runs`: `RegistryDatabase.listPipelineExecutions(limit)` üzerinden geçmiş çalışmaları listeler.
* `GET /api/v1/pipelines/runs/:id`: Belirli bir çalışmanın durumunu ve depolama makbuzunu (`receipt`) döndürür.

### Faz 2: MCP Protokol Entegrasyonu (`src/mcp/protokol-mcp-server.ts`)
* `run_pipeline` ve `list_pipelines` araçlarının `tools/list` ve `tools/call` akışlarına eklenmesi.
* Ajanlar için parametre açıklamaları ve JSON şemalarının (`inputSchema`) tanımlanması.

### Faz 3: OpenAPI 3.1.0 Spesifikasyonunun Güncellenmesi (`src/core/openapi-spec.ts`)
* Yeni rotaların Swagger UI ve OpenAPI JSON şemasına `Pipelines` etiketiyle eklenmesi.

### Faz 4: Kapsamlı Entegrasyon Testleri (`tests/pipeline-api-and-mcp.test.ts`)
* `POST /api/v1/pipelines/run` ile YAML ve JSON konfigürasyon çalıştırma testleri.
* Hatalı konfigürasyon reddi ve güvenlik kısıtları testleri.
* `GET /api/v1/pipelines/runs` ve `GET /api/v1/pipelines/runs/:id` sorgulama testleri.
* MCP `run_pipeline` ve `list_pipelines` araçlarının JSON-RPC çağrı testleri.

### Faz 5: Sistem Doğrulaması
* `npm test`, `npm run lint`, `npm run build` ve `npm run verify` boru hattı kontrolleri.
