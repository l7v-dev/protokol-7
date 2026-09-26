# MCP HTTP-SSE Transport (Faz 1 & Faz 2) Walkthrough

## 1. Genel Bakış

Bu çalışma kapsamında `docs/plans/mcp-http-transport-plani.md` mimari planı uyarınca Protokol-7 bünyesindeki Model Context Protocol (MCP) sunucusunun yerel stdio sınırlarının ötesine taşınarak uzak AI ajanlarının HTTP üzerinden JSON-RPC 2.0 istekleri gönderebilmesi ve canlı yürütme durumlarını dinleyebilmesi için **Faz 1 (HTTP Transport Çekirdeği)** ve **Faz 2 (SSE Events ve Resources)** eksiksiz olarak hayata geçirilmiştir.

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
- **Canlı SSE Akışı (`handleEvents`):** `GET /mcp/events` üzerinde keep-alive ping destekli Server-Sent Events akışı sunar; `?runId=<runId>` parametresiyle hedef koşunun canlı günlüklerini (`event: log`), durum geçişlerini (`event: status`) ve tamamlanma bilgisini (`event: done`) dinleyicilere anlık iletir.

### 2.3. MCP Resources Desteği (`src/mcp/protokol-mcp-server.ts`)
- **Kaynak Listeleme (`resources/list`):**
  - Karantina denetim izi kaynağını (`quarantine://items`) dinamik listeler.
  - Aktif ve geçmiş aktör koşularını (`run://<runId>`) `globalRunRegistry` üzerinden tarayarak kaynak listesine ekler.
- **Kaynak Okuma (`resources/read`):**
  - `quarantine://items` URI'si ile veto denetim kayıtlarını döndürür.
  - `quarantine://<name>` URI'si ile spesifik karantina klasöründeki `veto_audit.json` belgesini döndürür.
  - `run://<runId>` URI'si ile hedef aktör koşusunun girdi, çıktı, durum, süre ve anlık günlüklerini JSON formatında döndürür.
  - Geçersiz URI şemaları veya bulunamayan koşular için `-32002` (Resource not found) standart hata kodunu üretir.
- **Abonelik Yönetimi:** `resources/subscribe` ve `resources/unsubscribe` standart no-op yanıtları üretir.
- **Yetenek Beyanı (`initialize`):** `capabilities.resources` alanı `{ subscribe: true, listChanged: true }` olarak istemcilere bildirilir.

### 2.4. HTTP Sunucusu Entegrasyonu (`src/core/server.ts`)
- `POST /mcp` rotası `httpMcpTransport.handleRequest` metoduna bağlanmıştır.
- `GET /mcp/events` rotası `httpMcpTransport.handleEvents` metoduna bağlanmıştır.
- CORS başlıkları ve OPTIONS preflight yanıtları tam desteklenmektedir.

### 2.5. Ortam Yapılandırması (`.env.example`)
- `MCP_API_TOKEN` opsiyonel yapılandırma değişkeni belgelenmiştir.

## 3. Doğrulama ve Test Sonuçları

- **Birim ve Entegrasyon Test Paketi (`tests/mcp-http-transport.test.ts`):** 19/19 başarılı:
  - `verifyMcpToken` boş/tanımlı token ve geçersiz/uyuşan Bearer başlıkları (2 test)
  - `HttpMcpTransport` 405 Method Not Allowed, 413 Payload Too Large, 400 -32700 Parse error, 400 -32600 Invalid Request, 204 Notification (5 test)
  - Canlı HTTP sunucusu üzerinden `initialize` el sıkışması, `tools/list` 18 araç listelemesi, bilinmeyen araç için hata yanıtı, `MCP_API_TOKEN` koruma doğrulaması, `GET /mcp` 405 denetimi ve `GET /mcp/events` SSE akış bağlantısı (6 test)
  - `resources/list`, `resources/read` (run:// ve quarantine://), hata durumları, abonelik metotları, HTTP POST /mcp kaynak sorguları ve canlı `?runId` SSE filtreli olay akışı (6 test)
- **Stdio MCP Test Paketi (`tests/protokol-mcp-server.test.ts`):** 10/10 başarılı.
- **Genel Test Paketi (`npm test`):** 249/249 test başarılı (0 hata, 0 atlama).
- **Statik Tip ve Lint Denetimi (`npm run typecheck && npm run lint`):** Sıfır hata.
- **Deterministik Doğrulama Hattı (`npm run verify`):** 6 katmanın tümünden (Mimari Bütünlük, İsimlendirme Disiplini, Sıfır Emoji, Secret Detection, Canlı SCA Paket Doğrulama, Biome Lint) başarıyla geçti.
