# Yeniden Yazma Kalıpları (Rewrite Patterns)

Pazarlama dili veya muğlak ifadeler içeren adları teknik karşılıklarına dönüştürme rehberi.

| Yasaklı / Kötü İsim | Teknik / Temiz İsim | Neden / Gerekçe |
| :--- | :--- | :--- |
| `SmartCache` | `TtlLruCache` / `MemoryCache` | Cache'in stratejisini (TTL, LRU) teknik olarak belirtir. |
| `IntelligentRouter` | `ModelRouter` / `LatencyBasedRouter` | Yönlendirmenin neye göre yapıldığını açıklar. |
| `AdvancedScraper` | `PlaywrightScraper` / `DynamicDomScraper` | Hangi teknoloji ve mekanizmayla çalıştığını açıklar. |
| `NextGenAgent` | `ReActAgent` / `PlannerAgent` | Ajanın mimarisini (ReAct, Plan-and-Solve) açıklar. |
| `UltraFastQueue` | `RedisTaskQueue` / `FifoQueue` | Kuyruğun altyapısını ve veri yapısını açıklar. |
| `EnhancedSession` | `EncryptedSessionStore` / `CookieSession` | Saklama biçimini veya güvenlik katmanını belirtir. |
| `SeamlessConnector` | `WebSocketTransport` / `HttpPollingClient` | Hangi ağ protokolünü kullandığını netleştirir. |
| `RobustWorker` | `RetryableJobWorker` / `WorkerProcess` | Hata politikasını (retry) somutlaştırır. |
| `AiPoweredSearch` | `VectorIndexSearch` / `HybridRetriever` | Arama mekanizmasını (vektör/hibrit) teknik olarak belirtir. |
| `MagicTransformer` | `HtmlToMarkdownConverter` | Girdi ve çıktının ne olduğunu açıklar. |
| `GeneralHelper` | `UrlNormalizer` / `PathResolver` | Tekil sorumluluk prensibini yansıtır. |
