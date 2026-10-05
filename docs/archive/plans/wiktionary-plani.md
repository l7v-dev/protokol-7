# Wiktionary Aktörü ve Çok Dilli Dump ETL Mimari Planı (wiktionary)

## 1. Problem ve Kapsam
Wikipedia ansiklopedik dünya olgularını, Wikisource ise birincil edebi ve tarihi metinleri sağlamıştır. Dil modellerinin derin leksikal semantik, morfoloji, etimoloji, eş/zıt anlam ilişkileri, dilbilgisel çekim kuralları ve diller arası çeviri matrisleri kazanabilmesi için dünyanın en kapsamlı açık sözlük projesine ihtiyaç vardır.
Wikimedia Foundation'ın kardeş projesi olan **Wiktionary (Vikisözlük)**, 198 dilde etimolojik kökenler, tanımlar, fonetik transkripsiyonlar (IPA), örnek kullanım cümleleri ve eş anlamlılar barındıran zengin bir leksikal bilgi tabanıdır.

Bu görev iki temel bileşenden oluşur:
1. **Wiktionary Aktörü (`src/actors/corpus/wiktionary-actor.ts`):** Wikimedia REST API v1 (`/api/rest_v1/page/definition/...` ve `/api/rest_v1/page/html/...`) ile Action API (`w/api.php`) üzerinden sözlük maddesi, tanımlar, parça-sözcük türleri, arama ve rastgele kelime keşfi yapabilen standart protokol-7 aktörü.
2. **Çok Dilli Streaming Dump ETL Hattı (`scripts/wiktionary_pipeline/`):** Wikimedia'daki 198 Wiktionary dil sürümünün `.xml.bz2` dump'larını akış halinde indirip temizleyen, Zstandard Parquet formatına sıkıştıran, doğrudan Google Drive hedef klasörüne (`Wiktionary/<lang>/`) aktaran ve yerel ham/işlenmiş veriyi anında silerek sıfır disk kalıntısı bırakan otonom üretim boru hattı.

---

## 2. Sistem Sınırları ve Mimari Tasarım

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WIKTIONARY MİMARİSİ                             │
├──────────────────────────────────┬─────────────────────────────────────┤
│   A. Çevrimiçi REST/MCP Aktörü   │     B. Çok Dilli Dump ETL Hattı     │
│  (src/actors/corpus/wiktionary)  │    (scripts/wiktionary_pipeline/)   │
├──────────────────────────────────┼─────────────────────────────────────┤
│ - Wikimedia REST Definition API  │ - dumps.wikimedia.org/*wiktionary/  │
│ - Parsoid HTML -> GFM Markdown   │ - Streaming bz2 iterparse (O(1) RAM)│
│ - SSRFGuard koruması             │ - Leksikal madde/tanım çıkarıcı     │
│ - POST /api/v1/wiktionary        │ - Zstandard Parquet (zstd-6)        │
│ - MCP: query_wiktionary          │ - Google Drive API (OAuth2)         │
│ - OpenAPI 3.1.0 & Swagger UI     │ - Anında silme (Sıfır disk artığı)  │
└──────────────────────────────────┴─────────────────────────────────────┘
```

### 2.1 Veri Sözleşmesi (Data Contract - Parquet Şeması)
```text
┌───────────────────────┬──────────────┬────────────────────────────────────────────────────────┐
│ Alan Adı              │ Veri Tipi    │ Açıklama                                               │
├───────────────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ article_id            │ int64        │ MediaWiki sayfa kimliği (page ID)                      │
│ word                  │ string       │ Madde başı kelime / terim                              │
│ lang                  │ string       │ Wiktionary dil sürümü kodu (tr, en, fr, de, la vb.)   │
│ text                  │ string       │ Temizlenmiş sözlük metni, tanımlar ve etimoloji        │
│ raw_length            │ int32        │ Ham Vikimetin karakter uzunluğu                        │
│ clean_length          │ int32        │ Temizlenmiş metin karakter uzunluğu                    │
│ url                   │ string       │ Orijinal Wiktionary madde bağlantısı                   │
│ timestamp             │ string (ISO) │ Son düzenleme zaman damgası                            │
└───────────────────────┴──────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Uygulama Adımları

- [ ] **Faz 1: Tip ve Arayüz Tanımları (`src/api/types.ts`)**
  - `ActorType` union'a `"wiktionary"` ekleme.
  - `WiktionaryWordDefinition`, `WiktionaryPartOfSpeechItem`, `WiktionaryEntryItem`, `WiktionaryActorTaskOptions`, `WiktionaryActorResult` tipleri.
  - `ActorTask.options.wiktionaryOptions` eşleme.

- [ ] **Faz 2: Aktör Geliştirme (`src/actors/corpus/wiktionary-actor.ts`)**
  - `IActor<WiktionaryActorResult>` implementasyonu.
  - Wikimedia REST API v1 (`/api/rest_v1/page/definition/` ve `/api/rest_v1/page/html/`) ile Action API desteği.
  - Turndown tabanlı HTML -> Markdown dönüştürücü.
  - SSRFGuard ağ güvenliği.

- [ ] **Faz 3: Dışa Aktarımlar, Kayıt Kütüğü ve Manifestolar**
  - `src/actors/corpus/index.ts` ve `src/index.ts` barrel exportları.
  - `src/actors/actor-registry.ts` kaydı.
  - `src/actors/actor-manifests.ts` manifestosu ve `query_wiktionary` MCP araç tanımı.

- [ ] **Faz 4: Sunucu ve MCP Entegrasyonu**
  - `src/api/server.ts` rotaları (`POST /api/v1/wiktionary`).
  - `src/mcp/protokol-mcp-server.ts` parametre eşlemesi.
  - `src/api/openapi-spec.ts` OpenAPI 3.1.0 spesifikasyonu.

- [ ] **Faz 5: Dokümantasyon ve Örnek Yapılandırmalar**
  - `examples/actors/wiktionary.json`.
  - `docs/actors/wiktionary.md` teknik vikisi.

- [ ] **Faz 6: Test Paketi**
  - `tests/wiktionary-actor.test.ts` birim ve entegrasyon testleri.
  - `tests/server.test.ts` ve `tests/protokol-mcp-server.test.ts` güncellemeleri.

- [ ] **Faz 7: 198 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı (`scripts/wiktionary_pipeline/`)**
  - `cleaner.py`: iterparse ile sözlük tanımlarını ve etimolojiyi ayıklama.
  - `packer.py`: Zstandard Parquet sharder.
  - `downloader.py`: Kesintisiz indirme ve anında silme kancaları.
  - `drive_sync.py`: Google Drive v3 `Wiktionary/<lang>/` senkronizasyonu, MD5 doğrulama ve anında yerel silme.
  - `orchestrator.py`: 198 dilli SQLite kuyruk orkestratörü (`data/wiktionary_catalog.sqlite`).

- [ ] **Faz 8: Doğrulama ve Envanter Güncellemesi**
  - `context/architecture-schema.md` (46 -> 47 aktör).
  - `TASKS.md` güncellemesi.
  - `npm run verify` ve `npm run connectome`.
