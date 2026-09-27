# src/actors/documents — Document and Archive Extraction Actors

Actors that parse binary document formats and compressed archives
from local file paths or base64-encoded payloads.
No HTTP requests are made; input is always a file buffer or path.

## Actors

| File | Class | ActorType | Input Formats | Notes |
|---|---|---|---|---|
| `pdf-document-actor.ts` | `PdfDocumentActor` | `pdf-document` | PDF | Text streams, page boundaries, metadata. Falls back to OCR via `src/ocr/` for scanned PDFs. |
| `epub-extractor-actor.ts` | `EpubExtractorActor` | `epub-extractor` | EPUB 2/3 | Dublin Core metadata, TOC, spine-ordered GFM markdown. |
| `document-extractor-actor.ts` | `DocumentExtractorActor` | `document-extractor` | DOCX, XLSX, CSV, TSV, TXT | OpenXML parsing without external dependencies. |
| `archive-extractor-actor.ts` | `ArchiveExtractorActor` | `archive-extractor` | ZIP, TAR, GZ, RAR | Zip Slip and Zip Bomb guards enforced via `src/archive/`. |

## Security

- Zip Slip path traversal: blocked by `ArchiveGuard` (`src/archive/archive-guard.ts`)
- Zip Bomb volumetric: blocked by size, count, and compression ratio limits
- SSRF: not applicable — all inputs are local files or base64 payloads

## REST Endpoints

`POST /api/v1/pdf-document`
`POST /api/v1/epub`
`POST /api/v1/document-extractor`
`POST /api/v1/archive-extractor`

## MCP Tools

`extract_pdf`, `extract_epub`, `extract_document`, `extract_archive`
