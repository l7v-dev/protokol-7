# Aktör Modüler Dizin Mimarisi, Araç Ayrıştırması ve Wiki Şablonu Planı

## 1. Amaç ve Kapsam

Protokol-7 bünyesindeki veri çıkarım ve kazıma aktörlerinin (`IActor<T>`) sürdürülebilirliğini, modülerliğini ve otonom ajanlar tarafından tüketilmesini en üst düzeye çıkarmak için:
1. Standart bir aktör dokümantasyon şablonunun (`docs/actor-wiki-template.md`) oluşturulması (Mermaid mimari ve sıra diyagramları, durum makineleri, güvenlik sınırları, girdi/çıktı şemaları, hata kodları ve kullanım örnekleri).
2. Aktörlerin monolitik tek-dosya yapısından, bağımsız ve kendi kendine yeten modüler paket yapısına kavuşturulması:
   - Aktörün kendisi (`<name>-actor.ts`)
   - Eş-konumlu (colocated) test süiti (`<name>-actor.test.ts`)
   - Kapsamlı teknik dokümantasyon (`wiki.md`)
   - Aktöre ait özel MCP ve yardımcı araçlar (`tools/`)
3. Wikipedia aktörünün bu mimariye öncü referans model (örnek uygulama) olarak taşınması (`src/actors/corpus/wikipedia/`) ve geriye dönük tam uyumluluk (zero regression) sağlanması.
4. CLI iskele üretecinin (`scripts/scaffold-actor.mjs`) yeni modüler klasör standardını üretecek şekilde güncellenmesi.

---

## 2. Mimari ve Dizin Haritası

```text
src/actors/corpus/wikipedia/
├── wikipedia-actor.ts          # Wikipedia/Wikimedia REST API çıkarım aktörü (IActor<WikimediaActorResult>)
├── wikipedia-actor.test.ts     # Eş-konumlu birim ve güvenlik test süiti
├── wiki.md                     # Aktör wiki dokümanı (Mermaid akış, sekans ve durum diyagramları)
├── tools/                      # Aktöre ait araçlar
│   ├── wikipedia-query-tool.ts # MCP araç tanımı ve çalışma zamanı işleyicisi
│   └── index.ts                # Araçlar barel ihracı
└── index.ts                    # Modül giriş noktası

docs/
├── actor-wiki-template.md      # Standart aktör wiki şablonu (Mermaid, invariantlar, girdi/çıktı)
└── plans/
    └── aktor-moduler-dizin-ve-wiki-sablonu-plani.md
```

### Korunacak Bileşenler ve Geriye Dönük Uyumluluk (Zero Breaking Changes)
* `src/actors/corpus/wikimedia-actor.ts`: `src/actors/corpus/wikipedia/wikipedia-actor.ts` üzerinden re-export sağlayan trampoline dosya olarak korunacak.
* `tests/wikimedia-actor.test.ts`: Mevcut test hattının kırılmaması için korunacak ve modüler aktörü test edecek.
* `src/actors/actor-manifests.ts` ve `src/actors/actor-registry.ts`: Hem `wikimedia` hem de `wikipedia` tiplerini eşanlamlı (alias) olarak destekleyecek.
* `package.json`: Test betiği `tests/**/*.test.ts` yanında `src/actors/**/*.test.ts` dosyalarını da kapsayacak şekilde güncellenecek.

---

## 3. Uygulama Aşamaları

### Aşama 1: Aktör Wiki Şablonunun Tasarlanması (`docs/actor-wiki-template.md`)
* Standart başlıklar: Mekanizma Özeti, Mimari ve Veri Akışı (Mermaid Flowchart), Yaşam Döngüsü (Mermaid Sequence Diagram), Durum Makinesi (Mermaid State Diagram), Güvenlik İnvariantları (SSRF DNS pin, timeout, rate limit), Girdi/Çıktı Şemaları, Araçlar (`tools/`), Hata Kodları ve REST/MCP/TS Kullanım Örnekleri.
* Sıfır pazarlama dili, sıfır emoji, %100 teknik ve deterministik sözleşme.

### Aşama 2: Wikipedia Aktörünün Modüler Klasöre Taşınması (`src/actors/corpus/wikipedia/`)
* `src/actors/corpus/wikipedia/wikipedia-actor.ts` oluşturulması (`WikipediaActor` ve `WikimediaActor` ihraçları).
* `src/actors/corpus/wikimedia-actor.ts` dosyasının trampoline olarak `./wikipedia/wikipedia-actor` re-export etmesi.
* `src/actors/corpus/index.ts` barelinin güncellenmesi.

### Aşama 3: Wikipedia Araçlarının Ayrıştırılması (`src/actors/corpus/wikipedia/tools/`)
* `wikipedia-query-tool.ts`: MCP araç girdi şeması, araç metadata ve yürütme mantığı.
* `tools/index.ts`: Barel ihracı.
* `src/mcp/protokol-mcp-server.ts` içerisindeki Wikipedia/Wikimedia çağrısının modüler araç üzerinden yürütülmesi.

### Aşama 4: Wikipedia `wiki.md` Dokümantasyonunun Yazılması
* `docs/actor-wiki-template.md` şablonuna birebir uygun `src/actors/corpus/wikipedia/wiki.md` dosyasının üretilmesi.
* Wikipedia REST API v1 (`summary`, `article`, `search`) akışını gösteren Mermaid diyagramları.

### Aşama 5: Eş-konumlu Test Süiti ve Test Altyapısı
* `src/actors/corpus/wikipedia/wikipedia-actor.test.ts` oluşturulması (özet, makale markdown, arama ve SSRF testleri).
* `package.json` test betiğinin `src/actors/**/*.test.ts` desenini destekleyecek şekilde güncellenmesi.
* `scripts/scaffold-actor.mjs` ve `tests/scaffold-actor.test.ts` dosyalarının modüler aktör yapısını destekleyecek şekilde güncellenmesi.

### Aşama 6: Doğrulama ve Teslim
* `npm run typecheck`
* `npm test` (tüm 502+ testin yeşil kalması)
* `npm run verify` (6 aşamalı deterministik doğrulama hattı)
* `context/architecture-schema.md` ve `TASKS.md` güncellemeleri.
* `docs/walkthroughs/aktor-moduler-dizin-ve-wiki-sablonu-walkthrough.md` kaydı.

---

## 4. Güvenlik ve Mimari Sınırlar (Trust Tier: 2)

* **SSRF Koruma Sınırı:** DNS çözümleme tabanlı IP filtreleme (`SSRFGuard.validateUrlWithDns`) ve `allowLocalNetwork` kuralı korunacak.
* **Kaynak ve Zaman Aşımı:** 30.000 ms zaman aşımı ve `AbortController` sinyali işletilecek.
* **Pazarlama Dili Yasağı:** `naming-discipline` kurallarına sıkı sıkıya uyulacak, yasaklı sıfatlar kullanılmayacak.
* **Sıfır Emoji Disiplini:** Hiçbir dosyada emoji yer almayacak.
