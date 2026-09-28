# Aktör Modüler Dizin Mimarisi, Araç Ayrıştırması ve Wiki Şablonu Walkthrough

Bu doküman, `protokol-7` projesinde aktör mimarisinin modüler klasör standardına (`Self-Contained Modular Actor Pattern`) taşınması, `docs/actor-wiki-template.md` şablonunun oluşturulması ve referans olarak Wikipedia aktörünün modüler yapıya geçirilmesi adımlarını belgeler.

---

## 1. Gerçekleştirilen Değişiklikler ve Üretilen Bileşenler

### 1.1 Aktör Wiki Şartnamesi ve Şablonu (`docs/actor-wiki-template.md`)
* Tüm aktörlerin `wiki.md` dosyaları için standart şartname ve şablon oluşturuldu.
* Şablon içeriği:
  - Metadata ve sınıflandırma tablosu (kategori, versiyon, protokol, birincil sınıf, MCP araç adı)
  - Mekanizma ve teknik genel bakış
  - Mermaid mimari ve bileşen şeması (`flowchart TD`)
  - Mermaid istek yaşam döngüsü sıra şeması (`sequenceDiagram`)
  - Mermaid durum geçiş şeması (`stateDiagram-v2`)
  - Güvenlik ve SSRF invariantları (DNS pinning, private IP engellemesi, 30s timeout)
  - TypeScript girdi/çıktı sözleşmesi ve JSON schema tabloları
  - Aktöre ait araçlar (`tools/`) rehberi
  - Kendi kendine iyileştirme (self-healing) ve HTTP hata kodları tablosu
  - cURL, MCP JSON-RPC 2.0 ve programatik TypeScript kullanım örnekleri

### 1.2 Wikipedia Referans Aktörü (`src/actors/corpus/wikipedia/`)
* **Aktör Çekirdeği (`wikipedia-actor.ts`):** `WikipediaActor` ve `WikimediaActor` sınıfları resmi Wikimedia REST API v1 (`summary`, `article`, `search`) entegrasyonuyla konumlandırıldı.
* **Aktör Araçları (`tools/wikipedia-query-tool.ts`):** MCP araç şeması (`wikipedia_query`), parametre doğrulama ve `executeWikipediaQuery` işleyicisi aktör dizini içine taşındı.
* **Aktör Wiki Dokümanı (`wiki.md`):** `docs/actor-wiki-template.md` standardına tam uyumlu, 3 adet Mermaid şeması içeren teknik doküman yazıldı.
* **Eş-Konumlu Testler (`wikipedia-actor.test.ts`):** Özet çekme, Parsoid HTML'den GFM markdown dönüşümü, arama temizliği, SSRF 403 engeli ve `executeWikipediaQuery` testleri eklendi.
* **Geriye Dönük Uyumluluk Trampolini (`src/actors/corpus/wikimedia-actor.ts`):** Eski dosya yolu trampolin olarak korunup `./wikipedia/wikipedia-actor` re-export edilerek sıfır kesinti sağlandı.

### 1.3 Tip ve MCP Sunucu Entegrasyonu
* `src/api/types.ts`: `ActorType` union'ına `wikipedia` eklendi; `WikipediaActorTaskOptions`, `WikipediaActorResult` ve `wikipediaOptions` tanımlandı.
* `src/actors/actor-manifests.ts`: `wikipedia` manifesti ve `wikipedia_query` aracı eklendi.
* `src/actors/actor-registry.ts`: `WikipediaActor` tescil edildi.
* `src/mcp/protokol-mcp-server.ts`: `wikipediaOptions` eşlemesi sağlandı (toplam 42 araç).
* `examples/actors/wikipedia.json`: Örnek yapılandırma eklendi.

### 1.4 İskele Otomasyonu (`scripts/scaffold-actor.mjs`)
* `npm run make:actor` komutu, gelecekte eklenecek aktörleri otomatik olarak modüler klasör, eş-konumlu test, `tools/` modülü ve Mermaid diyagramlı `wiki.md` ile üretecek şekilde güncellendi.
* `tests/scaffold-actor.test.ts`: Şablon ve Wikipedia modül yapısı doğrulamalarıyla genişletildi (7/7 test).

---

## 2. Doğrulama ve Test Sonuçları

### 2.1 Tip Denetimi (TypeScript)
```bash
npm run typecheck
# Output: Exit code 0 (Hatasız derleme)
```

### 2.2 Test Süiti
```bash
npm test
# Output:
# ℹ tests 510
# ℹ suites 77
# ℹ pass 510
# ℹ fail 0
```
Mevcut 502 teste ek olarak 8 yeni test süiti (eş-konumlu Wikipedia testleri, araç çalıştırma ve iskele şablon doğrulamaları) başarıyla geçti.

### 2.3 Deterministik Doğrulama Hattı (`verify-pipeline.mjs`)
```bash
npm run verify
# Output:
# [1/6] Mimari Dosya Butunlugu Denetleniyor... [OK]
# [2/6] Isimlendirme ve Dokumantasyon Disiplini... [OK]
# [3/6] Loglama Disiplini (Sıfır Emoji)... [OK]
# [4/6] Gizli Anahtar (Secret Detection)... [OK]
# [5/6] Bagimlilik ve Paket Halusinasyonu (SCA)... [OK]
# [6/6] Kod Stili ve Statik Analiz (Biome)... [OK]
# [PASS] DOGRULAMA BASARILI (6389ms).
```

### 2.4 İsimlendirme Disiplini
```bash
npm run lint:naming
# Output: Banned buzzwords: 0 (Dosya isimlerinde ve yeni kodlarda pazarlama jargonu bulunmuyor).
```
