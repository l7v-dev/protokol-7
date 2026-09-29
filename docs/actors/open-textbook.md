# Open Textbook Library Harvester

`OpenTextbookActor` extracts peer-reviewed open textbooks, multi-format download links (PDF, EPUB, Online), table of contents, academic peer reviews, and curricular subject categories from Open Textbook Library (University of Minnesota, `open.umn.edu/opentextbooks`).

## Scope and Invariants

- **Accredited Curricular Textbooks**: Harvests open textbooks reviewed by faculty across higher education institutions in North America.
- **Multi-Format Ingestion**: Detects and extracts direct download links for PDF, EPUB, LMS Common Cartridge, and Online interactive reading interfaces.
- **Academic Peer Reviews**: Extracts faculty review ratings (1-5 scale), reviewer credentials, affiliated institutions, review dates, and full analytical critiques.
- **Subject Taxonomies**: Catalogs university subject divisions (Business, Computer Science, Education, Engineering, Humanities, Law, Mathematics, Medicine, Natural Sciences, Social Sciences).
- **Network Invariants**: Strict SSRF DNS-pinning validation (`SSRFGuard.validateUrlWithDns`), timeout enforcement via `AbortController`, zero disk footprint.

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `action` | `"book" \| "search" \| "subjects"` | `"book"` | Extraction mode |
| `bookId` | `string \| number` | `""` | Textbook identifier or slug (e.g. `calculus-volume-1`, `45`) |
| `query` | `string` | `""` | Search keyword query |
| `subject` | `string` | `""` | Academic subject slug (e.g. `mathematics`, `computer-science`) |
| `limit` | `number` | `20` | Maximum results to return |
| `targetUrl` | `string` | `""` | Direct Open Textbook Library textbook or subject URL |
| `timeoutMs` | `number` | `30000` | Network request timeout in milliseconds |

## Endpoints

- **HTTP REST**: `POST /api/v1/open-textbook` (or bare alias `POST /open-textbook`)
- **MCP Tool**: `query_open_textbook`
