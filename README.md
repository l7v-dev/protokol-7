# Protokol-7

**Massive Scale Data Ingestion, Headless Web Scraping, and Document Extraction Pipeline.**

Protokol-7 is a hybrid **Node.js/TypeScript microservice** and **Python data pipeline** ecosystem designed for high-throughput, structured data acquisition. Its ultimate architectural target is a **500 TB Distributed Data Lake**, specializing in academic, scientific, legal, and cultural datasets.

---

## 1. Vision & The 500 TB Data Lake Architecture

To achieve a 500 TB distributed Data Lake without bottlenecks, Protokol-7 employs a strictly separated **Two-Stage Architecture**:

### Stage 1: High-Speed Metadata Hunters (Implemented)
- Fast, non-blocking ingestion of JSON/XML metadata via APIs (OAI-PMH, REST).
- **Format:** Saves structured data into column-oriented **Parquet** shards (Zstandard compressed).
- **State Management:** Uses local **SQLite Ledgers** to track exact pagination states, ensuring pause/resume capabilities without duplicate records.
- *Active Pipelines:* DOAJ (Directory of Open Access Journals) and DergiPark (TÜBİTAK ULAKBİM).

### Stage 2: Heavy Asset Workers (In Development)
- Downloading PDFs, parsing layouts, and running OCR is highly network/CPU bound.
- Stage 1 pushes discovered PDF URLs to a distributed message queue (e.g., RabbitMQ, Kafka).
- Independent Worker Nodes (written in Python using `PyMuPDF`/`pdfminer`) consume the queue, download the heavy assets, extract text, and append the content to the Data Lake (MinIO/S3 + Apache Iceberg).

---

## 2. Core Node.js Microservice (Actors & Web Scraping)

The core application exposes both a native HTTP REST API (with OpenAPI 3.1.0 Swagger) and a **Model Context Protocol (MCP)** interface for AI agent tool calling.

- **31 Domain Extraction Actors**:
  - **Web & Crawling**: Cheerio, Playwright, Sitemap XML, Markdown extraction, Network interception.
  - **Scholarly & Science**: arXiv, Europe PMC, OpenAlex, DergiPark.
  - **Government & Legal**: SEC Edgar, Court Listener, EUR-Lex, Open FDA.
  - **Library & Culture**: Gutenberg, Internet Archive, KTB eKitap.
- **Browser Automation**: Playwright Chromium session pooling with anti-automation masking and stealth evasion.
- **Document Distillation**: Mozilla Readability to GFM Markdown, HTML tables, Office, and EPUB extraction.
- **Network Security**: Strict SSRF perimeter guard, automated DNS validation, and politeness rate limiting.

---

## 3. Tech Stack

- **Data Ingestion (Python 3.12):** `pandas`, `pyarrow` (Parquet), `sqlite3` (Ledger), `httpx` (Async/Sync HTTP).
- **Microservice (Node.js 22+ / TypeScript):** Express, Zod (Schema Validation), Cheerio, Playwright, Node:SQLite.
- **Storage Target:** MinIO / Cloudflare R2 / AWS S3 (for the Parquet Data Lake), local filesystem for staging.
- **Orchestration:** Docker, Docker Compose, RabbitMQ (Planned).

---

## 4. Directory Structure

```text
protokol-7/
├── pipelines/               # [Python] Massive Data Ingestion Pipelines
│   ├── api_stream/          # Active scrapers (doaj, dergipark)
│   └── shared/              # Shared Sharder (Parquet) and Ledger (SQLite) base classes
├── src/                     # [Node.js] HTTP REST server, MCP, Actors, Browser pool
│   ├── actors/              # 31 specialized extraction actors
│   ├── browser/             # Playwright Chromium pool & stealth
│   ├── mcp/                 # Model Context Protocol server
│   └── network/             # SSRF guard & politeness limiter
├── data/
│   ├── catalogs/            # SQLite State Ledgers (*.sqlite)
│   └── parquets/            # Staging area for generated Parquet shards
├── docs/                    # Architecture and AI Agent Plans
├── .agents/                 # AI Agent Skills and Protocols (e.g., data-ingestion-protocol)
└── tests/                   # Node.js and Python test suites
```

---

## 5. Getting Started

### Python Pipelines (Stage 1 Ingestion)
```bash
# 1. Setup virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements-python.txt

# 3. Run unit tests
python -m pytest pipelines/api_stream/dergipark -v

# 4. Start a live pipeline (e.g., DOAJ or DergiPark)
python -u pipelines/api_stream/dergipark/orchestrator.py \
  --all \
  --batch-size 1000 \
  --max-shard-records 50000 \
  2>&1 | tee -a logs/dergipark.log
```

### Node.js Microservice
```bash
# 1. Install dependencies
npm install

# 2. Run static analysis and tests
npm run lint
npm test

# 3. Start HTTP REST & MCP server
npm start
```
The interactive Swagger API documentation will be available at `http://localhost:4000/docs`.

---

## 6. AI Agent Protocols

Protokol-7 is built in collaboration with advanced AI agents. The repository enforces strict rules via:
- `AGENTS.md` and `GEMINI.md`: Project rules and cognitive routing for agents.
- `.agents/skills/ops/data-ingestion-protocol/SKILL.md`: The mandatory workflow protocol agents must follow when adding a new data source to ensure architectural consistency.
