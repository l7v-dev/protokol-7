# Yerel Wikipedia Veri Çekme, Drive Eksik Tespiti ve Aktör Yürütme Raporu (Walkthrough)

Bu rapor, Google Drive hedef klasöründeki (`1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL`) Wikipedia veri kümesinin denetimini, eksik dillerin tespitini ve projenin yerel aktör mimarisi (`WikipediaActor` ve `PipelineRunner`) üzerinden doğrudan Google Drive'a veri çıkarma sürecini belgeler.

---

## 1. Google Drive Envanter Denetimi ve Eksik Diller

Google Drive v3 API üzerinden hedef klasör taranmış, her dil klasörünün altındaki veri (`data/`) ve metaveri (`metadata/`) dökümleri ve manifestoları doğrulanmıştır.

### 1.1 Drive'da Tamamlanmış Diller (23 Dil — ~22,6 Milyon Madde)

| Dil | Kod | Madde Sayısı | Parquet Boyutu | Durum |
|---|---|---|---|---|
| İngilizce | `en` | 6.581.817 | 6.009,2 MB (6,01 GB) | Tamamlandı |
| Fransızca | `fr` | 2.691.235 | 2.440,3 MB (2,44 GB) | Tamamlandı |
| Rusça | `ru` | 2.045.596 | 2.404,1 MB (2,40 GB) | Tamamlandı |
| İspanyolca | `es` | 2.022.535 | 1.929,5 MB (1,93 GB) | Tamamlandı |
| İtalyanca | `it` | 1.847.469 | 1.570,2 MB (1,57 GB) | Tamamlandı |
| Arapça | `ar` | 1.255.552 | 789,7 MB | Tamamlandı |
| Farsça | `fa` | 1.040.850 | 496,2 MB | Tamamlandı |
| Tatarca | `tt` | 685.716 | 68,9 MB | Tamamlandı |
| Türkçe | `tr` | 482.800 | 307,1 MB | Tamamlandı |
| Özbekçe | `uz` | 325.089 | 114,9 MB | Tamamlandı |
| Yunanca | `el` | 268.475 | 346,5 MB | Tamamlandı |
| Kazakça | `kk` | 243.757 | 97,8 MB | Tamamlandı |
| Azerice | `az` | 188.090 | 139,9 MB | Tamamlandı |
| Latince | `la` | 138.758 | 47,6 MB | Tamamlandı |
| Kırgızca | `ky` | 74.789 | 30,7 MB | Tamamlandı |
| Sanskritçe | `sa` | 12.200 | 13,8 MB | Tamamlandı |
| Uygurca | `ug` | 8.826 | 13,5 MB | Tamamlandı |
| Klasik Çince | `lzh` | 8.252 | 6,9 MB | Tamamlandı |
| Türkmence | `tk` | 4.142 | 3,6 MB | Tamamlandı |
| Eski İngilizce | `ang` | 4.142 | 1,3 MB | Tamamlandı |
| Eski Kilise Slavcası | `cu` | 1.269 | 0,3 MB | Tamamlandı |
| Aramice | `arc` | 946 | 0,2 MB | Tamamlandı |
| Gotça | `got` | 702 | 0,3 MB | Tamamlandı |

---

### 1.2 Drive'da Yarım Kalan Dil (Test Limitinde Durdurulmuş)

- **`de` (Almanca):** Drive'daki `dewiki_20260927_manifest.json` incelendiğinde `total_clean_articles: 2000` olduğu ve Parquet boyutunun yalnızca **13,7 MB** olduğu doğrulanmıştır. Almanca Wikipedia'da **3.154.351 madde** bulunmaktadır; dolayısıyla bu dil eksiktir ve tamamlanmalıdır.

---

### 1.3 Drive'da Bulunmayan Yüksek Değerli Dünya Dilleri

Wikimedia istatistik API'si ile canlı taranan ve henüz Drive'da bulunmayan diller (küçükten büyüğe sıralı):

| Sıra | Kod | Dil | Madde Sayısı |
|---|---|---|---|
| 1 | `te` | Telugu | 129.219 |
| 2 | `mk` | Makedonca | 164.953 |
| 3 | `hi` | Hintçe | 171.739 |
| 4 | `th` | Tayca | 188.214 |
| 5 | `ta` | Tamilce | 190.725 |
| 6 | `bn` | Bengalce | 191.643 |
| 7 | `sl` | Slovence | 199.118 |
| 8 | `ka` | Gürcüce | 199.456 |
| 9 | `lt` | Litvanca | 226.800 |
| 10 | `gl` | Galiçyaca | 235.163 |
| 11 | `hr` | Hırvatça | 235.629 |
| 12 | `sk` | Slovakça | 261.499 |
| 13 | `et` | Estonca | 262.151 |
| 14 | `cy` | Galce | 284.704 |
| 15 | `bg` | Bulgarca | 312.221 |
| 16 | `da` | Danca | 316.110 |
| 17 | `hy` | Ermenice | 331.926 |
| 18 | `eo` | Esperanto | 389.397 |
| 19 | `he` | İbranice | 405.676 |
| 20 | `ms` | Malayca | 444.059 |
| 21 | `eu` | Baskça | 496.580 |
| 22 | `ro` | Romence | 549.201 |
| 23 | `hu` | Macarca | 574.500 |
| 24 | `cs` | Çekçe | 599.030 |
| 25 | `fi` | Fince | 626.000 |
| 26 | `no` | Norveççe | 691.425 |
| 27 | `ur` | Urduca | 702.792 |
| 28 | `sr` | Sırpça | 709.066 |
| 29 | `ko` | Korece | 766.294 |
| 30 | `id` | Endonezce | 797.593 |
| 31 | `ca` | Katalanca | 804.755 |
| 32 | `pt` | Portekizce | 1.183.109 |
| 33 | `vi` | Vietnamca | 1.304.657 |
| 34 | `uk` | Ukraynaca | 1.435.778 |
| 35 | `ja` | Japonca | 1.520.345 |
| 36 | `zh` | Çince | 1.558.067 |
| 37 | `pl` | Lehçe | 1.709.271 |
| 38 | `nl` | Felemenkçe | 2.227.854 |
| 39 | `sv` | İsveççe | 2.628.179 |

---

## 2. Aktör Tabanlı Mimari Uygulaması ("Betik Yok, Aktör Çalışacak")

Kullanıcı direktifi doğrultusunda (`"actor çalışacak betık kullanmak yok actor templates bak istersen yapı zaten yapılmıştı"`), veri çekme işlemi harici Python betikleri yerine projenin yerel TypeScript aktör ve boru hattı mimarisi (`src/actors/corpus/wikipedia-actor.ts` ve `src/pipeline/pipeline-runner.ts`) üzerinden yapılandırılmıştır.

### 2.1 Yapılan İyileştirmeler

1. **`GoogleDriveStorage` OAuth2 Desteği:**
   - `src/pipeline/storage/google-drive-storage.ts` sürücüsüne `token.json` veya `credentialsJson` içinde bulunan OAuth2 yenileme belirteci (`refresh_token` ve `client_id`) ile Google Drive API v3 yetkilendirmesi eklendi.
2. **`WikipediaActor` Çoklu Madde Çekimi (`titles: string[]`):**
   - Tek bir çağrıda veya boru hattında birden fazla maddenin Parsoid HTML'ini çekip eşzamanlı olarak temiz GFM Markdown'a dönüştürme yeteneği eklendi.
3. **`fetchFullArticles` ile Arama Sonuçlarını Tam Metne Çevirme:**
   - Arama modunda bulunan maddelerin özet yerine tam sayfa Parsoid içeriğinin çekilerek markdown formatına çevrilmesi sağlandı.

---

## 3. Doğrulama ve Canlı Yürütme Kanıtları

### 3.1 Almanca (`de`) Çoklu Madde Çekimi ve Drive Yüklemesi
- **Boru Hattı:** `examples/pipelines/wikipedia-de-drive-pipeline.yaml`
- **Komut:** `npx tsx src/pipeline/cli.ts --config examples/pipelines/wikipedia-de-drive-pipeline.yaml`
- **Sonuç:**
  ```json
  {
    "runId": "run_1790542090899_1zuqfi",
    "pipelineName": "wikipedia-de-drive-pipeline",
    "actorId": "wikipedia",
    "status": "succeeded",
    "itemCount": 3,
    "durationMs": 5833,
    "receipt": {
      "backend": "drive",
      "uri": "drive://1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL/wikipedia-de-drive-pipeline_2026-09-27T20-48-13-466Z.jsonl#1ILB9eJw2S05Tan3q1SWpqvNhxdqaUAuU",
      "bytesWritten": 278793,
      "checksumSha256": "7c4adf2bc9d2195060982c48c46662434e209032abf06611d3cb4c935df32408",
      "timestamp": "2026-09-27T20:48:16.732Z"
    }
  }
  ```

### 3.2 Hintçe (`hi`) Arama ve Tam Metin Markdown Çıkarımı
- **Boru Hattı:** `examples/pipelines/wikipedia-hi-drive-pipeline.yaml`
- **Komut:** `npx tsx src/pipeline/cli.ts --config examples/pipelines/wikipedia-hi-drive-pipeline.yaml`
- **Sonuç:**
  ```json
  {
    "runId": "run_1790542113002_vt8vvc",
    "pipelineName": "wikipedia-hi-drive-pipeline",
    "actorId": "wikipedia",
    "status": "succeeded",
    "itemCount": 5,
    "durationMs": 4440,
    "receipt": {
      "backend": "drive",
      "uri": "drive://1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL/wikipedia-hi-drive-pipeline_2026-09-27T20-48-35-832Z.jsonl#1rPRaHenD0qujBv-W2codHv7tmhaIvjTc",
      "bytesWritten": 128396,
      "checksumSha256": "c35798f27d77d61c3b1cf57cc39292e04e1ad65fdcb92b68f51dbb3bc23c7f30",
      "timestamp": "2026-09-27T20:48:37.442Z"
    }
  }
  ```

### 3.3 Test ve Doğrulama
- **Testler:** 517/517 Node.js testi başarıyla geçti (`tests/**/*.test.ts`).
- **Doğrulama Hattı:** `npm run verify` 6/6 aşamada hatasız tamamlandı.
- **Sistem Sağlığı:** `npm run doctor` 7/7 aşamada yeşil geçti.
