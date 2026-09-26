# MCP HTTP-SSE Transport (Faz 1) Walkthrough

## 1. Genel Bakış

Bu çalışma kapsamında `docs/plans/mcp-http-transport-plani.md` mimari planı uyarınca Protokol-7 bünyesindeki Model Context Protocol (MCP) sunucusunun yerel stdio sınırlarının ötesine taşınarak uzak AI ajanlarının HTTP üzerinden JSON-RPC 2.0 istekleri gönderebilmesi için **Faz 1: HTTP Transport Çekirdeği** hayata geçirilmiştir.

## 2. Hayata Geçirilen Bileşenler

### 2.1. Bearer Token Kimlik Doğrulama Koruması (`src/mcp/auth-guard.ts`)
- **İşlev:** Gelen HTTP isteklerinin `Authorization: Bearer <token>` başlığını `MCP_API_TOKEN` ortam değişkenine karşı doğrular.
- **Geliştirme Modu:** `MCP_API_TOKEN` tanımlı değilse veya boşsa istekleri doğrudan onaylar (geliştirme serbestisi).
- **Zamanlama Saldırısı Koruması:** Token doğrulaması `crypto.timingSafeEqual` kullanılarak sabit zamanda (constant-time) gerçekleştirilir.

### 2.2. HTTP MCP Taşıma Adaptörü (`src/mcp/http-transport.ts`)
- **Sözleşme:** `HttpMcpTransport` sınıfı `ProtokolMcpServer` motorunu sarmalar ve HTTP isteklerini JSON-RPC 2.0 sözleşmesine bağlar.
- **Yöntem Kısıtı:** `POST /mcp` dışındaki yöntemleri 405 Method Not Allowed ile reddeder.
- **Yük Boyutu Koruması:** Bellek tüketim saldırılarına (DoS) karşı gövde boyutunu varsayılan 10 MB (`maxPayloadBytes`) ile sınırlar; aşım durumunda 413 Payload Too Large döner.
- **Sözdizimi ve Protokol Doğrulaması:** Geçersiz JSON için `-32700` (Parse error), `jsonrpc !== "2.0"` veya eksik `method` için `-32600` (Invalid Request) standart JSON-RPC hata kodları üretir.
- **Bildirimler:** `notifications/initialized` gibi null dönen bildirimler için HTTP 204 No Content yanıtı verir.
- **SSE Akış Altyapısı (`handleEvents`):** `GET /mcp/events` üzerinde keep-alive ping destekli Server-Sent Events akışı başlatır (Faz 2 hazırlığı).

### 2.3. HTTP Sunucusu Entegrasyonu (`src/core/server.ts`)
- `POST /mcp` rotası `httpMcpTransport.handleRequest` metoduna bağlanmıştır.
- `GET /mcp/events` rotası `httpMcpTransport.handleEvents` metoduna bağlanmıştır.
- CORS başlıkları ve OPTIONS preflight yanıtları tam desteklenmektedir.

### 2.4. Ortam Yapılandırması (`.env.example`)
- `MCP_API_TOKEN` opsiyonel yapılandırma değişkeni belgelenmiştir.

## 3. Doğrulama ve Test Sonuçları

- **Birim ve Entegrasyon Test Paketi (`tests/mcp-http-transport.test.ts`):** 13/13 başarılı:
  - `verifyMcpToken` boş/tanımlı token ve geçersiz/uyuşan Bearer başlıkları (2 test)
  - `HttpMcpTransport` 405 Method Not Allowed, 413 Payload Too Large, 400 -32700 Parse error, 400 -32600 Invalid Request, 204 Notification (5 test)
  - Canlı HTTP sunucusu üzerinden `initialize` el sıkışması, `tools/list` 18 araç listelemesi, bilinmeyen araç için hata yanıtı, `MCP_API_TOKEN` koruma doğrulaması, `GET /mcp` 405 denetimi ve `GET /mcp/events` SSE akış bağlantısı (6 test)
- **Genel Test Paketi (`npm test`):** 243/243 test başarılı (0 hata, 0 atlama).
- **Statik Tip ve Lint Denetimi (`npm run typecheck && npm run lint`):** Sıfır hata.
- **Deterministik Doğrulama Hattı (`npm run verify`):** 6 katmanın tümünden (Mimari Bütünlük, İsimlendirme Disiplini, Sıfır Emoji, Secret Detection, Canlı SCA Paket Doğrulama, Biome Lint) başarıyla geçti.
