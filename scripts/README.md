# scripts/ — Automation and Dev-Ops Scripts

All scripts are invoked through `npm run <command>` defined in `package.json`.
Python scripts require `python3` with dependencies listed in `scripts/corpus_pipeline/requirements.txt`.

## TypeScript / Node.js Scripts

| File | npm Command | What it does |
|---|---|---|
| `verify-pipeline.mjs` | `npm run verify` | 6-stage deterministic verification: lint, naming, typecheck, build, test, SCA. Run before any commit. |
| `doctor.mjs` | `npm run doctor` | Checks runtime environment: Node version, playwright, SQLite, disk space, env vars. |
| `checkpoint.mjs` | `npm run checkpoint` | Creates a timestamped git stash + tag snapshot. `npm run rollback` restores the last checkpoint. |
| `generate-connectome.mjs` | `npm run connectome` | Scans `src/` and generates `context/connectome.md` — the actor/module dependency routing map. |
| `consolidate-memory.mjs` | `npm run consolidate` | Moves completed tasks older than 5 entries from `TASKS.md` into `archive/`. |
| `omega-memory.mjs` | `npm run memory "<concept>"` | Semantic search over `context/` and `docs/` for a given concept. Used by AI agents. |
| `omega-mcp-server.mjs` | `npm run mcp` | Starts a local MCP server exposing `omega-memory` and project context tools to AI clients. |
| `sca-check.mjs` | `npm run sca` | Software Composition Analysis — audits `node_modules` for known CVEs via `npm audit`. |
| `telemetry-logger.mjs` | _(internal)_ | Append-only telemetry sink writing structured JSON lines to `archive/telemetry.jsonl`. |
| `pipedream-cli.mjs` | `npm run pipedream` | Pipedream Connect CLI: verify token, list accounts, generate MCP endpoint config. |
| `scaffold-actor.mjs` | `npm run make:actor` | Actor scaffolding generator: creates actor class, test, JSON example, and barrel export. |

## Python Scripts (`scripts/corpus_pipeline/`)

Python 3 pipeline for large-scale offline Wikipedia/corpus processing.
Install dependencies: `pip install -r scripts/corpus_pipeline/requirements.txt`

| File | npm Command | What it does |
|---|---|---|
| `orchestrator.py` | `npm run corpus:pipeline` | Master CLI: download → clean → pack → store → verify → purge cycle for corpus shards. |
| `cleaner.py` | _(sub-process)_ | Unicode NFKC normalization and Gopher/FineWeb quality filtering of raw text. |
| `packer.py` | _(sub-process)_ | Streaming ZSTD-6 Parquet packing with RowGroup chunking via PyArrow. |
| `metadata_catalog.py` | _(sub-process)_ | SQLite shard ledger, replica tracking, and training manifest exporter. |
| `verifier.py` | _(sub-process)_ | 4-point verification gate: SHA-256, row count, schema, zero-raw purge. |
| `test_corpus_pipeline.py` | `npm run test:corpus` | Unit and integration tests for all corpus pipeline stages. |

## Quick Reference

```
npm run verify          # always before committing
npm run doctor          # diagnose environment issues
npm run checkpoint      # snapshot before risky changes
npm run connectome      # regenerate context/connectome.md
npm run consolidate     # archive old TASKS.md entries
npm run memory "actor"  # search project knowledge base
```
