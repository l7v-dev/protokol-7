# Instagram Veri Çıkarma Aktörü (`instagram`) — Doğrulama ve İnceleme Raporu (Walkthrough)

Bu doküman, `protokol-7` projesine 70. aktör olarak eklenen **Instagram Veri Çıkarma Aktörü** (`instagram` / `InstagramActor`) için yapılan geliştirmeleri, mimari kararları, ikili motor doğrulamasını ve test sonuçlarını belgeler.

---

## 1. Uygulanan Mimari Değişiklikler

### 1.1. Veri Tipleri ve Sözleşmeler (`src/api/types.ts`)
- `ActorType` union türüne `"instagram"` eklendi.
- `InstagramAction` (`profile`, `post`, `recent_posts`, `hashtag`), `InstagramMediaType` (`image`, `video`, `carousel`) tipleri tanımlandı.
- `InstagramActorTaskOptions`, `InstagramProfileRecord`, `InstagramMediaRecord`, `InstagramHashtagRecord`, `InstagramActorResult` güçlü tipli arayüzleri yazıldı.
- `ActorTask.options.instagramOptions` alanı eklendi.

### 1.2. İkili Motorlu Aktör Sınıfı (`src/actors/corpus/instagram-actor.ts`)
- `IActor<InstagramActorResult>` arayüzünü uygulayan `InstagramActor` sınıfı geliştirildi.
- **Seviye 1 (Hızlı HTTP API):** `safeRedirectFetch` ile `web_profile_info` ve `/?__a=1&__d=dis` uç noktalarından `X-IG-App-ID: 936619743392459` başlığıyla doğrudan veri çekimi.
- **Seviye 2 (Playwright Chromium Stealth Havuzu):** HTTP 401/403/429 engelleri veya oturum çerezleri (`sessionCookies`) varlığında `BrowserPool` üzerinden sıcak Chromium bağlamı edinimi, XHR/Fetch yanıtlarının yakalanması ve OpenGraph / JSON-LD DOM yedeklemesi.
- **Normalizasyon ve Güvenlik:**
  - `normalizeProfile`: Takipçi, takip, gönderi sayıları, onaylı rozet, biyografi ve zaman tüneli önizlemeleri.
  - `normalizeMedia`: Tekil görsel, video akış linkleri (`video_url`) ve çoklu karusel slaytları (`children`). Başlıktan otomatik etiket (`#tag`) ve bahsetme (`@mention`) ayıklaması.
  - `normalizeHashtag`: Popüler ve güncel gönderiler ile toplam etiket hacmi.
  - `synthesizeMarkdown`: LLM eğitimi için temiz GFM Markdown tabloları ve özetleri.
  - `SSRFGuard`: Hedef URL ve DNS IP çözümlemesinde özel ağ ve bulut meta-veri IP'lerinin engellenmesi.

### 1.3. Entegrasyon ve Kayıtlar
- `src/actors/corpus/index.ts` ve `src/index.ts`: Modül dışa aktarımları.
- `src/actors/actor-registry.ts`: `createDefaultActorRegistry` içine aktör kaydı.
- `src/actors/actor-manifests.ts`: Manifesto, girdi/çıktı Zod şeması ve `query_instagram` MCP araç tanımı.
- `src/api/server.ts`: `POST /api/v1/instagram` ve `POST /instagram` REST uç noktaları.
- `src/api/openapi-spec.ts`: OpenAPI 3.1.0 rotası ve dokümantasyonu.
- `src/mcp/protokol-mcp-server.ts`: MCP tool parametre yönlendirmesi.
- `examples/actors/instagram.json`: Standart JSON girdi şablonu.
- `docs/actors/instagram.md`: Teknik kılavuz ve dokümantasyon.
- `src/actors/README.md`: Aktör rehberine 70. aktör olarak eklenmesi.
- `context/architecture-schema.md`: 70 aktörlük şema envanteri ile senkronizasyon.

---

## 2. Test ve Doğrulama Sonuçları

### 2.1. Birim ve Entegrasyon Testleri (`tests/instagram-actor.test.ts`)
- 11 birim ve entegrasyon testi eksiksiz geçti:
  1. `resolves targets correctly from URLs, usernames, shortcodes, and hashtags`
  2. `normalizes user profile payload accurately`
  3. `normalizes media post payloads with image, video, and carousel`
  4. `synthesizes clean GFM markdown for profiles and posts`
  5. `executes HTTP profile extraction successfully against mock server`
  6. `executes HTTP post extraction successfully against mock server`
  7. `executes HTTP hashtag extraction successfully against mock server`
  8. `rejects malicious or private IP target URLs when local network is disallowed`
  9. `is registered in ActorRegistry and discoverable by ActorType`
  10. `has complete metadata and query_instagram tool in ACTOR_MANIFESTS`
  11. `routes POST /api/v1/instagram through the HTTP server router`

### 2.2. Tam Regresyon ve Doğrulama Hattı (`npm run verify` & `npm test`)
- `npm test`: **895 testin tamamı (74 test takımı) sıfır hatayla geçti.**
- `npm run verify`:
  - `[1/6]` Mimari Dosya Bütünlüğü: `[OK]`
  - `[2/6]` İsimlendirme & Dokümantasyon Disiplini (Sıfır jargon): `[OK]`
  - `[3/6]` Loglama Disiplini (Sıfır emoji): `[OK]`
  - `[4/6]` Gizli Anahtar Taraması: `[OK]`
  - `[5/6]` Bağımlılık & SCA Denetimi: `[PASS]`
  - `[6/6]` Kod Stili & Biome Lint: `[OK]`
- `[PASS] DOGRULAMA BASARILI: Kod tabanı tüm doğrulama katmanlarından geçti.`
