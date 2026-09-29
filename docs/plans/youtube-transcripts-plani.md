# YouTube Transcripts Aktörü Uygulama Planı (youtube-transcripts)

Bu plan, **protokol-7** mimarisi bünyesinde YouTube video ve Shorts içeriklerinden altyazı (transcript/caption) ve zengin video üstverisi çıkaran, Apify ekosistemindeki `karamelo/youtube-transcripts` (`1s7eXiaukVuOr4Ueg`) aktörünün teknik yetenekleriyle tam uyumlu ve kurumsal standartlara sahip **`youtube-transcripts`** aktörünün tasarım ve entegrasyon spesifikasyonunu tanımlar.

---

## 1. Analiz ve Mimari Durum Tespiti

### 1.1 Apify Referans Aktörü İncelemesi (`1s7eXiaukVuOr4Ueg` / `karamelo/youtube-transcripts`)
Apify Console üzerindeki `karamelo/youtube-transcripts` aktörünün OpenAPI şeması ve teknik dokümantasyonu incelenmiştir:
- **Girdi Yetenekleri:**
  - `urls`: Tekil veya çoklu YouTube URL dizisi (`watch?v=...`, `youtu.be/...`, `shorts/...` veya salt 11 karakterli video kimliği).
  - `outputFormat`: 5 farklı temsil biçimi:
    - `captions`: Salt metin satırları dizisi (`string[]`).
    - `textWithTimestamps`: Zaman damgalı kesit dizisi (`Array<{ start: number; end: number; text: string }>`).
    - `xmlWithoutTimestamps`: Zaman özniteliklerinden arındırılmış XML metni.
    - `xmlWithTimestamps`: Ham YouTube timedtext XML metni.
    - `singleStringText`: LLM özetleme ve vektör indeksleme için birleştirilmiş tek metin gövdesi.
  - `maxRetries`: Hata durumunda yeniden deneme katsayısı (3-12, varsayılan 8).
  - Seçici Üstveri Bayrakları (`boolean`): `channelNameBoolean`, `channelIDBoolean`, `dateTextBoolean`, `relativeDateTextBoolean`, `datePublishedBoolean`, `viewCountBoolean`, `likesBoolean`, `commentsBoolean`, `keywordsBoolean`, `thumbnailBoolean`, `descriptionBoolean`.
- **Çıktı Yetenekleri:**
  - Başarılı kayıtlarda: `videoId`, `title`, `captions` ve talep edilen üstveri alanları.
  - Başarısız kayıtlarda: `status`, `reason`, `processedBy`, `transcriptFound: false` tanı bilgileri.

### 1.2 Dürüst Mimari Değerlendirme ve YouTube Güvenlik Değişiklikleri (PO-Token / BotGuard)
YouTube 2024 sonu ve 2025/2026 döneminde otomatik veri çekicilere karşı agresif güvenlik önlemleri devreye almıştır:
1. **Proof of Origin (PO-Token) Zorunluluğu:** YouTube CDN `/api/timedtext` uç noktası artık `exp=xpe` parametresi içerdiğinde istek yapan istemcinin gerçek bir tarayıcı oturumundan gelip gelmediğini BotGuard tarafından üretilen PO-token ile doğrulamaktadır.
2. **Boş Gövde ile 200 OK Yanıtı:** PO-token veya oturum doğrulaması bulunmayan doğrudan HTTP isteklerine YouTube HTTP 403 yerine `Content-Length: 0` ile `200 OK` dönerek istemcileri sessizce boşa düşürmektedir (`jdepoix/youtube-transcript-api` kütüphanesinin v1.1.0'da `PoTokenRequired` hatası fırlatma sebebi budur).
3. **protokol-7 Çözüm Mimarisi (Çift Motorlu Hibrit Tasarım):**
   - **Motor A (Hafif HTTP / Innertube):** `ytInitialPlayerResponse` ve `ytInitialData` üzerinden video detayları, oynatma durumu ve altyazı meta bilgilerini çeker. PO-token veya proxy sağlandığında sıfır tarayıcı maliyetiyle yüksek hızda çalışır.
   - **Motor B (Headless Chromium / Playwright Fallback):** Doğrudan HTTP motorunun PO-token veya boş gövde engeline takıldığı senaryolarda devreye girer. `BrowserPool` ve `StealthManager` ile YouTube watch sayfasını açar; BotGuard'ın yasal tarayıcı doğrulamasını tamamlamasını sağlayarak DOM veya ağ yakalama (`intercept`) üzerinden altyazı bloklarını deterministik olarak çeker.
   - **Vekil Sunucu (Proxy) Desteği:** `ProxyManager` ile IP itibar engellerini aşmak üzere SOCKS5/HTTP rotasyonu desteklenir.

---

## 2. Mimari Sözleşmeler ve Tescil Protokolü (8 Adım)

`docs/actor-contract.md` standardı gereğince `youtube-transcripts` aktörü için uygulanacak adımlar:

### Adım 1: Tip Sözleşmeleri (`src/api/types.ts`)
- `ActorType` union listesine `"youtube-transcripts"` eklenmesi.
- `YoutubeTranscriptOutputFormat` tipi (`"captions" | "textWithTimestamps" | "xmlWithoutTimestamps" | "xmlWithTimestamps" | "singleStringText"`).
- `YoutubeTranscriptSegment` arayüzü (`start: number`, `end: number`, `text: string`).
- `YoutubeTranscriptRecord` arayüzü (başarılı ve başarısız kayıt alanları).
- `YoutubeTranscriptsActorTaskOptions` arayüzü (Apify uyumlu tüm parametreler ve gelişmiş ayarlar).
- `YoutubeTranscriptsActorResult` arayüzü (toplam işlenen, başarılı, başarısız kayıtlar ve GFM markdown çıktısı).
- `ActorTask.options` nesnesine `youtubeTranscriptsOptions?: YoutubeTranscriptsActorTaskOptions` eklenmesi.

### Adım 2: Aktör Sınıfı (`src/actors/corpus/youtube-transcripts-actor.ts`)
- `IActor<YoutubeTranscriptsActorResult>` sözleşmesinin uygulanması.
- `actorType = "youtube-transcripts"` kimliği.
- `SSRFGuard.validateUrlWithDns` ile YouTube dışı veya özel ağlara (RFC 1918, metadata IP) yönelimlerin engellenmesi.
- URL normalizasyonu: `watch?v=ID`, `youtu.be/ID`, `shorts/ID`, `embed/ID` linklerinden standart 11 karakterli `videoId` ayrıştırma.
- Çift motorlu yürütme stratejisi (Hafif HTTP denemesi -> PO-Token / 0-byte tespiti -> Playwright Chromium fallback).
- Altyazı biçimlendirme motoru (seçilen `outputFormat` değerine göre dönüştürme ve XML entity temizliği).
- GFM Markdown raporlayıcı (özet tablosu, üstveri paneli ve tam metin).

### Adım 3: Kategori Bareli İhracı (`src/actors/corpus/index.ts`)
- `export * from "./youtube-transcripts-actor";` satırının eklenmesi.

### Adım 4: Kök Barel İhracı (`src/index.ts`)
- `YoutubeTranscriptsActor` ve ilişkili tiplerin dışa aktarılması.

### Adım 5: Katalog Manifestosu ve MCP Araç Tanımı (`src/actors/actor-manifests.ts`)
- `ACTOR_MANIFESTS["youtube-transcripts"]` girdisi:
  - Başlık: `YouTube Transcripts & Captions Harvester`
  - Kategori: `"SCRAPING"`
  - Etiketler: `["youtube", "transcripts", "captions", "audio-text", "subtitles", "llm-corpus"]`
  - Apify ile tam uyumlu Zod/JSON şema özellikleri ve açıklamaları.
  - MCP Araç Tanımı: `query_youtube_transcripts`.

### Adım 6: Merkezi Aktör Kaydı (`src/actors/actor-registry.ts`)
- `createDefaultActorRegistry` içine `registry.register(new YoutubeTranscriptsActor())` kaydının eklenmesi.

### Adım 7: REST API ve MCP Entegrasyonu
- `src/api/server.ts`: `POST /api/v1/youtube-transcripts` uç noktası.
- `src/mcp/protokol-mcp-server.ts`: `query_youtube_transcripts` aracının `tools/list` ve `tools/call` yönlendiricilerine bağlanması.
- `src/api/openapi-spec.ts`: OpenAPI 3.1.0 şemasına `/api/v1/youtube-transcripts` patikasının eklenmesi.

### Adım 8: Örnekler, Boru Hattı ve Dokümantasyon
- `examples/actors/youtube-transcripts.json`: Asgari geçerli REST/MCP girdi örneği.
- `examples/pipelines/youtube-transcripts-pipeline.yaml`: Zstd-Parquet ve JSONL dışa aktarımlı bildirimsel ETL boru hattı.
- `docs/actors/youtube-transcripts.md`: Mermaid durum, mimari ve sıra diyagramlarını içeren teknik wiki.
- `context/architecture-schema.md`: Aktör sayısı (45) ve bileşen envanterinin güncellenmesi.

---

## 3. Veri Sözleşmesi ve Şema Detayları

### 3.1 Girdi Şeması (`YoutubeTranscriptsActorTaskOptions`)
```typescript
export type YoutubeTranscriptOutputFormat =
  | "captions"
  | "textWithTimestamps"
  | "xmlWithoutTimestamps"
  | "xmlWithTimestamps"
  | "singleStringText";

export interface YoutubeTranscriptsActorTaskOptions {
  urls?: string[];
  videoId?: string;
  outputFormat?: YoutubeTranscriptOutputFormat;
  languageCode?: string;
  maxRetries?: number;
  preferBrowser?: boolean;
  poToken?: string;
  channelNameBoolean?: boolean;
  channelIDBoolean?: boolean;
  dateTextBoolean?: boolean;
  relativeDateTextBoolean?: boolean;
  datePublishedBoolean?: boolean;
  viewCountBoolean?: boolean;
  likesBoolean?: boolean;
  commentsBoolean?: boolean;
  keywordsBoolean?: boolean;
  thumbnailBoolean?: boolean;
  descriptionBoolean?: boolean;
  timeoutMs?: number;
  proxy?: ProxyConfig;
}
```

### 3.2 Çıktı Şeması (`YoutubeTranscriptsActorResult`)
```typescript
export interface YoutubeTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface YoutubeTranscriptRecord {
  videoId: string;
  title: string;
  captions: string[] | YoutubeTranscriptSegment[] | string | null;
  channelName?: string | null;
  channelID?: string | null;
  datePublished?: string | null;
  dateText?: string | null;
  relativeDateText?: string | null;
  viewCount?: string | null;
  likes?: string | null;
  comments?: string | null;
  keywords?: string | null;
  thumbnailUrl?: string | null;
  description?: string | null;
  status?: "completed" | "failed";
  reason?: string | null;
  processedBy?: "http-innertube" | "playwright-browser";
  transcriptFound: boolean;
}

export interface YoutubeTranscriptsActorResult {
  totalProcessed: number;
  successfulCount: number;
  failedCount: number;
  records: YoutubeTranscriptRecord[];
  queryUrl: string;
  markdown: string;
}
```

---

## 4. Test Stratejisi ve Doğrulama Kriterleri

1. **Birim Testleri (`tests/youtube-transcripts-actor.test.ts`):**
   - URL Normalizasyonu: Farklı URL varyasyonlarının (`youtube.com/watch`, `youtu.be`, `shorts`, salt ID) doğru `videoId` üretmesi.
   - SSRF Savunması: `http://169.254.169.254`, `http://localhost`, `http://10.0.0.1` veya YouTube harici şüpheli alan adlarının engellenmesi.
   - Format Dönüşümleri: Altyazı dizisinin `captions`, `textWithTimestamps`, `singleStringText`, `xml` formatlarına kusursuz dönüşümü.
   - Boş Altyazı ve Hata Yönetimi: Altyazısı bulunmayan videolarda `transcriptFound: false` ve `status: "failed"` bayraklarının tutarlı dönmesi.
2. **Entegrasyon Testleri (`tests/server.test.ts`, `tests/protokol-mcp-server.test.ts`):**
   - `POST /api/v1/youtube-transcripts` HTTP REST uç noktası yanıt kodu ve JSON yapısı.
   - `query_youtube_transcripts` MCP aracının JSON-RPC üzerinden başarılı yürütülmesi.
3. **Kalite Kapıları:**
   - `npm run verify`: Biome lint, format, tip denetimi ve test süitinin eksiksiz geçmesi.
   - `npm run doctor`: Sistem sağlık taraması.
