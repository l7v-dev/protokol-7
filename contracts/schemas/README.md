# Blueprint v1 repository contracts

These Draft 2020-12 schemas are derived from the repository architecture plan. No original external Blueprint schema distribution is available in the repository; these files define local contracts rather than claiming external conformance.

- `document.v1`: canonical text identity, rights/privacy/split status and all source occurrences. Approved rights require license, evidence URI, review time and allowed purposes.
- `manifest.v1`: a completed run envelope with UUIDv4 run ID, trace ID, configuration hash, counts, quality, errors and artifact references. It is separate from the current camelCase TrainingDatasetManifest.
- `log-event.v1`: metadata log envelope with matched DEBUG/5, INFO/9, WARN/13 and ERROR/17 severity, trace/span IDs and content_capture=false. A body string still requires emitter-level content filtering.
- `source.v1`: references the existing source-descriptor schema. Optional verification_level, evidence, streams and agent_permissions preserve compatibility with existing sources. Source rights use approved/pending/denied; document rights use approved/unknown/blocked. Later mapping must make this distinction explicit.
- `dataset-release.v1`: candidate/released/withdrawn envelope. Released requires all five boolean gates and reviewer identity/time. Schema checks do not attest the truth of gate evidence.

Schemas require a Draft 2020-12 validator with format checking enabled and local relative $ref resolution. Agent permission defaults are annotations; JSON Schema does not insert defaults or enforce IAM. The current register-source CLI only checks top-level required fields, so it does not provide full schema validation. Runtime tables, API/MCP integration and release enforcement are later phases.

Validation: `uv run --no-project --with 'jsonschema[format]' --with pyyaml python tests/blueprint_contracts_test.py`. The packages are used in an isolated uv environment and are not project runtime dependencies.
