# Document provenance and immutable artifacts

Status: accepted design; runtime implementation follows in phases 2-3.

Canonical UTF-8 text is identified by SHA-256 and an explicit canonicalization version. Raw artifact checksums remain separate, and every source acquisition keeps its own occurrence with source record ID, URI, acquisition time and raw artifact ID. This preserves multiple source origins without counting identical text as unrelated documents. The existing TextNormalizer uses NFKC; the plan's example nfc-lf-strip-v1 label must not be attached to that output. A policy change requires a new version and explicit identity migration.

Immutable artifacts, SQLite manifests and snapshot records remain the storage and lineage model. DVC/lakeFS and OpenLineage add separate operational systems without a current multi-machine requirement. Release state is separate from artifact upload: all five schema, quality, privacy, contamination and rights gates must pass for the same snapshot before an atomic release transition. Unknown rights and unchecked privacy remain unresolved gates. Source descriptor permissions are declarations until middleware enforces them.

The v1 schemas in contracts/schemas are repository-authored from the architecture plan. They do not imply compatibility with an unavailable external Blueprint schema bundle. Existing camelCase TrainingDatasetManifest remains unchanged; the snake_case run manifest and release contracts are separate envelopes requiring explicit mapping in the later runtime implementation.
