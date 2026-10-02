# PubMed & PMC Biomedical Literature Extractor

`PubmedActor` interfaces with NCBI E-utilities (`esearch`, `esummary`, `efetch`) and the BioC API for peer-reviewed biomedical literature, MEDLINE records, structured abstracts, MeSH descriptor headings, author rosters, and open-access PubMed Central full text articles.

## Scope and Invariants

- **Multi-Mode Actions**: Supports `search` (Entrez query translation), `summary` (fast JSON UID metadata extraction), `fetch` (full XML extraction with structured abstracts and MeSH headings), and `bioc` (PMC passage text extraction).
- **MeSH Term Indexing**: Major topic headings are marked with asterisks (`*`) in normalization to distinguish primary medical subjects from subsidiary descriptors.
- **Structured Abstracts**: Background, Methods, Results, and Conclusions sections are preserved and synthesized into structured GFM Markdown.
- **Relational Ledger Persistence**: Shards and records are tracked in SQLite ledger databases (`data/catalogs/pubmed_catalog.sqlite`) with schema normalization.
- **Network Invariants**: Strict SSRF DNS validation (`SSRFGuard.validateUrlWithDns`), rate limiting (3 req/s without API key, 10 req/s with API key), timeout enforcement, zero disk footprint on microservice queries.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `"search" \| "summary" \| "fetch" \| "bioc"` | `"search"` | Query action mode |
| `query` | `string` | `""` | Search query expression (e.g. `CRISPR Cas9 oncology`) |
| `pmids` | `string[]` | `[]` | List of PubMed IDs (PMIDs) to fetch or summarize |
| `pmcids` | `string[]` | `[]` | List of PubMed Central IDs (PMCIDs) to fetch |
| `maxResults` | `number` | `20` | Maximum results to return (1-100) |
| `apiKey` | `string` | `""` | Optional NCBI API key for elevated rate limits (10 req/s) |
| `targetUrl` | `string` | `""` | Direct custom or proxy NCBI API endpoint URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/pubmed` (or bare alias `POST /pubmed`)
- **MCP Tool**: `query_pubmed`
