# LibreTexts STEM & Engineering Textbook Harvester

`LibreTextsActor` extracts peer-reviewed open textbooks, course chapters, hierarchical table of contents, and mathematical/scientific formulas across LibreTexts discipline libraries (`libretexts.org`).

## Scope and Invariants

- **Multi-Discipline Coverage**: Supports all primary LibreTexts discipline subdomains (`chem`, `phys`, `math`, `bio`, `eng`, `med`, `stats`, `geo`, `socialsci`, `human`, `biz`, `workforce`, `espanol`, `k12`).
- **LaTeX / MathJax Formula Preservation**: Detects MathJax and LaTeX formula elements (`.mt-math`, `.MathJax`, `script[type="math/tex"]`, `data-tex`) and preserves them cleanly as standard LaTeX formulas (`$...$`).
- **Hierarchical Table of Contents**: Fetches chapter subpages and book structure via CXone Expert / Deki REST API (`/@api/deki/pages/{id}/subpages`) and HTML table of contents listings.
- **Search Discovery**: Queries LibreTexts search index (`/@api/deki/site/query?q=...`) to locate textbooks, topics, and problem sets.
- **Network Invariants**: Strict SSRF DNS-pinning validation (`SSRFGuard.validateUrlWithDns`), timeout enforcement via `AbortController`, zero disk footprint.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `"page" \| "search" \| "subpages" \| "toc"` | `"page"` | Extraction mode |
| `library` | `string` | `"chem"` | Discipline library subdomain (`chem`, `phys`, `math`, `bio`, `eng`, etc.) |
| `pageId` | `string \| number` | `""` | Numerical page identifier or API path in LibreTexts |
| `path` | `string` | `""` | Relative path within discipline library |
| `query` | `string` | `""` | Search keyword query |
| `limit` | `number` | `20` | Maximum results to return |
| `includeHtml` | `boolean` | `false` | Whether to include raw sanitized HTML alongside Markdown |
| `targetUrl` | `string` | `""` | Direct LibreTexts chapter or book URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/libretexts` (or bare alias `POST /libretexts`)
- **MCP Tool**: `query_libretexts`
