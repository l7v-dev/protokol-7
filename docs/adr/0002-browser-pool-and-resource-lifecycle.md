# ADR 0002: Browser Pool and Chromium Resource Lifecycle Management

## Status
Accepted

## Context
1. Her sayfa ziyareti veya tarayıcı eylemi için sıfırdan bir Chromium süreci (`browser = await chromium.launch()`) başlatmak ~800ms - 2000ms gecikmeye ve aşırı CPU yüküne yol açar.
2. Açık bırakılan tarayıcı süreçleri ve sekmeleri ise uzun vadede bellekte sızıntılara (`OOM`) ve yetim zombi süreçlerin sistemde birikmesine neden olur.
3. Ayrıca bağlam oluşturulurken oluşabilecek istisnalarda sayaçların tutarsız kalması engellenmelidir.

## Decision
- `BrowserPool` singleton sınıfı üzerinden sıcak (warm) bir Playwright Chromium havuzu yönetilir.
- Tüm oturumlar için izole `BrowserContext` nesneleri türetilir.
- **Idle Kapanma**: 60 saniye boyunca hiçbir aktif bağlam (`activeContexts === 0`) kalmadığında, arka plandaki ana Chromium tarayıcı süreci `browser.close()` çağrısıyla otomatik kapatılır.
- **Kaynak Engelleme**: Görsel (`image`), medya (`media`), yazı tipi (`font`) ve harici izleme script'leri ağ seviyesinde filtrelenerek %70 bellek ve bant genişliği tasarrufu sağlanır.
- **Oturum Tasfiyesi**: `InteractiveBrowserController.closeSession(sessionId)` ve `DELETE /api/v1/browser/session/:id` uç noktaları ile oturumlar tamamlandığında bağlam kaynakları anında serbest bırakılır.

## Consequences
- **Pozitif**:
  - İlk başlatma sonrasındaki sayfa istekleri <100ms seviyesinde bağlam edinir.
  - Boşta kalan sunucularda Chromium bellek tüketmez; kaynaklar sisteme iade edilir.
  - Zombi süreç ve bellek sızıntıları tamamen engellenir.
- **Negatif**:
  - 60 saniyelik boşta kalma süresi sonrasında gelen ilk istekte Chromium'un yeniden başlatılması kaynaklı ~1 saniyelik bir gecikme oluşur.
