# Proje Konsolidasyonu, Adlandırma Disiplini, Atıl Dosya Temizliği ve Taşınabilirlik Doğrulaması

Bu doküman; projedeki pazarlama jargonu içeren adlandırmaların ("big data" vb.) tasfiyesini, bağımsız ve atıl dosyaların `trash/` dizinine taşınmasını, çift başlı boru hatlarının tekil `scripts/corpus_pipeline/` altında birleştirilmesini, 31 aktörün `src/actors/README.md` ve `examples/actors/` altında belgelenmesini, `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` oluşturulmasını ve 6 katmanlı doğrulama hattının başarıyla tamamlandığını belgeler.

---

## 1. Yürütülen İşlemler

### A. Atıl Dosyaların `trash/` Dizinine Taşınması
* `.gitignore` dosyasına `trash/` kuralı eklendi.
* Projeden bağımsız çalışan ve çift başlılık yaratan `scripts/wikipedia_pipeline/` dizini `trash/wikipedia_pipeline/` altına taşındı.
* Kök dizindeki artık log ve kimlik dosyaları (`pipeline.log`, `credentials.json`, `token.json`, `omega-mcp.json`) `trash/` altına taşındı.
* Boş durumdaki `web/` dizini `trash/web/` altına taşındı.
* `scratch/` içindeki ~9 GB boyutundaki geçici Wikipedia XML dump dosyaları `trash/scratch_dumps/` altına taşındı.

### B. Adlandırma Disiplini ve Boru Hattı Birleştirmesi
* `scripts/bigdata_pipeline/` dizini teknik terim olan `scripts/corpus_pipeline/` olarak yeniden adlandırıldı.
* `examples/pipelines/bigdata-parquet-sample.yaml` -> `examples/pipelines/corpus-parquet-sample.yaml` olarak güncellendi.
* `package.json` içindeki `bigdata:*` ve bağımsız `wiki:*` betikleri kaldırılarak `corpus:pipeline` ve `test:corpus` komutları eklendi.
* `src/pipeline/processors/parquet-packer.ts` içindeki `scripts/wikipedia_pipeline` bağımlılığı kaldırılarak `process.env.PYTHON_PATH || "python3"` standardına geçildi.

### C. 31 Aktörün Dokümantasyonu ve Örnek Konfigürasyonlar
* `src/actors/README.md` hazırlandı:
  * 31 aktör 6 teknik kategoride sınıflandırıldı (Web, Bilim, Kamu/Hukuk, Kitap/Kültür, Kod/Standartlar, Belge/Arşiv).
  * Her aktörün amacı, REST endpoint'i, MCP aracı, örnek girdi ve çıktı JSON formatları açıklandı.
* `examples/actors/` dizini oluşturuldu ve 31 aktörün her biri için doğrudan kopyalanıp çalıştırılabilir hazır JSON konfigürasyon şablonları üretildi.

### D. Konteynerizasyon ve CI/CD Boru Hattı
* `Dockerfile`: Node.js 22 LTS, Playwright Chromium headless sistem bağımlılıkları ve Python 3 içeren multi-stage, non-root üretim konteyneri oluşturuldu.
* `docker-compose.yml`: Port 4000 (REST & OpenAPI) ve `/mcp` servislerini hacim eşlemeleri ve sağlık denetimiyle tek komutla ayağa kaldıran konfigürasyon eklendi.
* `.github/workflows/ci.yml`: Push ve PR anında Biome linter, adlandırma disiplini, TypeScript build, 435 test ve SCA güvenlik denetimini otomatik çalıştıran CI boru hattı kuruldu.

### E. Kök Dokümantasyon
* Kök `README.md` baştan yazılarak 31 aktör, Swagger UI (`/docs`), MCP araçları ve Docker kullanımıyla modernize edildi.
* `context/architecture-schema.md` ve `context/connectome.md` senkronize edildi.

---

## 2. Doğrulama Sonuçları

1. **Birim ve Entegrasyon Testleri (`npm test`):**
   * 435/435 test başarıyla geçti (0 hata, 0 atlama).
2. **Statik Analiz ve Biome Lint (`npm run lint`):**
   * 207 dosya hatasız doğrulandı.
3. **Teknik Adlandırma Denetimi (`npm run lint:naming`):**
   * Yasaklı pazarlama terimi ve jargonu bulunamadı.
4. **TypeScript Derleme (`npm run build`):**
   * Sıfır tip hatasıyla derleme tamamlandı.
5. **6 Aşamalı Deterministik Doğrulama Hattı (`npm run verify`):**
   * Mimari bütünlük, sıfır emoji, gizli anahtar, SCA canlı kayıt denetimi ve kod stili %100 onaylandı.
