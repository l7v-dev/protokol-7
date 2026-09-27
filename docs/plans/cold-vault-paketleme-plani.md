# Cold Vault / Fiziksel Depolama Cikarimi ve Paketleme Plani

Bu plan, `docs/protokol-cold-vault-mimari-sartnamesi.md` sartnamesine uygun olarak zstd Parquet shardlarini ve `manifest.json` egitim manifestolarini harici/cevrildisi (offline/cold vault) diskler icin Btrfs/SHA256SUMS formatinda paketleyen disariya aktarma motorunun, REST API rotalarinin ve MCP araclarinin gelistirilmesini tanimlar.

---

## 1. Hedefler ve Mimari Ilkeler

- **Standart Disk Hiyerarsisi:**
  `volumeRoot/`
  ├── `volume.json` (UUID, label, schemaVersion, createdAt)
  ├── `checksums/SHA256SUMS` (GNU coreutils uyumlu SHA-256 ledger)
  ├── `datasets/{datasetName}/{version}/` (shard parquet dosyalari ve manifest.json)
  └── `logs/export_audit.jsonl` (Yerel disk denetim defteri)

- **Kriptografik Butunluk ve Atomiklik:**
  - Kopyalama sirasinda canli streaming SHA-256 hesaplama ve veritabanindaki `dataset_shards.sha256_hash` ile karsilastirma.
  - Eslesmeyen durumlarda gecici dosyanin aninda silinmesi ve operasyonun hata vermesi.
  - `storage_replicas` tablosuna `local_cold_vault` saglayici kaydinin `VERIFIED` statunde islenmesi.

- **Sistem Sinirlari ve API:**
  - Cekirdek motor: `src/vault/cold-vault-exporter.ts`, `src/vault/types.ts`.
  - HTTP Kontrolcusu: `src/core/vault-router.ts`.
  - Sunucu rotalari: `POST /api/v1/vault/export`, `POST /api/v1/vault/verify`, `GET /api/v1/vault/inspect`.
  - MCP Araclari: `export_cold_vault`, `verify_cold_vault` (toplam 41 arac).
  - OpenAPI 3.1.0: `Cold Vault` etiketi ve semalari.

---

## 2. Asamalar

### Faz 1: Cekirdek Cold Vault Motoru ve Tipleri
- `src/vault/types.ts`: `VolumeInfo`, `ColdVaultExportOptions`, `ExportedShardReceipt`, `ColdVaultExportReceipt`, `VolumeVerificationResult`.
- `src/vault/cold-vault-exporter.ts`: `ColdVaultExporter` sinifi (`exportDataset`, `verifyVolume`, `inspectVolume`).
- `src/vault/index.ts`: Barrel export.

### Faz 2: HTTP Kontrolcusu ve REST Rotalari
- `src/core/vault-router.ts`: `VaultRouter` sinifi (`handleExport`, `handleVerify`, `handleInspect`), path traversal savunmasi ve `SelfHealingError` sozlesmesi.
- `src/core/server.ts`: Rotalarin baglanmasi (`/api/v1/vault/*`).

### Faz 3: MCP Araclarinin Entegrasyonu
- `src/mcp/protokol-mcp-server.ts`: `export_cold_vault` ve `verify_cold_vault` araclarinin eklenmesi (39 -> 41 arac).
- `tests/protokol-mcp-server.test.ts`: Arac sayisi guncellemesi (41 arac).

### Faz 4: OpenAPI 3.1.0 Semasi
- `src/core/openapi-spec.ts`: `Cold Vault` etiketi ve `/api/v1/vault/*` semalarinin eklenmesi.

### Faz 5: Entegrasyon Testleri ve Dogrulama
- `tests/cold-vault-exporter-and-api.test.ts`: Shard paketleme, SHA256SUMS uretimi, replica kaydi, manipule dosya tespiti, REST ve MCP uctan uca testleri.
- `context/architecture-schema.md`: Yeni bilesenlerin eklenmesi.
- 6 asamali dogrulama hatti (`npm run verify`), Biome lint, naming check ve `npm test`.

### Faz 6: Dokumantasyon ve Teslimat
- `docs/walkthroughs/cold-vault-paketleme-walkthrough.md`.
- `TASKS.md` guncellemesi.
- Git commit convention v1.0 ile commit.
