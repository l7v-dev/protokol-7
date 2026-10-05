# Cold Vault Packaging — Implementation Walkthrough

**Task**: `cold-vault-paketleme`
**Branch**: `feature/core-sqlite-registry`
**Spec**: `docs/protokol-cold-vault-mimari-sartnamesi.md`
**Plan**: `docs/plans/cold-vault-paketleme-plani.md`

---

## Implementation Sequence

### Phase 1 — Type Contracts (`src/vault/types.ts`)

Defined six standalone interfaces with no circular imports:

| Interface | Purpose |
|---|---|
| `VolumeInfo` | Metadata returned by `volume.json` and `inspectVolume()`. Fields: `volumeId`, `label`, `createdAt`, `btrfsLayout`, `sizeBytes`. |
| `ColdVaultExportOptions` | Input contract for `exportDataset()`. Fields: `datasetName`, `volumeRoot`, `version?`, `snapshotId?`. |
| `ExportedShardReceipt` | Per-shard result: `shardId`, `destPath`, `sha256`, `sizeBytes`. |
| `ColdVaultExportReceipt` | Aggregate export result: `datasetName`, `version`, `shards[]`, `manifestPath`, `sha256sumsPath`, `exportedAt`. |
| `VolumeVerificationItem` | Per-file verification result: `relativePath`, `status` (`ok`/`missing`/`tampered`), `expected`/`actual` hashes. |
| `VolumeVerificationResult` | Aggregate audit: `volumeRoot`, `healthy`, `items[]`, `verifiedAt`. |

### Phase 2 — Exporter Engine (`src/vault/cold-vault-exporter.ts`)

**`ColdVaultExporter`** — five public methods:

**`initVolume(volumeRoot, label?)`**
- Creates the standard Btrfs-aligned directory layout:
  ```
  <volumeRoot>/
    volume.json          -- self-describing identity file
    checksums/           -- SHA256SUMS ledger directory
    datasets/            -- dataset shard trees
    logs/                -- append-only audit log
  ```
- `volume.json` contains `volumeId` (random UUID), `label`, `createdAt`, `btrfsLayout: true`.
- Idempotent: skips creation if `volume.json` already exists.

**`exportDataset(options)`**
- Resolves shard records from SQLite (`listDatasetShards`).
- Falls back to `getDatasetSnapshot` if `snapshotId` is specified.
- Copies shard files to `datasets/{name}/{version}/` using streaming read+write with concurrent SHA-256 computation.
- Validates copied file hash against stored DB hash — throws on mismatch.
- Appends every shard to `checksums/SHA256SUMS` (format: `<sha256>  <relpath>`).
- Copies `manifest.json` snapshot if available.
- Records a `storage_replicas` entry per shard with `storage_provider: 'local_cold_vault'`, `remote_uri: 'file://<destPath>'`, `sync_status: 'VERIFIED'`.
- Appends JSON audit line to `logs/export_audit.jsonl`.

**`verifyVolume(volumeRoot)`**
- Parses `checksums/SHA256SUMS` line-by-line.
- Re-computes SHA-256 for every listed file.
- Returns `VolumeVerificationResult` with per-file status (`ok` / `missing` / `tampered`).
- Sets `healthy: true` only when all items are `ok`.

**`inspectVolume(volumeRoot)`**
- Reads and parses `volume.json` as `VolumeInfo`.
- Returns `null` if file is absent (uninitialized volume).

**`computeSha256(filePath)` (private)**
- Node.js `createReadStream` piped through `crypto.createHash('sha256')`.
- Zero external dependencies, zero buffering of full file in memory.

### Phase 3 — HTTP Router (`src/core/vault-router.ts`)

`VaultRouter` exposes three endpoints:

| Method | Path | Handler |
|---|---|---|
| `POST` | `/api/v1/vault/export` | `handleExport` -- validates `datasetName`, calls `exportDataset()` |
| `POST` | `/api/v1/vault/verify` | `handleVerify` -- validates `volumeRoot`, calls `verifyVolume()` |
| `GET` | `/api/v1/vault/inspect` | `handleInspect` -- reads `volumeRoot` query param, calls `inspectVolume()` |

**Path traversal guard** (`validateVolumePath`):
- Rejects empty strings.
- Resolves to absolute path via `node:path`.
- Rejects paths containing `..` segments.
- Rejects paths resolving under: `/etc`, `/proc`, `/sys`, `/dev`, `/run`, `/boot`.
- Returns HTTP 403 `FORBIDDEN_PATH` on any violation.

All error responses follow the `SelfHealingError` contract (status + code + message fields).

### Phase 4 — Server Wiring (`src/core/server.ts`)

Added `VaultRouter` import and instantiation. Wired routes in `handleRequest`:

```
POST /api/v1/vault/export    -> vaultRouter.handleExport
POST /api/v1/vault/verify    -> vaultRouter.handleVerify
GET  /api/v1/vault/inspect   -> vaultRouter.handleInspect
```

### Phase 5 — MCP Tools (`src/mcp/protokol-mcp-server.ts`)

Added two tools to `getTools()`:

**`export_cold_vault`**: `datasetName` (required), `volumeRoot` (required), `version?`, `snapshotId?`.
Returns serialized `ColdVaultExportReceipt` as JSON text.

**`verify_cold_vault`**: `volumeRoot` (required).
Returns serialized `VolumeVerificationResult` as JSON text.

MCP tool count progression: 39 (scheduled jobs) -> 41 (cold vault).

### Phase 6 — OpenAPI Specification (`src/core/openapi-spec.ts`)

Added `Cold Vault` tag and three path entries to the OpenAPI 3.1.0 schema:
- `POST /api/v1/vault/export`
- `POST /api/v1/vault/verify`
- `GET /api/v1/vault/inspect`

### Phase 7 — Test Suite (`tests/cold-vault-exporter-and-api.test.ts`)

11 tests covering:
1. `initVolume` creates standard directory layout.
2. `exportDataset` packages shards, computes SHA256SUMS, records `storage_replicas`.
3. `verifyVolume` confirms volume integrity as healthy.
4. `verifyVolume` detects file corruption (SHA-256 mismatch -> `tampered` status).
5-9. REST endpoint coverage (export, verify, inspect, 400, 403 path traversal).
10-11. MCP tool coverage (`export_cold_vault`, `verify_cold_vault` via JSON-RPC).

### Phase 8 — Legacy Fix (`scripts/corpus_pipeline/storage/local_cold_vault.py`)

Fixed import path: `scripts.bigdata_pipeline` -> `scripts.corpus_pipeline` to align with the earlier cleanup directory rename.

---

## Verification Results

| Check | Result |
|---|---|
| Cold vault unit tests | 11/11 pass |
| MCP server tests | 10/10 pass |
| TypeScript compilation (`npm run build`) | 0 errors |
| Biome lint (`npm run lint`) | 225 files, 0 errors |
| Naming discipline (`npm run lint:naming`) | No banned terms |
| 6-tier pipeline (`npm run verify`) | PASS |
| Full test suite (`npm test`) | 497/497 pass, 76 suites |

---

## Architectural Invariants

- Zero external dependencies for vault packaging and checksums: only `node:crypto`, `node:fs`, `node:path`, `node:os`.
- Self-describing volumes: `volume.json` + `SHA256SUMS` + `logs/export_audit.jsonl` enable offline verification without network or server access.
- Two-tier catalog: every exported shard appears in both the volume SHA256SUMS ledger and the SQLite `storage_replicas` table.
- Atomic path validation: system directory guard checked at router layer before any I/O reaches the exporter.
- SelfHealingError contract: all HTTP error responses carry `status`, `code`, and `message` fields.
