# src/actors/corpus — LLM Training Data Source Actors

Actors that extract text from open-access academic, legal, governmental,
and cultural data sources for LLM pre-training corpus construction.
All sources are either public domain, CC-licensed, or government open data.

## Actors

| File | Class | ActorType | Source | License |
|---|---|---|---|---|
| `wikimedia-actor.ts` | `WikimediaActor` | `wikimedia` | Wikipedia REST API v1 | CC BY-SA |
| `openalex-actor.ts` | `OpenAlexActor` | `openalex` | OpenAlex Scholarly API | CC0 |
| `arxiv-actor.ts` | `ArxivActor` | `arxiv` | arXiv Export API (Atom 1.0) | CC BY |
| `stack-exchange-actor.ts` | `StackExchangeActor` | `stack-exchange` | Stack Exchange API v2.3 | CC BY-SA |
| `gutenberg-actor.ts` | `GutenbergActor` | `gutenberg` | Gutendex / Project Gutenberg | Public Domain |
| `europe-pmc-actor.ts` | `EuropePmcActor` | `europe-pmc` | Europe PMC REST API | Open Access |
| `ietf-rfc-actor.ts` | `IetfRfcActor` | `ietf-rfc` | IETF RFC Editor + Datatracker | IETF TLP |
| `openstax-actor.ts` | `OpenStaxActor` | `openstax` | OpenStax CMS/Wagtail API | CC BY |
| `mit-ocw-actor.ts` | `MitOcwActor` | `mit-ocw` | MIT OCW OpenSearch DSL | CC BY-NC-SA |
| `software-heritage-actor.ts` | `SoftwareHeritageActor` | `software-heritage` | Software Heritage Archive | Various |
| `dergipark-actor.ts` | `DergiParkActor` | `dergipark` | DergiPark OAI-PMH 2.0 | Open Access |
| `internet-archive-actor.ts` | `InternetArchiveActor` | `internet-archive` | archive.org Scraping API | Open |
| `clinical-trials-actor.ts` | `ClinicalTrialsActor` | `clinical-trials` | ClinicalTrials.gov API v2 | Public Domain |
| `open-fda-actor.ts` | `OpenFdaActor` | `open-fda` | openFDA REST API | Public Domain |
| `sec-edgar-actor.ts` | `SecEdgarActor` | `sec-edgar` | SEC EDGAR Submissions API | Public Domain |
| `court-listener-actor.ts` | `CourtListenerActor` | `court-listener` | CourtListener Free Law v4 | Public Domain |
| `eur-lex-actor.ts` | `EurLexActor` | `eur-lex` | EUR-Lex CELLAR SPARQL | Public Domain |
| `saglik-ekutuphane-actor.ts` | `SaglikEkutuphaneActor` | `saglik-ekutuphane` | TR Health Ministry e-library | TR Gov Open |
| `ktb-ekitap-actor.ts` | `KtbEkitapActor` | `ktb-ekitap` | TR Culture Ministry e-book | TR Gov Open |

## REST Endpoints

`POST /api/v1/<actor-type>` — e.g. `POST /api/v1/wikimedia`

## MCP Tools

`query_wikimedia`, `query_openalex`, `query_arxiv`, `query_stack_exchange`,
`query_gutenberg`, `query_europe_pmc`, `query_ietf_rfc`, `query_openstax`,
`query_mit_ocw`, `query_software_heritage`, `query_dergipark`,
`query_internet_archive`, `query_clinical_trials`, `query_open_fda`,
`query_sec_edgar`, `query_court_listener`, `query_eur_lex`,
`query_saglik_ekutuphane`, `query_ktb_ekitap`

## Pipeline Integration

All corpus actors can be composed into YAML pipelines using `src/pipeline/`.
See `examples/pipelines/` for sample corpus extraction pipeline configs.
