# Wikisource Aktörü ve Çok Dilli Dump ETL Mimari Planı (wikisource)

## 1. Problem ve Kapsam
Wikipedia ansiklopedik dünya bilgisini sağlamıştır; ancak dil modellerinin derin dilbilgisi, edebi sentaks, karmaşık cümle yapıları, felsefi argümantasyon ve arkaik/klasik dil dağarcığı kazanabilmesi için orijinal tam metinlere ihtiyaç vardır.
Wikimedia Foundation'ın kardeş projesi olan **Wikisource (Vikikaynak)**, kamu malı ve açık lisanslı orijinal edebi yapıtları, klasik felsefi metinleri, tarihi anlaşmaları, fermanları, şiirleri ve kanunları barındıran en saf metin kaynağıdır.

Bu görev iki temel bileşenden oluşur:
1. **Wikisource Aktörü (`src/actors/corpus/wikisource-actor.ts`):** Wikimedia REST API v1 ve Action API üzerinden canlı sayfa, tam metin (Parsoid HTML -> GFM Markdown) ve arama yapabilen standart protokol-7 aktörü.
2. **Çok Dilli Streaming Dump ETL Hattı (`scripts/wikisource_pipeline/`):** Wikimedia'daki 85 Wikisource dil sürümünün (Klasik Latince, Antik Yunanca/Çok Dilli `sourceswiki`, Eski İngilizce, Sanskritçe, Türkçe, Fransızca, İngilizce, Almanca, Çince vb.) `.xml.bz2` dump'larını akış halinde indirip temizleyen, Zstandard Parquet formatına sıkıştıran, doğrudan Google Drive'a aktaran ve yerel ham/işlenmiş veriyi anında silerek sıfır disk kalıntısı bırakan üretim boru hattı.

---

## 2. Sistem Sınırları ve Mimari Tasarım

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WIKISOURCE MİMARİSİ                             │
├──────────────────────────────────┬─────────────────────────────────────┤
│   A. Çevrimiçi REST/MCP Aktörü   │     B. Çok Dilli Dump ETL Hattı     │
│  (src/actors/corpus/wikisource)  │    (scripts/wikisource_pipeline/)   │
├──────────────────────────────────┼─────────────────────────────────────┤
│ - Wikimedia REST API v1          │ - dumps.wikimedia.org/<lang>wiki... │
│ - Parsoid HTML -> GFM Markdown   │ - Streaming bz2 iterparse (O(1) RAM)│
│ - SSRFGuard koruması             │ - MediaWiki temizleme filtresi      │
│ - POST /api/v1/wikisource        │ - Zstandard Parquet (zstd-6)        │
│ - MCP: query_wikisource          │ - Google Drive API (OAuth2)         │
│ - OpenAPI 3.1.0 & Swagger UI     │ - Anında silme (Sıfır disk kalıntısı)│
└──────────────────────────────────┴─────────────────────────────────────┘
```

### 2.1 Veri Sözleşmesi (Data Contract - Parquet Şeması)
```text
┌───────────────────────┬──────────────┬────────────────────────────────────────────────────────┐
│ Alan Adı              │ Veri Tipi    │ Açıklama                                               │
├───────────────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ article_id            │ int64        │ MediaWiki sayfa kimliği (page ID)                      │
│ title                 │ string       │ Eser / bölüm / sayfa başlığı                           │
│ lang                  │ string       │ Dil kodu (tr, en, la, sa, ang, mul vb.)                │
│ text                  │ string       │ Şablon, etiket ve gürültüden arındırılmış temiz metin  │
│ raw_length            │ int32        │ Ham Vikimetin karakter uzunluğu                        │
│ clean_length          │ int32        │ Temizlenmiş metin karakter uzunluğu                    │
│ url                   │ string       │ Orijinal Wikisource sayfa bağlantısı                   │
│ timestamp             │ string (ISO) │ Son düzenleme zaman damgası                            │
└───────────────────────┴──────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Uygulama Adımları

- [ ] **Faz 1: Tip ve Arayüz Tanımları (`src/api/types.ts`)**
  - `ActorType` union'a `"wikisource"` ekleme.
  - `WikisourceActorTaskOptions`, `WikisourceArticleItem`, `WikisourceActorResult` tipleri.
  - `ActorTask.options.wikisourceOptions` eşleme.

- [ ] **Faz 2: Aktör Geliştirme (`src/actors/corpus/wikisource-actor.ts`)**
  - `IActor<WikisourceActorResult>` implementasyonu.
  - Wikimedia REST API v1 ve Action API desteği.
  - Turndown tabanlı Parsoid HTML -> GFM Markdown dönüştürücü.
  - SSRFGuard ağ güvenliği.
  - `src/actors/corpus/index.ts` ve `src/index.ts` exportları.

- [ ] **Faz 3: Kayıt, Rota ve Entegrasyonlar**
  - `src/actors/actor-manifests.ts`: Zod şeması ve `query_wikisource` MCP araç tanımı.
  - `src/actors/actor-registry.ts`: `createDefaultActorRegistry` kaydı.
  - `src/api/server.ts`: `POST /api/v1/wikisource` REST rotası.
  - `src/mcp/protokol-mcp-server.ts`: `query_wikisource` parametre yönlendirmesi.
  - `src/api/openapi-spec.ts`: OpenAPI 3.1.0 uç nokta belgelemesi.

- [ ] **Faz 4: Çok Dilli Streaming Dump ETL Boru Hattı (`scripts/wikisource_pipeline/`)**
  - `downloader.py`: Wikimedia dump aynalarını tarama ve akışlı `.xml.bz2` indirme.
  - `cleaner.py`: Edebi şablonları, sayfa üstü/altı gezinme çubuklarını temizleyen metin filtresi.
  - `packer.py`: Zstandard Parquet parçalayıcı (10 GB üst sınır, streaming row-group).
  - `drive_sync.py`: Google Drive hedef klasörüne (`1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL`) yükleme, MD5 denetimi ve anında yerel temizlik.
  - `orchestrator.py`: 85 dilin tamamını küçükten büyüğe sıralı şekilde sıfır disk kalıntısıyla işleyen ana orkestratör.

- [ ] **Faz 5: Test ve Doğrulama**
  - `tests/wikisource-actor.test.ts`: Birim ve mock HTTP sunuculu entegrasyon testleri.
  - `tests/server.test.ts` ve `tests/protokol-mcp-server.test.ts` güncellemeleri.
  - `context/architecture-schema.md` ve `TASKS.md` güncellemeleri.
  - `npm run verify` 6 katmanlı tam doğrulama.
