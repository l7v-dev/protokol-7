# Developer Knowledge & Multi-Language Coding Harvester Walkthrough

This document records the architectural design, implementation details, test coverage, and operational validation for **Set 5 (Developer Knowledge Pack)** of the protokol-7 actor suite:
1. `devdocs`: DevDocs official API documentation and search index harvester across 100+ technologies.
2. `rosetta-code`: Rosetta Code multi-language algorithm comparison harvester across 800+ programming languages.
3. `papers-with-code`: Papers With Code and Hugging Face Papers machine learning papers, official GitHub repositories, and benchmarks harvester.

---

## 1. Architectural Architecture & Interface Contracts

### 1.1 Type Definitions (`src/api/types.ts`)
- Added `"devdocs" | "rosetta-code" | "papers-with-code"` to the `ActorType` union.
- Defined:
  - `DevDocMeta`, `DevDocEntry`, `DevDocsActorTaskOptions`, `DevDocsActorResult`.
  - `RosettaCodeImplementation`, `RosettaCodeSearchResultItem`, `RosettaCodeTaskDetails`, `RosettaCodeActorTaskOptions`, `RosettaCodeActorResult`.
  - `PapersWithCodeRepo`, `PapersWithCodePaperRecord`, `PapersWithCodeSearchResultItem`, `PapersWithCodeActorTaskOptions`, `PapersWithCodeActorResult`.
- Mapped all option structures into `ActorTask["options"]`.

### 1.2 Actor Implementations (`src/actors/corpus/`)
- `devdocs-actor.ts`:
  - `list_docs`: Retrieves complete docset registry (`https://devdocs.io/docs/docs.json`) with filtering by technology type and keyword.
  - `search`: Queries JSON search indexes (`https://documents.devdocs.io/{doc}/index.json`) for instant symbol/subpath resolution.
  - `entry`: Retrieves pure documentation HTML (`https://documents.devdocs.io/{doc}/{path}.html`), strips noise and ads, and converts to clean GFM Markdown with preserved fenced code blocks.
- `rosetta-code-actor.ts`:
  - `task`: MediaWiki parse query on programming tasks with language-specific section filtering and multi-language code block extraction.
  - `search`: MediaWiki search across all algorithm tasks.
  - `languages`: Enumeration of programming languages via MediaWiki category members.
  - `random`: Random algorithm discovery for automated corpus ingestion.
- `papers-with-code-actor.ts`:
  - `paper`: Canonical arXiv ID resolution, AI summary extraction, author enumeration, and automated GitHub code repository harvesting.
  - `trending` / `daily`: Daily trending machine learning research papers with community upvotes and benchmarks.
  - `search`: Keyword search across scientific paper catalogs.

---

## 2. Integration & Registrations

- **Actor Barrel**: Re-exported in alphabetical order in `src/actors/corpus/index.ts` and `src/index.ts`.
- **Actor Manifests**: Configured input and output JSON schemas, tags, descriptions, and MCP tools (`query_devdocs`, `query_rosetta_code`, `query_papers_with_code`) in `src/actors/actor-manifests.ts`. Total registered MCP tools: 71.
- **Actor Registry**: Registered in `src/actors/actor-registry.ts`.
- **HTTP Routing**: Registered routes `POST /api/v1/devdocs`, `POST /api/v1/rosetta-code`, `POST /api/v1/papers-with-code` and root aliases in `src/api/server.ts`.
- **OpenAPI 3.1.0**: Documented under `Corpus - Developer Knowledge` tag in `src/api/openapi-spec.ts`.
- **MCP Server**: Task options mapped in `src/mcp/protokol-mcp-server.ts`.
- **Documentation & Examples**:
  - `docs/actors/devdocs.md`, `docs/actors/rosetta-code.md`, `docs/actors/papers-with-code.md`.
  - `examples/actors/devdocs.json`, `examples/actors/rosetta-code.json`, `examples/actors/papers-with-code.json`.
  - Catalog table updated in `src/actors/README.md`.

---

## 3. Verification & Test Coverage

- **TypeScript Compilation**: `npm run typecheck` (`tsc --noEmit`) completed with 0 errors.
- **Unit & Mock Integration Suites**:
  - `tests/devdocs-actor.test.ts`: 7 tests passing.
  - `tests/rosetta-code-actor.test.ts`: 7 tests passing.
  - `tests/papers-with-code-actor.test.ts`: 7 tests passing.
  - `tests/protokol-mcp-server.test.ts`: 26 tests passing (verifying 71 MCP tools).
  - `tests/server.test.ts`: 46 tests passing (verifying all HTTP routes).
- **Deterministic Verification Pipeline**: Passes all 6 gates (`npm run verify`).
