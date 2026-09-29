# Papers With Code & Hugging Face Papers Harvester

`PapersWithCodeActor` extracts machine learning research papers, abstracts, official GitHub code implementations, benchmark datasets, and trending research from Papers With Code (`paperswithcode.com`) and Hugging Face Papers (`huggingface.co/papers`).

## Scope and Invariants

- **Paper Extraction**: Resolves arXiv IDs (e.g. `1706.03762`), fetches structured paper metadata, AI summaries, authors, published dates, and scrapes associated official GitHub code repositories.
- **Trending & Daily Research**: Fetches daily trending machine learning research papers with community upvotes and links.
- **Search Discovery**: Searches paper catalogs by keyword or domain query.
- **Resilient Fallback**: Automatically bridges `paperswithcode.com` URLs to canonical Hugging Face Papers metadata endpoints.
- **Network Invariants**: Strict SSRF DNS-pinning validation (`SSRFGuard.validateUrlWithDns`), timeout enforcement via `AbortController`, zero disk footprint.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `"paper" \| "search" \| "trending" \| "daily"` | `"paper"` | Extraction mode |
| `paper` | `string` | `""` | Paper title or slug |
| `arxivId` | `string` | `"1706.03762"` | Canonical arXiv paper identifier |
| `query` | `string` | `""` | Search query for research papers |
| `limit` | `number` | `10` | Maximum paper records to return |
| `targetUrl` | `string` | `""` | Direct Papers With Code or Hugging Face Papers URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/papers-with-code` (or bare alias `POST /papers-with-code`)
- **MCP Tool**: `query_papers_with_code`
