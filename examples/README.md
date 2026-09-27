# examples/ — Runnable Configuration Examples

Two types of examples: actor JSON configs and pipeline YAML configs.
All examples can be run directly against a running Protokol-7 server.

---

## Actor Examples (`examples/actors/`)

Standalone JSON payloads for every actor. Send directly to the REST API.

**Run an actor via HTTP:**
```bash
# Start the server first
npm run dev

# Send an actor config
curl -X POST http://localhost:4000/api/v1/<actor-type> \
  -H "Content-Type: application/json" \
  -d @examples/actors/<actor-name>.json
```

**Example:**
```bash
curl -X POST http://localhost:4000/api/v1/wikimedia \
  -H "Content-Type: application/json" \
  -d @examples/actors/wikimedia.json
```

**Available actor configs:** 31 files covering all actors.
Actor type names map 1:1 to REST endpoint paths (`/api/v1/<actor-type>`).

| Category | Actor Type Examples |
|---|---|
| Web | `cheerio-scraper`, `crawler`, `api-extractor`, `serp-search` |
| Corpus | `wikimedia`, `arxiv`, `openalex`, `gutenberg`, `ietf-rfc` |
| Documents | `pdf-document`, `epub-extractor`, `archive-extractor` |

---

## Pipeline Examples (`examples/pipelines/`)

YAML pipeline configs for multi-stage extraction and storage workflows.

**Run a pipeline via CLI:**
```bash
npm run pipeline -- examples/pipelines/wikimedia-sample.yaml
```

**Run a pipeline via HTTP:**
```bash
curl -X POST http://localhost:4000/api/v1/pipelines/run \
  -H "Content-Type: application/json" \
  -d '{"pipelineYaml": "'$(base64 -w0 examples/pipelines/wikimedia-sample.yaml)'"}'
```

**Available pipeline configs:**

| File | Actor | Output | Description |
|---|---|---|---|
| `wikimedia-sample.yaml` | `wikimedia` | JSONL | Encyclopedic article extraction pipeline |
| `corpus-parquet-sample.yaml` | `wikimedia` | Parquet (ZSTD) | LLM corpus shard with quality filtering and dedup |
| `ktb-ekitap-sample.yaml` | `ktb-ekitap` | JSONL | Turkish Ministry of Culture e-book pipeline |
| `saglik-ekutuphane-sample.yaml` | `saglik-ekutuphane` | JSONL | Turkish Health Ministry e-library pipeline |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in credentials before running pipelines
that use cloud storage backends (S3, R2, B2, Google Drive).

```bash
cp .env.example .env
```
