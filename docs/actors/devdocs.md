# DevDocs Documentation Harvester

`DevDocsActor` provides structured extraction, catalog discovery, and search index querying across 100+ developer documentation sets from DevDocs (`devdocs.io` and `documents.devdocs.io`).

## Scope and Invariants

- **Catalog Discovery**: Fetches full docset registry from `https://devdocs.io/docs/docs.json` with slugs, releases, categories, and homepage metadata.
- **Search Indexing**: Loads and queries JSON search index files (`https://documents.devdocs.io/{doc}/index.json`) for instant symbol/path lookups.
- **Full Entry Markdown**: Retrieves individual documentation HTML pages (`https://documents.devdocs.io/{doc}/{path}.html`), strips navigation and layout artifacts, and converts content into clean GitHub-Flavored Markdown.
- **Network Invariants**: Strict SSRF DNS-pinning validation (`SSRFGuard.validateUrlWithDns`), timeout enforcement via `AbortController`, zero disk footprint.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `"list_docs" \| "search" \| "entry"` | `"list_docs"` | Extraction mode |
| `doc` | `string` | `""` | Target docset slug (e.g. `rust`, `python~3.12`, `javascript`, `go`, `cpp`) |
| `path` | `string` | `""` | Relative path within docset (e.g. `book/ch01-00-getting-started`) |
| `query` | `string` | `""` | Search query for symbols, topics, or docset names |
| `category` | `string` | `""` | Filter docsets by technology category |
| `limit` | `number` | `20` | Maximum results to return |
| `targetUrl` | `string` | `""` | Direct DevDocs URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/devdocs` (or bare alias `POST /devdocs`)
- **MCP Tool**: `query_devdocs`
