# LLM Veri Fabrikası Boru Hattı Damıtma, Kalite Kapısı ve Tekilleştirme Planı

Bu plan; `media_1790517372501.md` (LLM Data Factory Architecture Standard) belgesinde tanımlanan NORMALIZE (Madde 13), ENRICH (Madde 14), DEDUP (Madde 15), STATISTICAL & DATA QUALITY (Madde 16) ve DATA QUALITY GATES (Madde 17) aşamalarının protokol-7 bildirimsel YAML boru hattı (`src/pipeline/`) motoruna entegre edilmesini tanımlar.

---

## 1. Temel İlkeler ve Kararlar (Core Invariants)

1. **Veri Soykütüğü ve Kriptografik İzlenebilirlik (Provenance):**
   * Ham içerik hiçbir zaman sessizce ezilmez. Her metin nesnesinde ham SHA-256 (`raw_sha256`) ve normalize edilmiş SHA-256 (`normalized_sha256`) saklanır.
2. **Kanonik Normalizasyon (Unicode NFKC & Whitespace Policy):**
   * Unicode NFKC standardizasyonu, görünmez kontrol karakterlerinin elenmesi (tab ve newline hariç), CRLF -> LF dönüşümü ve ardışık boş satırların sadeleştirilmesi.
3. **Endüstri Standardı Kalite Heuristikleri (FineWeb / Gopher):**
   * Metin başına kalite metrikleri: `char_count`, `word_count`, `estimated_tokens`, `symbol_ratio`, `alpha_ratio`, `duplicate_line_fraction`.
   * Yapılandırılabilir eşik değerleri (ör. minimum 30 kelime, maksimum %15 sembol oranı, maksimum %30 tekrarlayan satır oranı). Eşiği geçemeyen dokümanlar elenir veya veto bayrağıyla işaretlenir.
4. **Çok Kademeli Tekilleştirme (Exact & Near-Duplicate):**
   * Birebir (Exact) SHA-256 parmak izi kontrolü.
   * 64-bit SimHash algoritmasıyla yakın benzerlik (near-duplicate) tespiti.
5. **Bildirimsel YAML Boru Hattı Genişlemesi:**
   * `PipelineConfigSchema` içerisine `transforms`, `quality_gate` ve `dedup` blokları eklenerek pipeline yazarlarının kod yazmadan kalite kurallarını YAML üzerinden yönetmesi sağlanır.
6. **Sıfır Dış Bağımlılık ve Performans:**
   * Normalizasyon, metrik hesaplama ve parmak izi çıkarma işlemleri saf Node.js / TypeScript ile, sıfır ağır dış kütüphane bağımlılığıyla yürütülür.

---

## 2. Faz Faz Uygulama Adımları

### Faz 1: Metin Normalizasyon İşlemcisi (`src/pipeline/processors/text-normalizer.ts`)
* `normalizeText(text: string, options?: NormalizerOptions): string`
* NFKC dönüşümü, sıfır genişlikli boşlukların temizlenmesi, kontrol karakter filtresi, satır sonu kanonizasyonu.
* Nesne üzerindeki `content` veya `markdown` alanını dönüştürür; `raw_sha256` ve `normalized_sha256` ekler.

### Faz 2: Kalite Filtresi ve Heuristik Kapısı (`src/pipeline/processors/quality-filter.ts`)
* FineWeb/Gopher kuralları:
  * Kelime sayısı hesaplama (`wordCount`)
  * Karakter sayısı ve tahmini token sayısı
  * Sembol / kelime oranı (`symbolRatio`)
  * Alfabetik karakter oranı (`alphaRatio`)
  * Tekrarlayan satır oranı (`duplicateLineFraction`)
* `evaluateQuality(item: Record<string, unknown>, config: QualityGateConfig): QualityEvaluationResult`

### Faz 3: Tekilleştirme Motoru (`src/pipeline/processors/dedup-filter.ts`)
* `DedupEngine` sınıfı:
  * Exact SHA-256 set kontrolü (`seenExactHashes: Set<string>`).
  * 64-bit SimHash hesaplayıcı (`computeSimHash(text: string): bigint`).
  * Hamming mesafesi ile yakın benzerlik karşılaştırması (`hammingDistance(a: bigint, b: bigint): number`).
* Yinelenen kayıtları filtreler veya `duplicate_of` bağıntısıyla etiketler.

### Faz 4: Pipeline Şeması ve Runner Entegrasyonu (`schema.ts` ve `pipeline-runner.ts`)
* `src/pipeline/schema.ts`: `PipelineQualityGateSchema`, `PipelineDedupConfigSchema`, `PipelineTransformConfigSchema` eklenmesi.
* `src/pipeline/pipeline-runner.ts`: Aktörden gelen ham nesneleri sırasıyla Normalizer -> Quality Filter -> Dedup aşamalarından geçirip çıktı paketleyiciye (`parquet-packer`, `jsonl-writer`) besleme.
* Şard tamamlandığında `RegistryDatabase.recordVerificationAudit` ve `recordDatasetShard` kayıtlarının tutarlı işlenmesi.

### Faz 5: Kapsamlı Test Paketi ve Doğrulama
* `tests/pipeline-quality-and-dedup.test.ts`:
  * Normalizasyon testleri (Unicode NFKC, bozuk karakterler, boşluklar).
  * Kalite kapısı testleri (FineWeb/Gopher eşik değerleri, kısa metin vetoları, sembol spam vetoları).
  * Tekilleştirme testleri (Exact SHA-256 tekrar engeli, SimHash yakın benzerlik tespiti).
  * Uçtan uca YAML boru hattı çalıştırma testi.
* `npm test`, `npm run lint`, `npm run build` ve `npm run verify` kontrolleri.
