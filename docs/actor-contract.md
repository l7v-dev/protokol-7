# Actor Contract Specification — protokol-7

Bu doküman, `protokol-7` mimarisinde çalışan tüm veri çekme ve ayrıştırma aktörlerinin (`IActor<T>`) uymak zorunda olduğu teknik sözleşmeyi, güvenlik sınırlarını ve tescil protokolünü tanımlar.

---

## 1. Aktör Kategorileri ve Sorumluluk Sınırları

Tüm aktörler `src/actors/` altında tam olarak 3 alt kategoriden birinde konumlanır:

| Kategori | Dizin | Temel Amaç | İzin Verilen Mekanizmalar |
|---|---|---|---|
| **web** | `src/actors/web/` | Genel amaçlı HTTP web kazıma ve tarama | `safeRedirectFetch`, `cheerio`, `PlaywrightBrowserPool`, `crawler`, `sitemap-xml` |
| **corpus** | `src/actors/corpus/` | LLM ön eğitimi için kamuya açık veri toplama | Resmi REST/OAI-PMH/SPARQL API'leri, `TurndownService`, NFKC normalizasyonu |
| **documents** | `src/actors/documents/` | Yerel/ikili belge ve arşiv ayrıştırma | `unpdf`, `OfficeExtractor`, `EpubExtractor`, `ArchiveGuard`, `PdfAnomalyDetector` |

---

## 2. Zorunlu İnvariantlar (Mandatory Invariants)

Her aktör `IActor<TResult>` arayüzünü uygulamalıdır ve çalışma zamanında aşağıdaki invariantları eksiksiz sağlamalıdır:

### 2.1 Güvenlik ve SSRF Koruması
* Harici bir URL'e istek atmadan önce MUTLAKA `SSRFGuard.validateUrlWithDns` çalıştırılmalıdır.
* `allowLocalNetwork: process.env.NODE_ENV === "test"` parametresi geçilmelidir (test izolasyonu ve CI uyumluluğu için).
* Özel IP blokları (RFC 1918), döngüsel (loopback) adresler ve bulut metadata uç noktaları (169.254.169.254) engellenmelidir.
* HTTP yönlendirmeleri (301/302/308) doğrudan `fetch` yerine `safeRedirectFetch` üzerinden hop-by-hop DNS doğrulamasıyla yapılmalıdır.

### 2.2 Zaman Aşımı ve Kaynak Sınırları
* Her aktör varsayılan bir `DEFAULT_TIMEOUT_MS` sabiti (genelde 20.000–30.000 ms) tanımlamalıdır.
* Zaman aşımı çözünürlüğü: `options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS` sırasıyla belirlenmelidir.
* `AbortController` kullanılarak süre bitiminde bekleyen ağ soketleri ve alt süreçler derhal sonlandırılmalıdır.
* İndirilen ikili yükler (PDF, EPUB, arşivler) için üst boyut sınırı (`MAX_BYTES`) belirlenmeli, bellek taşmaları engellenmelidir.

### 2.3 Deterministik Telemetri ve Hata Yönetimi
* Süre ölçümü `const startTime = context?.startTime || Date.now();` ile başlamalıdır.
* Başarılı sonuç:
  ```typescript
  return {
    taskId: task.taskId,
    actorType: this.actorType,
    status: "completed",
    statusCode: 200,
    data: resultData,
    executionDurationMs: Date.now() - startTime,
  };
  ```
* Hata durumu: Hiçbir istisna yutulmamalı (swallow edilmemeli), yakalanıp standart hata formatında dönülmelidir:
  ```typescript
  return {
    taskId: task.taskId,
    actorType: this.actorType,
    status: "failed",
    statusCode: errorStatusCode || 500,
    errorMessage: err instanceof Error ? err.message : String(err),
    executionDurationMs: Date.now() - startTime,
  };
  ```

---

## 3. Yeni Aktör Tescil Protokolü (8 Adımlı Kontrol Listesi)

Yeni bir aktör eklendiğinde aşağıdaki noktaların tamamı güncellenmelidir:

1. **Tip Sözleşmesi (`src/api/types.ts`):**
   * `ActorType` union listesine yeni aktörün kebab-case adı eklenir.
   * `<Name>ActorTaskOptions` arayüzü tanımlanır ve `ActorTaskOptions` union'ına eklenir.
   * `<Name>ActorResult` veri çıktısı arayüzü tanımlanır.

2. **Aktör Sınıfı (`src/actors/<kategori>/<ad>-actor.ts`):**
   * `src/actors/actor.template.ts` dosyasından türetilerek iş mantığı kodlanır.

3. **Kategori Bareli (`src/actors/<kategori>/index.ts`):**
   * Yeni aktör sınıfı ilgili kategori bareline ihraç (`export * from "./<ad>-actor";`) edilir.

4. **Kök İhraç (`src/index.ts`):**
   * Kök barele aktörün doğrudan ihracı eklenir.

5. **Katalog Manifestosu (`src/actors/actor-manifests.ts`):**
   * `ACTOR_MANIFESTS` sözlüğüne Zod/JSON Schema, başlık, açıklama, etiketler ve `mcpTool` tanımı eklenir.

6. **Merkezi Kayıt (`src/actors/actor-registry.ts`):**
   * `createDefaultActorRegistry` fonksiyonunda `registry.register(new <Name>Actor())` çağrısı eklenir.

7. **Örnek Yapılandırma (`examples/actors/<ad>.json`):**
   * Aktörün REST API ve MCP üzerinden hemen test edilebileceği asgari geçerli bir JSON girdisi kaydedilir.

8. **Test Süiti (`tests/<ad>-actor.test.ts`):**
   * Başarılı senaryo, SSRF engelleme senaryosu ve geçersiz girdi senaryosunu kapsayan birim test eklenir.
