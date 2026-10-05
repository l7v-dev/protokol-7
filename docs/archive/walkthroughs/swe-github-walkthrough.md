# Doğrulama Raporu: GitHub Aktörü ve SWE Korpus Entegrasyonu (Faz 2 - Adım 1)

Bu walkthrough raporu, **protokol-7** Faz 2 yazılım mühendisliği (SWE) ve muhakeme aktörleri kapsamındaki ilk bileşen olan `github-actor` geliştirme, tip sözleşmesi, test süiti ve MCP/REST entegrasyonunun doğrulanmasını belgeler.

---

## 1. Uygulanan Değişiklikler

1. **Tip Sözleşmesi (`src/api/types.ts`):**
   - `ActorType` union listesine `"github"` eklendi.
   - `GithubActorTaskOptions`, `GithubActorResult` sözleşmeleri tanımlandı.
   - `ActorTask.options.githubOptions` alanı genişletildi.

2. **Aktör Sınıfı (`src/actors/corpus/github-actor.ts`):**
   - `GithubActor` sınıfı kodlandı.
   - SSRFGuard hop-by-hop DNS doğrulama ve AbortController 30s zaman aşımı invariantları sağlandı.
   - GitHub REST API v3 üzerinden `owner/repo` koordinatları ve `action` (`repo`, `readme`, `issues`, `pulls`, `releases`, `tree`) çözümlendi.
   - İsteğe bağlı `token` veya ortam değişkeni `GITHUB_TOKEN` ile Bearer yetkilendirmesi entegre edildi.
   - Base64 kodlu README içeriği UTF-8 metne otomatik çözüldü.
   - LLM için yapılandırılmış GFM Markdown özet motoru entegre edildi.

3. **Merkezi Tescil ve Katalog:**
   - `src/actors/corpus/index.ts` ve `src/index.ts` barel ihracı tamamlandı.
   - `src/actors/actor-manifests.ts` içerisine Zod girdi şeması, etiketler ve `query_github` MCP araç tanımı kaydedildi (toplam 46 araç).
   - `src/actors/actor-registry.ts` içerisinde `createDefaultActorRegistry` kaydı yapıldı.
   - `src/mcp/protokol-mcp-server.ts` `tools/call` yönlendiricisine `githubOptions` eşlemesi eklendi.
   - `src/api/server.ts` içerisine `POST /api/v1/github` ve `/github` rotası eklendi.
   - `src/api/openapi-spec.ts` 3.1.0 şemasına `/api/v1/github` uç noktası işlendi.
   - `examples/actors/github.json` ve `examples/pipelines/github-pipeline.yaml` şablonları oluşturuldu.

4. **Teknik Dokümantasyon ve Mimari Şema:**
   - `docs/actors/github.md` Mermaid mimari/sıra/durum diyagramları ve girdi/çıktı sözleşmesiyle tamamlandı.
   - `context/architecture-schema.md` 36 aktör sayısıyla ve test envanteriyle güncellendi.
   - `src/actors/README.md` katalog fihristine 36. aktör olarak eklendi.
   - `context/connectome.md` başarıyla yeniden üretildi.

---

## 2. Test ve Kalite Kapısı Sonuçları

- **GitHub Aktörü Birim Testleri:** `tests/github-actor.test.ts` (9/9 PASS)
  - Aktör başlatma ve açıklama doğrulaması
  - Hedef URL ve opsiyonlardan ambar ve eylem çözümleme
  - Eylemlere özel GitHub API URL inşası
  - Eksik parametre durumunda 400 hatası üretimi
  - SSRF engeli (169.254.169.254 bulut metadata koruması)
  - Base64 README çözme ve Markdown formatlama
  - Ambar metaverilerinin GFM Markdown formatında render edilmesi
  - Issue, pull request ve release dökümlerinin GFM formatında üretimi
  - Upstream HTTP hata (404/500) yönetimi
- **HTTP Sunucu Entegrasyonu:** `tests/server.test.ts` (29/29 PASS)
  - `POST /api/v1/github` rotasının doğrulanması
- **MCP Sunucu Entegrasyonu:** `tests/protokol-mcp-server.test.ts` (11/11 PASS)
  - 46 kayıtlı MCP aracı ve `query_github` parametre yönlendirme doğrulaması
- **Statik Tip Güvenliği:** `npm run typecheck` (0 HATA)
