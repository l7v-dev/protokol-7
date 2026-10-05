# GitHub Actions Uzak Wikipedia LLM Parquet Veri Hattı Kurulum Raporu (Walkthrough)

Bu rapor, Wikimedia Wikipedia dökümlerinin uzak GitHub Actions sanal sunucularında çalıştırılarak doğrudan Google Drive'a Apache Parquet formatında mühürlenmesi için tamamlanan altyapı çalışmalarını belgeler.

---

## 1. Tamamlanan Kurulum ve Yapılandırma

1. **Uzak Depo Bağlantısı:**
   - Uzak depo `origin` olarak `git@github.com:l7v-dev/protokol-7.git` bağlandı ve `origin/main` başarıyla senkronize edildi.

2. **GitHub Secrets Entegrasyonu:**
   - Google Drive yetkilendirme dosyaları `gh secret set` ile depoya şifreli olarak tanımlandı:
     - `GDRIVE_TOKEN_JSON`
     - `GDRIVE_CREDENTIALS_JSON`

3. **İş Akışı (Workflow) Dosyası:**
   - Dosya: `.github/workflows/wikipedia-etl.yml`
   - Özellikler:
     - `workflow_dispatch` ile dinamik dil (`lang`), mod (`single` / `orchestrator`), in-flight streaming ve dry-run desteği.
     - Runner disk optimizasyonu (gereksiz SDK'ların silinerek 35 GB+ disk açılması).
     - Otomatik `scripts/wikipedia_pipeline/requirements.txt` kurulumu ve pip önbellekleme.
     - Google Drive kimlik enjeksiyonu ve temizliği.
     - Detaylı `$GITHUB_STEP_SUMMARY` metaveri ve karne çıktısı.

4. **Boru Hattı Uyumluluk İyileştirmesi:**
   - `scripts/wikipedia_pipeline/run_pipeline.py` modülüne hem kök dizin hem de alt klasör için `token.json` otomatik algılama desteği eklendi.

5. **Mimari Şartname Güncellemesi:**
   - `context/architecture-schema.md` dosyasına yeni iş akışı kaydedildi.

---

## 2. Doğrulama ve Çalıştırma

İş akışı hazır olduğunda depoya gönderilerek aşağıdaki komutla tetiklenebilir:

```bash
gh workflow run wikipedia-etl.yml -f lang=de -f mode=single
```
