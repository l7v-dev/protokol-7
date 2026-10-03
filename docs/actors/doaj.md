# DOAJ (Directory of Open Access Journals) Extractor

`DoajActor` interfaces with the Directory of Open Access Journals (DOAJ) REST API v2 for peer-reviewed open access articles, journals, metadata, abstracts, licenses, and full-text links across all multidisciplinary academic fields.

## Scope and Invariants

- **Multidisciplinary Coverage**: Queries 20,000+ peer-reviewed open access journals and 10+ million articles spanning physical sciences, technology, medicine, social sciences, arts, and humanities.
- **Action Modes**: Supports article search (`search_articles`), journal search (`search_journals`), and direct article retrieval (`get_article`) by unique DOAJ ID.
- **Rich Metadata Extraction**: Parses DOI, P-ISSN, E-ISSN, journal title, publisher, publication year, multilingual text, author affiliations, keywords, LCC/DDC subject terms, and full-text access URLs.
- **Relational Ledger Persistence**: Shards and records are tracked in transactional SQLite ledger databases (`data/catalogs/doaj_catalog.sqlite`) with central catalog dual-synchronization (`data/catalog.sqlite`).
- **Network Invariants**: Strict SSRF DNS validation (`SSRFGuard.validateUrlWithDns`), rate-limited polite requests (min 0.25s interval), exponential backoff on HTTP 429/5xx, and zero disk footprint on microservice queries.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `"search_articles" \| "search_journals" \| "get_article"` | `"search_articles"` | Query operation type |
| `query` | `string` | `""` | Search query or keyword syntax (e.g. `quantum computing`) |
| `articleId` | `string` | `""` | Unique DOAJ article ID for direct article retrieval |
| `page` | `number` | `1` | 1-indexed page number for pagination |
| `pageSize` | `number` | `20` | Number of records to return per page (1-100) |
| `sort` | `string` | `""` | Optional sort order (e.g. `year:desc`) |
| `targetUrl` | `string` | `""` | Direct custom or proxy DOAJ API endpoint URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/doaj` (or bare alias `POST /doaj`)
- **MCP Tool**: `query_doaj`
