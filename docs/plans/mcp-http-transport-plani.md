# MCP HTTP-SSE Transport — Mimari Plan

Branch: `feature/mcp-http-transport`
Trust Tier: 1 (yeni modül, insan onayı gerekli)
Öncelik: Pipeline Orchestrator'dan önce yapılabilir (bağımsız)

---

## 1. Sorun Tanımı

`src/mcp/protokol-mcp-server.ts` yalnızca `stdio` transport üzerinden çalışıyor.
Yani MCP yalnızca aynı makinede çalışan process'lere (Claude Desktop, local agent) açık.

Uzak AI agent'lar (Claude.ai web, Cursor, VS Code Copilot, remote LLM orchestrator'lar)
HTTP üzerinden bağlanamıyor.

MCP spec 2024-11-05 iki transport tanımlıyor:
- `stdio` — mevcut, çalışıyor
- `HTTP + SSE` — **yok**

---

## 2. HTTP-SSE MCP Transport Nasıl Çalışır

```
AI Agent (Cursor / Claude.ai / custom)
    |
    | POST /mcp  (JSON-RPC 2.0 request body)
    v
HTTP MCP Endpoint
    |
    | SSE stream veya JSON response
    v
AI Agent (sonuç alır)
```

İki endpoint gerekli:

| Endpoint | Method | Açıklama |
|---|---|---|
| `/mcp` | POST | JSON-RPC 2.0 tek istek — `initialize`, `tools/list`, `tools/call` |
| `/mcp/events` | GET | SSE stream — sunucu taraflı bildirimler (opsiyonel faz) |

Authentication: `Authorization: Bearer <token>` header — env var `MCP_API_TOKEN`.
Token yoksa endpoint açık kalır (geliştirme modu), production'da zorunlu.

---

## 3. Mevcut MCP Server ile İlişki

`ProtokolMcpServer.processRequest(jsonRpcRequest)` metodu zaten var ve
stdio'dan bağımsız çalışıyor — test edilmiş (182 test).

HTTP transport sadece bir **adapter katmanı** — HTTP isteğini `processRequest`'e
iletir, cevabı HTTP response olarak döner. Core MCP mantığına dokunulmaz.

```typescript
// Mevcut (dokunulmaz):
// src/mcp/protokol-mcp-server.ts → ProtokolMcpServer.processRequest()

// Yeni:
// src/mcp/http-transport.ts → HTTP wrapper
```

---

## 4. Modül Yapısı

```
src/mcp/
  protokol-mcp-server.ts    -- mevcut, dokunulmaz
  http-transport.ts         -- yeni: HTTP adapter
  auth-guard.ts             -- yeni: Bearer token doğrulama

tests/
  mcp-http-transport.test.ts  -- yeni
```

`src/core/server.ts`'e eklenecek rotalar:

```
POST /mcp          → httpMcpTransport.handleRequest(req, res)
GET  /mcp/events   → httpMcpTransport.handleEvents(req, res)   [Faz 2]
GET  /.well-known/mcp.json  → mevcut, kalır
```

---

## 5. http-transport.ts Sözleşmesi

```typescript
// src/mcp/http-transport.ts

export class HttpMcpTransport {
  constructor(private server: ProtokolMcpServer) {}

  // POST /mcp — JSON-RPC 2.0
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>

  // GET /mcp/events — SSE (Faz 2)
  handleEvents(req: IncomingMessage, res: ServerResponse): void
}
```

---

## 6. auth-guard.ts Sözleşmesi

```typescript
// src/mcp/auth-guard.ts

export function verifyMcpToken(req: IncomingMessage): boolean
// Authorization: Bearer <MCP_API_TOKEN>
// MCP_API_TOKEN env var tanımlı değilse → true (geliştirme modu)
// MCP_API_TOKEN tanımlıysa → token eşleşmeli
```

---

## 7. MCP Resources (Faz 2)

`tools/list` + `tools/call` mevcut.

Faz 2'de eklenecek MCP protocol metodları:

| Metod | Açıklama |
|---|---|
| `resources/list` | Quarantine listesi, run geçmişi kaynak olarak |
| `resources/read` | `quarantine://run-<id>`, `run://run-<id>` URI şeması |

Örnek kullanım:
```
AI agent: resources/read("run://run-abc123")
Yanıt: run sonucu JSON, canlı durum
```

---

## 8. Uygulama Fazları

### Faz 1 — HTTP Transport Çekirdeği [Bağımsız, küçük iş]

1. `src/mcp/auth-guard.ts` — Bearer token doğrulama
2. `src/mcp/http-transport.ts` — POST /mcp adapter
3. `src/core/server.ts` — `/mcp` rotası eklenir
4. `tests/mcp-http-transport.test.ts` — initialize, tools/list, tools/call over HTTP
5. `.env.example` — `MCP_API_TOKEN=` satırı eklenir

### Faz 2 — SSE Events + Resources [Pipeline sonrası]

1. `handleEvents()` — SSE stream, run progress bildirimleri
2. `resources/list` + `resources/read` — quarantine ve run kaynakları
3. `ProtokolMcpServer.processRequest()` — resources case'leri eklenir

---

## 9. Yeni Bağımlılık

**Sıfır yeni bağımlılık.** Native `node:http` yeterli.
SSE için de native stream kullanılır — `EventEmitter` üzerinden.

---

## 10. Mimari Sınırlar (Invariants)

- `ProtokolMcpServer` stdio'ya bağımlı olmaya devam etmez — transport agnostik kalır.
- HTTP transport core MCP mantığını kopyalamaz, yalnızca `processRequest()` çağırır.
- `MCP_API_TOKEN` env var tanımlıysa tüm `/mcp` isteklerinde token kontrolü zorunludur.
- SSRF koruması `/mcp` üzerinden gelen actor URL'lerine de uygulanır (mevcut guard zaten aktif).

---

## 11. Diğer Planlarla İlişki

```
[Bu Plan] MCP HTTP Transport
    ↑ bağımsız, önce yapılabilir

[Pipeline Orchestrator Planı]
    → Faz 4'te pipeline tool'ları MCP üzerinden de tetiklenebilir
    → "pipeline/create", "pipeline/run" MCP tool olarak eklenebilir
```

Sıradaki adım: Faz 1 uygulaması için onay — `feature/mcp-http-transport` branch'inde başlanır.
