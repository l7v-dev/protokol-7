# Yasaklı Kelime Listesi (Banned Words)

Aşağıdaki kelimeler ve türevleri; dosya, klasör, sınıf, arayüz (interface), fonksiyon, metod, değişken, commit mesajı ve PR başlıklarında **kullanılamaz**.

## 1. Pazarlama Sıfatları & Büyütücüler (Buzzwords)
- `smart` (örn: `SmartRouter`, `smartFetch`)
- `intelligent` (örn: `IntelligentAgent`)
- `advanced` (örn: `AdvancedParser`)
- `next-gen` / `nextgen` (örn: `NextGenValidator`)
- `ultra` / `super` / `hyper` / `mega` (örn: `UltraFastCache`)
- `enhanced` (örn: `EnhancedSession`)
- `optimized` (örn: `OptimizedCrawler`)
- `seamless` (örn: `SeamlessAuth`)
- `powerful` (örn: `PowerfulRunner`)
- `robust` (örn: `RobustClient`)
- `magic` / `magical` (örn: `MagicTransformer`)
- `lightning` (örn: `LightningSearch`)

## 2. Genel Geçer / İçi Boş AI Nitelemeleri
- `ai-powered` / `aipowered`
- `autonomous` (gerekmedikçe; teknik karşılığı `scheduled`, `event-driven`, `loop`, `worker` olmalı)
- `cognitive`
- `brain` (teknik karşılığı `runtime`, `orchestrator`, `evaluator`, `state-store`)

## 3. Belirsiz & Tembel İsimler (Ambiguous & Vague)
- `manager` (mümkünse daha spesifik: `coordinator`, `pool`, `lifecycle`, `registry`, `dispatcher`)
- `helper` / `utils` (tekil sorumluluk yerine çöp torbası olmaya yatkındır; spesifikleştirin: `date-formatter`, `url-normalizer`)
- `common` / `shared` (içerik belirsizse spesifik domaine taşıyın)
- `data` / `info` / `item` (bağlamsız tek başına kullanıldığında)
- `doSomething` / `handleStuff` / `process` (tek başına ne yaptığı belirsiz eylemler)

## Kural
İsim yalnızca **teknik nesneyi**, **eylemi** veya **veriyi** belirtmelidir:
- Ne yapıyor? (`fetchHtml`, `parseJson`, `compileTs`)
- Ne tutuyor? (`SessionStore`, `ActorRegistry`, `TaskQueue`)
- Hangi protokole/mekanizmaya dayanıyor? (`CheerioScraper`, `ProcessSandbox`, `SseStream`)
