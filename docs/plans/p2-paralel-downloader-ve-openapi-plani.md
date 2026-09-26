# P2: Çok Parçalı Paralel İndirme Motoru ve OpenAPI 3.1 Entegrasyon Planı

Bu plan, Protokol-7 projesinde P2 öncelik seviyesindeki iki temel bileşenin uygulanmasını kapsar:
1. **İndirici Performansı:** `scripts/wikipedia_pipeline/downloader.py` içerisine çok parçalı eşzamanlı (HTTP Range / multi-part) paralel indirme motorunun eklenmesi (3x-8x bant genişliği doygunluğu).
2. **AI Ajanı Entegrasyonu:** Tüm REST API uçlarını ve veri aktörlerini standartlaştıran makine tarafından okunabilir OpenAPI 3.1.0 şema uç noktası (`GET /openapi.json`) ve görsel dokümantasyon (`GET /docs`) sunulması.

## Hedefler
- HTTP Range destekli büyük dosyalarda (Wikimedia bz2 dökümleri, büyük arşivler) eşzamanlı $N$ iş parçacıklı paralel segment indirme.
- Desteklenmeyen veya küçük dosyalarda otomatik tek akışlı (single-stream) in-flight MD5 moduna kesintisiz geri dönüş (fallback).
- OpenAPI 3.1.0 JSON şeması (`GET /openapi.json`) ile AI ajanlarının (LangChain, AutoGen, GPTs) otomatik araç bağlama yeteneğini sağlama.
- Sıfır dış bağımlılıklı interaktif API dokümantasyon konsolu (`GET /docs`).

## Değişiklik Yapılacak Dosyalar
- `scripts/wikipedia_pipeline/downloader.py` (Güncelleme - Range threadpool motoru)
- `scripts/wikipedia_pipeline/test_pipeline.py` (Güncelleme - Paralel indirme testleri)
- `src/core/openapi-spec.ts` (Yeni - OpenAPI 3.1.0 spesifikasyonu)
- `src/core/server.ts` (Güncelleme - `/openapi.json` ve `/docs` rotaları)
- `tests/server.test.ts` (Güncelleme - OpenAPI uç noktası testleri)
- `TASKS.md` (Güncelleme)
- `context/architecture-schema.md` (Güncelleme)

## Doğrulama Planı
- `npm run typecheck`
- `npm run test`
- `pytest scripts/wikipedia_pipeline/`
- `npm run verify`
- `npm run doctor`
- `curl -s http://localhost:3000/openapi.json`
