# metamath — Teknik Wiki ve Çalışma Şartnamesi

## 1. Metadata ve Sınıflandırma

| Alan | Değer |
|---|---|
| **Aktör Tanımlayıcı (Type)** | `metamath` |
| **Kategori** | `corpus` |
| **Sürüm** | `1.0.0` |
| **Birincil Sınıf** | `MetamathActor` (`src/actors/corpus/metamath-actor.ts`) |
| **Protokol / Kaynak** | HTTP / HTML Scraping (`us.metamath.org`) |
| **Hedef Çıktı Biçimi** | `GFM Markdown` & Formal Proof Tables |
| **MCP Aracı** | `query_metamath` (`src/mcp/protokol-mcp-server.ts`) |
| **Test Dosyası** | `tests/metamath-actor.test.ts` |

---

## 2. Mekanizma ve Teknik Genel Bakış

`MetamathActor`, bilgisayar tarafından doğrulanabilir biçimsel matematik (formal mathematics) alanında öncü olan Metamath Proof Explorer veritabanları (`set.mm`, `iset.mm`, `ql.mm`) üzerindeki 40.000'den fazla biçimsel teoremi, aksiyomları, hipotezleri ve adım adım doğrulama zincirlerini toplayan bir korpus aktörüdür.

Metamath, Zermelo-Fraenkel küme kuramı (ZFC) ve klasik mantık üzerine inşa edilmiş saf sembolik çıkarım adımları içerir. Bu veri, LLM'lerin Chain-of-Thought muhakemesi, biçimsel teorem kanıtlama ve sembolik akıl yürütme kabiliyetleri için emsalsiz bir kaynaktır.

Desteklenen eylemler:
1. `theorem`: Belirtilen bir teorem sembolü (ör. `mpc2`, `pythag`, `dtru`) için açıklama metnini, temel hipotezleri (`$e`, `$d`), sonuç önermesini (`Assertion`) ve adım adım doğrulama tablosunu (Step, Hyp, Ref, Expression) çekerek yapılandırılmış nesne ve GFM Markdown tablosu olarak sunar.
2. `search`: Teorem isimleri ve sembolleri üzerinde arama yapar (`mmfind.html`).
3. `axiom`: Biçimsel aksiyom tanımlarını (ör. `ax-1`, `ax-mp`) ayrıştırır.

---

## 3. Mimari ve Bileşen Sınırları

```mermaid
flowchart TD
    subgraph Ingestion["İstemci & Tetikleme Katmanı"]
        MCP["MCP İstemcisi (Claude / Antigravity)"]
        REST["HTTP REST İstemcisi (/api/v1/metamath)"]
    end

    subgraph CentralMCP["Merkezi MCP Katmanı"]
        MCPServer["protokol-mcp-server.ts<br/>(query_metamath)"]
        Manifest["actor-manifests.ts"]
    end

    subgraph ActorCore["Aktör Alan Katmanı (src/actors/corpus/)"]
        Actor["metamath-actor.ts<br/>(MetamathActor)"]
        CheerioParser["Cheerio Formal Proof Table Parser"]
    end

    subgraph SecurityPerimeter["Güvenlik Katmanı"]
        SSRF["SSRFGuard.validateUrlWithDns"]
        Fetch["safeRedirectFetch<br/>(AbortController)"]
    end

    subgraph UpstreamTarget["Hedef Veri Kaynağı"]
        MM["us.metamath.org<br/>(Metamath Proof Explorer)"]
    end

    MCP --> MCPServer
    REST --> Actor
    MCPServer --> Actor
    Actor --> SSRF
    SSRF --> Fetch
    Fetch --> MM
    MM --> Fetch
    Fetch --> CheerioParser
    CheerioParser --> Actor
```

---

## 4. Sıralı İşlem Akışı (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    participant Client as İstemci (REST / MCP)
    participant Server as REST Sunucu / MCP Sunucu
    participant Actor as MetamathActor
    participant Guard as SSRFGuard
    participant Fetcher as safeRedirectFetch
    participant Upstream as us.metamath.org

    Client->>Server: POST /api/v1/metamath (theorem: "mpc2", database: "set.mm")
    Server->>Actor: run(task, context)
    Actor->>Guard: validateUrlWithDns(endpoint)
    Guard-->>Actor: valid: true
    Actor->>Fetcher: safeRedirectFetch(endpoint)
    Fetcher->>Upstream: GET /mpeuni/mpc2.html
    Upstream-->>Fetcher: 200 OK (HTML)
    Fetcher-->>Actor: HTML Yanıtı
    Actor->>Actor: Cheerio ayrıştırma (açıklama, hipotezler, assertion, proof steps, cross-refs)
    Actor-->>Server: ActorResult (completed, status 200, data)
    Server-->>Client: 200 OK JSON (theorem, markdown)
```

---

## 5. Durum Geçiş Modeli (State Diagram)

```mermaid
stateDiagram-v2
    [*] --> Initializing: Görev Kabul Edildi
    Initializing --> ValidatingSSRF: Hedef URL ve Parametre Çözümleme
    ValidatingSSRF --> FetchingUpstream: SSRF Doğrulandı
    ValidatingSSRF --> Failed: SSRF İhlali
    FetchingUpstream --> ParsingHTML: 200 OK Alındı
    FetchingUpstream --> TimedOut: Zaman Aşımı (AbortController)
    FetchingUpstream --> Failed: Upstream 4xx/5xx Hatası
    ParsingHTML --> GeneratingMarkdown: İspat Tablosu ve Semboller Çıkarıldı
    GeneratingMarkdown --> Completed: GFM Markdown ve Veri Yapısı Hazır
    Completed --> [*]
    Failed --> [*]
    TimedOut --> [*]
```

---

## 6. Güvenlik İnvariantları ve Kısıtlar

1. **SSRF Koruması:** `us.metamath.org` ve doğrudan sağlanan URL'ler hop-by-hop doğrulanır.
2. **Sembolik Bütünlük:** Turnstile (`⊢`), mantıksal bağlaçlar (`→`, `∧`, `∨`, `¬`) ve küme sembolleri (`∈`, `⊆`) Unicode karakterleri korunarak aktarılır.
3. **Zaman Aşımı ve Kaynak Kontrolü:** 30.000 ms zaman aşımı ile askıda kalan ağ bağlantıları kesilir.
