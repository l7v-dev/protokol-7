# Plan: Klasik Filoloji, Antik Metinler ve Dunya Mirasi Aktor Seti (Set 6)

## 1. Genel Bakis
Bu plan, antik filoloji, klasik diller (Antik Yunanca, Klasik Latince, Eski Ibranice, Arapca) ve karsilastirmali din/mitoloji/folklor kaynaklarini yapisal olarak cikaran iki temel aktoru tanimlar:
1. `perseus-dl` (Tufts Perseus Digital Library Actor): Klasik metinler, cift dilli edisyonlar, CTS-URN adresleme ve morfolojik leksik analiz cikarici.
2. `sacred-texts` (Internet Sacred Text Archive Actor): 1.700+ tam metin dini, mitolojik, felsefi ve folklorik eser cikarici.

## 2. Aktor Tanimlari ve Teknik Sozlesmeler

### 2.1. `perseus-dl` (Tufts Perseus Digital Library)
- **Hedef Domain**: `www.perseus.tufts.edu`, `perseus.tufts.edu`
- **Aksiyonlar**:
  - `text`: Belirli bir klasik eseri, bolumu veya dize araligini (doc/URN parametresi ile) cikarir. Orijinal metin (Grekce/Latince) ve mevcutsa Ingilizce ceviriyi paralel olarak ayristirir.
  - `morph`: Kelimenin morfolojik analizini (lemma, sozcuk turu, durum, cinsiyet, tekil/cogul, zaman, kip, fiil cati) cikarir.
  - `search`: Perseus arama sonuclari ve katalog indeksini cikarir.
- **Tip Sozlesmesi**:
  - `action`: `"text" | "morph" | "search"`
  - `doc`: string (ornek: `Perseus:text:1999.01.0133:book=1:card=1` veya CTS-URN)
  - `word`: string (ornek: `logos`, `arma`, `virtus`)
  - `language`: `"greek" | "latin" | "hebrew" | "arabic"`
  - `query`: string

### 2.2. `sacred-texts` (Internet Sacred Text Archive)
- **Hedef Domain**: `www.sacred-texts.com`, `sacred-texts.com`
- **Aksiyonlar**:
  - `text`: Belirli bir kitabi, bolumu veya metin sayfasini cikarir. Baslik, yazar, cevirmen, gelenek/kategori, bolum icerigi ve dipnotlari ayiklar.
  - `catalog`: Belirli bir gelenegin veya alt kategorinin indeks sayfasini (kitap listesi, yazarlar, baglantilar) cikarir.
  - `search`: Arsiv arama sonuclarini cikarir.
- **Tip Sozlesmesi**:
  - `action`: `"text" | "catalog" | "search"`
  - `tradition`: string (ornek: `"chr"`, `"jud"`, `"isl"`, `"hin"`, `"bud"`, `"tao"`, `"cla"`, `"egy"`, `"ane"`, `"neu"`, `"celt"`, `"alc"`)
  - `path`: string (ornek: `"/hin/sbe01/index.htm"`, `"/isl/pick/001.htm"`)
  - `query`: string

## 3. Mimari Entegrasyon Adimlari
1. `src/api/types.ts`: `ActorType`, secenekler, sonuc detaylari eklenmesi.
2. `src/actors/corpus/perseus-dl-actor.ts`: `PerseusDlActor` sinifinin yazilmasi.
3. `src/actors/corpus/sacred-texts-actor.ts`: `SacredTextsActor` sinifinin yazilmasi.
4. `src/actors/corpus/index.ts` ve `src/index.ts`: Re-export guncellemesi.
5. `src/actors/actor-manifests.ts`: Manifest, Zod semalari, JSON semalari ve MCP araclari (`query_perseus_dl`, `query_sacred_texts`).
6. `src/actors/actor-registry.ts`: Kayit defterine ekleme.
7. `src/api/server.ts`: HTTP rotalari (`POST /api/v1/perseus-dl`, `POST /api/v1/sacred-texts`).
8. `src/api/openapi-spec.ts`: OpenAPI 3.1.0 sozlesmeleri.
9. `src/mcp/protokol-mcp-server.ts`: MCP secenek eslemeleri.
10. `examples/actors/`: JSON ornekleri.
11. `docs/actors/`: Teknik wikiler.
12. `tests/`: Birim ve entegrasyon testleri (`tests/perseus-dl-actor.test.ts`, `tests/sacred-texts-actor.test.ts`).
13. `tests/protokol-mcp-server.test.ts` ve `tests/server.test.ts`: Rota ve arac testleri.
14. `context/architecture-schema.md`: Sematik mimari envanteri guncellemesi.
15. Calistirma ve dogrulama (`npm run verify`, `npm test`).
