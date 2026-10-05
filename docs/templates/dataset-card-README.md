# {{dataset_name}}

Version: {{version}}
Snapshot: {{snapshot_id}}

## Source and processing

Run: {{run_id}}
Trace: {{trace_id}}
Commit: {{git_commit_or_not_recorded}}
Language: {{language_or_unavailable}}
Task: {{intended_task}}

Record source IDs, acquisition dates, normalization policy versions and filtering procedures.
See the registry lineage endpoint for persisted document occurrences and source evidence.

## License and intended use

License group: {{declared_license_group}}
License evidence: {{rights_evidence_uri}}
Allowed purposes: {{reviewed_purposes}}

A license declaration does not pass the rights gate. Review evidence before release.

## Statistics and splits

See statistics.json for records, bytes, token estimates, split counts, language distribution
and quality metrics. Unmeasured fields must be unavailable. File-path record counts may be estimates.
See checksums.sha256 for shard integrity.

## Usage

Read manifest.json, select the intended split and verify shard checksums before training.
Check the registry release state and review evidence for this exact snapshot.

## Release review and limitations

Creation state: candidate. Required gates: schema, quality, privacy, contamination and rights.
Record each passing gate's evidence URI, reviewer identity and timestamp against the exact manifest SHA-256.
The registry stores later release decisions; creation artifacts remain immutable.

Document known coverage gaps, PII review limitations, contamination checks and prohibited uses.
