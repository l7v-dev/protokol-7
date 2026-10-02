# bioRxiv & medRxiv Life Sciences Preprint Extractor

`BiorxivActor` interfaces with Cold Spring Harbor Laboratory (CSHL) bioRxiv and medRxiv REST APIs for open-access biology, medical, and clinical preprints, author institutions, versions, abstracts, and published peer-reviewed journal mappings.

## Scope and Invariants

- **Multi-Server Coverage**: Supports both `biorxiv` (biology, genomics, neuroscience, biochemistry, ecology) and `medrxiv` (clinical medicine, epidemiology, public health, infectious diseases, oncology, psychiatry).
- **Date Interval & Subject Filtering**: Queries preprints across ISO date ranges (`YYYY-MM-DD/YYYY-MM-DD`) and subject categories with cursor-based pagination.
- **Direct DOI Lookup**: Supports direct manuscript retrieval and multi-version tracking via DOI (e.g. `10.1101/2026.01.01.697424`).
- **Client-Side Query Search**: Keyword matching across preprint titles, abstracts, and author names.
- **Relational Ledger Persistence**: Shards and records are tracked in transactional SQLite ledger databases (`data/catalogs/biorxiv_catalog.sqlite`) with central catalog dual-synchronization.
- **Network Invariants**: Strict SSRF DNS validation (`SSRFGuard.validateUrlWithDns`), CSHL rate limit adherence (0.6s minimum interval), timeout enforcement, zero disk footprint on microservice queries.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `server` | `"biorxiv" \| "medrxiv"` | `"biorxiv"` | Target preprint repository |
| `doi` | `string` | `""` | Direct preprint DOI to retrieve (e.g. `10.1101/2026.01.01.697424`) |
| `interval` | `string` | `"2026-01-01/2026-10-02"` | Date interval format `YYYY-MM-DD/YYYY-MM-DD` |
| `category` | `string` | `""` | Subject category filter (e.g. `neuroscience`, `bioinformatics`) |
| `query` | `string` | `""` | Keyword search query for title and abstract matching |
| `cursor` | `number` | `0` | Pagination cursor offset |
| `limit` | `number` | `30` | Maximum results to return (1-100) |
| `targetUrl` | `string` | `""` | Direct custom or proxy CSHL API endpoint URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/biorxiv` (or bare alias `POST /biorxiv`)
- **MCP Tool**: `query_biorxiv`
