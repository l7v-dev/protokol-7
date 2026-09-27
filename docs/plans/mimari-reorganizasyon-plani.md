# Mimari Reorganizasyon Plani

## Gorev

Proje dizini temizligi ve kategorize edilmis klasor yapisi.
Hedef: her klasor tek bir cumlede aciklanabilir olsun.

## Uygulanan Degisiklikler

### Adim 1 — `src/core/` → `src/api/` (tamamlandi)

- 7 dosya `src/api/` altina tasindi
- 5 router dosyasi `src/api/routers/` altina tasindi
- `tsconfig.json` path alias guncellendi
- `context/architecture-schema.md` bolum 1.1 yeniden yazildi
- 497/497 test, 0 hata

### Adim 2 — `src/actors/` kategorileme (tamamlandi)

- 31 aktor 3 kategoriye ayrildi:
  - `web/` — 8 genel web kaziyici
  - `corpus/` — 19 LLM veri kaynagi
  - `documents/` — 4 yerel dosya cikartici
- Her kategori: `index.ts` barrel + `README.md`
- `actor-registry.ts`, `actor-manifests.ts` root'ta kaldi
- `tsconfig.json` yeni alt yollar eklendi
- `context/architecture-schema.md` bolum 1.2 yeniden yazildi
- 497/497 test, 0 hata

### Adim 3 — `scripts/README.md` (tamamlandi)

10 Node.js + 6 Python betigi belgelendi.

### Adim 4 — `examples/README.md` (tamamlandi)

31 aktor JSON + 4 pipeline YAML ornegi nasil calistirilir.

### Adim 5 — `src/api/README.md` (tamamlandi)

HTTP server, 5 router rota tablosu, auth, OpenAPI docs, DB schema ref.

## Sonuc Yapisi

```
src/actors/
  actor-registry.ts   — merkezi kayit
  actor-manifests.ts  — MCP tanim listesi
  web/                — 8 web aktoru + README + index.ts
  corpus/             — 19 LLM aktoru + README + index.ts
  documents/          — 4 belge aktoru + README + index.ts

src/api/
  server.ts           — HTTP server
  routers/            — 5 router (store, pipeline, dataset, job, vault)
  registry-database.ts
  run-registry.ts
  context-guard.ts
  openapi-spec.ts
  types.ts
  README.md

scripts/README.md
examples/README.md
```

## Commit Hash'leri

- `0b2af78` — refactor(api): rename src/core/ to src/api/
- `f1b0b86` — refactor(actors): categorize 31 actors into web/corpus/documents
- `e8d383e` — docs(readme): add README.md for scripts/, examples/, src/api/

## Dokunulmadi

src/browser/, src/extractors/, src/network/, src/ocr/, src/mcp/,
src/pipeline/, src/dataset/, src/vault/, src/archive/, tests/,
docs/adr/, rules/, context/ (sadece architecture-schema.md guncellendi)
