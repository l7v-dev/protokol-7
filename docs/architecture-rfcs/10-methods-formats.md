# 10 — Veri çekme yöntemleri ve format seçimleri
Yöntem ailesi desteği ayrı, source-specific operational adapter ayrı kayıt edilir. Her kayıt tasarım/geliştirildi/sample_tested/production/blocked durumuyla gösterilir. Aşağıdaki aileler kapsamdır; hepsinin kodu hazır değildir.

| Aile | Alt yöntemler | Temel kontrol |
|---|---|---|
| Bulk | dump, archive, export, manifest | hash, version, decompression budget |
| API | REST, read-only POST, GraphQL, async export | pagination, quota, schema |
| Scholarly | OAI-PMH, SRU/SRW, IIIF | token expiry, set/date, object rights |
| Feed/discovery | RSS/Atom, sitemap, JSON feed | dedup ID, temporal coverage |
| Web | static HTTP, JSON-LD/table, browser | source policy, SSRF, budget |
| Files | local/shared, Drive, SFTP/WebDAV, object storage | scope, version, checksum |
| Database | read-only SQL, snapshot, document/KV read | consistency, watermark |
| CDC/stream | authorized change log, webhook, SSE/WebSocket, broker | offsets, delete/tombstone, replay |
| Semantic/geo | SPARQL/RDF, STAC, OGC, GeoJSON | CRS/version, query limits |
| Repository | Git/release/artifact | revision, LFS scope, separate data license |
| Media/doc | PDF/Office/EPUB/OCR/ASR | sandbox, page/time alignment, confidence |
| Partner/synthetic | licensed delivery, annotations, model generation | provenance, rights, synthetic flag |

## Format rolleri
| Rol | Format seçenekleri | Kural |
|---|---|---|
| Ham koruma | kaynak bytes: JSON/XML/PDF/HTML/Office/media/archive | original MIME ve checksum; parsing ayrı |
| Yapılandırılmış ara | JSONL, Arrow, Parquet | schema version, typed null/date/list |
| Lake analitik | Parquet + isteğe bağlı Iceberg table | Iceberg export dosya biçimi değil |
| İnsan metni | TXT/Markdown | page refs/structure kaybı manifest'te |
| LLM | JSONL messages, text shards, Parquet chunk/dataset | model schema, split/rights/lineage |
| Tabular export | CSV/TSV, JSONL, Parquet | CSV nested types ve formula injection kontrolü |
| RDF/geo | Turtle/N-Triples/GeoJSON/GPKG | native semantics/CRS korunur |
| Media output | original file, timestamped transcript, page images | rights ve source alignment |

Format seçim API parametreleri: input auto veya explicit MIME; output_format; schema_version; compression; encoding; flatten_policy; partition_policy; max_file_bytes; purpose. Format aileleri source descriptor/capability tarafından kısıtlanır. CSV her nested veriyi kayıpsız temsil etmez; flatten/map kuralı açık olmalı. Parquet nested ve null type'larını korur; type promotion breaking schema gate'ine girer. Office formulas kaynakta korunabilir; exported değerin formula mı cached value mı olduğu belirtilir. Encoding UTF-8 output default; input detection confidence raporlanır. gzip/zstd/snappy seçimleri consumer compatibility ile doğrulanır.

Source complete kabulü request success değildir: pagination exhaustion, count reconciliation, rejected records, watermark ve partial run açıkça raporlanır. Delta sync delete events ve source version değişimini işler. HTTP ETag caching tek başına document version provenance yerine geçmez. Tüm pilotlar max requests/bytes/runtime/cost ile bounded olmalı.
