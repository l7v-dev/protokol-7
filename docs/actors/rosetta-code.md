# Rosetta Code Multi-Language Algorithm Harvester

`RosettaCodeActor` extracts programming tasks, multi-language algorithm implementations, and language catalogs from Rosetta Code (`rosettacode.org`) using the MediaWiki API (`/w/api.php`) and structured HTML parsing.

## Scope and Invariants

- **Task Extraction**: Fetches task description and code implementations across 800+ programming languages.
- **Language Filtering**: When a target `language` is specified, filters and returns only the code block and explanation for that programming language.
- **Search Discovery**: Searches programming tasks and algorithms using MediaWiki search queries (`action=query&list=search`).
- **Language Index**: Enumerates all supported programming languages via `Category:Programming_Languages`.
- **Random Discovery**: Retrieves random tasks for automated corpus ingestion.
- **Network Invariants**: Strict SSRF DNS-pinning validation (`SSRFGuard.validateUrlWithDns`), timeout enforcement via `AbortController`, zero disk footprint.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `"task" \| "search" \| "random" \| "languages"` | `"task"` | Extraction mode |
| `task` | `string` | `"100 doors"` | Programming task name or title |
| `language` | `string` | `""` | Optional programming language filter (e.g. `Python`, `Rust`, `C++`) |
| `query` | `string` | `""` | Search query for task discovery |
| `limit` | `number` | `10` | Maximum implementations or search items to return |
| `targetUrl` | `string` | `""` | Direct Rosetta Code wiki URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/rosetta-code` (or bare alias `POST /rosetta-code`)
- **MCP Tool**: `query_rosetta_code`
