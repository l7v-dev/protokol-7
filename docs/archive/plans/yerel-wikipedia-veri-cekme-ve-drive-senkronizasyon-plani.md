# Yerel Wikipedia LLM Veri Çekme, Eksik Tespiti ve Google Drive Senkronizasyon Planı

## 1. Google Drive Envanter Denetimi ve Mevcut Durum

Google Drive hedef klasörü (`1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL`) doğrudan Google Drive v3 API üzerinden sorgulanmış ve 24 dil klasörünün tamamı denetlenmiştir.

### 1.1 Google Drive'da Tamamlanmış Diller (23 Dil - Toplam ~22.6 Milyon Madde)

| Dil Kodu | Dil Adı | Madde Sayısı | Parquet Boyutu | Durum |
|---|---|---|---|---|
| `en` | İngilizce | 6.581.817 | 6.009,2 MB (6,01 GB) | COMPLETED |
| `fr` | Fransızca | 2.691.235 | 2.440,3 MB (2,44 GB) | COMPLETED |
| `ru` | Rusça | 2.045.596 | 2.404,1 MB (2,40 GB) | COMPLETED |
| `es` | İspanyolca | 2.022.535 | 1.929,5 MB (1,93 GB) | COMPLETED |
| `it` | İtalyanca | 1.847.469 | 1.570,2 MB (1,57 GB) | COMPLETED |
| `ar` | Arapça | 1.255.552 | 789,7 MB | COMPLETED |
| `fa` | Farsça | 1.040.850 | 496,2 MB | COMPLETED |
| `tt` | Tatarca | 685.716 | 68,9 MB | COMPLETED |
| `tr` | Türkçe | 482.800 | 307,1 MB | COMPLETED |
| `uz` | Özbekçe | 325.089 | 114,9 MB | COMPLETED |
| `el` | Yunanca | 268.475 | 346,5 MB | COMPLETED |
| `kk` | Kazakça | 243.757 | 97,8 MB | COMPLETED |
| `az` | Azerice | 188.090 | 139,9 MB | COMPLETED |
| `la` | Latince | 138.758 | 47,6 MB | COMPLETED |
| `ky` | Kırgızca | 74.789 | 30,7 MB | COMPLETED |
| `sa` | Sanskritçe | 12.200 | 13,8 MB | COMPLETED |
| `ug` | Uygurca | 8.826 | 13,5 MB | COMPLETED |
| `lzh` | Klasik Çince | 8.252 | 6,9 MB | COMPLETED |
| `tk` | Türkmence | 4.142 | 3,6 MB | COMPLETED |
| `ang` | Eski İngilizce | 4.142 | 1,3 MB | COMPLETED |
| `cu` | Eski Kilise Slavcası | 1.269 | 0,3 MB | COMPLETED |
| `arc` | Aramice | 946 | 0,2 MB | COMPLETED |
| `got` | Gotça | 702 | 0,3 MB | COMPLETED |

---

### 1.2 Google Drive'da Eksik / Yarım Kalan Diller

1. **Yarım Kalan Dil (Test Limitinde Kalmış):**
   - **`de` (Almanca):** Drive'da yalnızca **2.000 makale (13,7 MB)** mevcuttur. Test amacıyla `--limit 2000` ile çalıştırılmış olup gerçekte **3.154.351 makale** (~2,8 GB Parquet) içermektedir. Tamamlanması gerekmektedir.

2. **Google Drive'da Hiç Olmayan Yüksek Değerli Dünya Dilleri (Öncelik Sırasına Göre):**
   - **Küçük / Orta Ölçek (<500K Madde - Hızlı Tamamlanacaklar):**
     - `te` (Telugu): 129.219 madde
     - `mk` (Makedonca): 164.953 madde
     - `hi` (Hintçe): 171.739 madde
     - `th` (Tayca): 188.214 madde
     - `ta` (Tamilce): 190.725 madde
     - `bn` (Bengalce): 191.643 madde
     - `sl` (Slovence): 199.118 madde
     - `ka` (Gürcüce): 199.456 madde
     - `lt` (Litvanca): 226.800 madde
     - `gl` (Galiçyaca): 235.163 madde
     - `hr` (Hırvatça): 235.629 madde
     - `sk` (Slovakça): 261.499 madde
     - `et` (Estonca): 262.151 madde
     - `cy` (Galce): 284.704 madde
     - `bg` (Bulgarca): 312.221 madde
     - `da` (Danca): 316.110 madde
     - `hy` (Ermenice): 331.926 madde
     - `eo` (Esperanto): 389.397 madde
     - `he` (İbranice): 405.676 madde
     - `ms` (Malayca): 444.059 madde
     - `eu` (Baskça): 496.580 madde
   - **Geniş Ölçekli Diller (500K - 1.5M Madde):**
     - `ro` (Romence): 549.201 madde
     - `hu` (Macarca): 574.500 madde
     - `cs` (Çekçe): 599.030 madde
     - `fi` (Fince): 626.000 madde
     - `no` (Norveççe): 691.425 madde
     - `ur` (Urduca): 702.792 madde
     - `sr` (Sırpça): 709.066 madde
     - `ko` (Korece): 766.294 madde
     - `id` (Endonezce): 797.593 madde
     - `ca` (Katalanca): 804.755 madde
     - `pt` (Portekizce): 1.183.109 madde
     - `vi` (Vietnamca): 1.304.657 madde
     - `uk` (Ukraynaca): 1.435.778 madde
   - **Büyük Diller (1.5M+ Madde):**
     - `ja` (Japonca): 1.520.345 madde
     - `zh` (Çince): 1.558.067 madde
     - `pl` (Lehçe): 1.709.271 madde
     - `nl` (Felemenkçe): 2.227.854 madde
     - `sv` (İsveççe): 2.628.179 madde

---

## 2. Yerel Yürütme Mimarisi ve Kaynak Yönetimi

Kullanıcının kesin talimatı: **"githubdan devam etmeyecegiz localden"**.

- **Yerel Disk:** `/home` üzerinde 154 GB boş alan mevcuttur.
- **Disk Güvenliği:** `--clean-dump` parametresi ile her dilin ham `.xml.bz2` dökümü Parquet'ye dönüştürülüp Google Drive'a yüklendikten hemen sonra silinir. Böylece diskte asla birden fazla ham döküm birikmez.
- **Drive Senkronizasyon:** `GoogleDriveSequentialSyncQueue` ile her Parquet parçası üretildiği anda Google Drive'a akıtılır, MD5 doğrulaması yapılır ve yerel Parquet kopyası silinerek yerel disk tüketimi sıfırlanır.
- **Drive-Aware Skip:** `multi_lang_orchestrator.py` modülüne Google Drive'da zaten tamamlanmış 23 dili doğrudan atlama (skip) filtresi eklenir.

---

## 3. Yürütme Sıralaması

1. `scripts/wikipedia_pipeline/multi_lang_orchestrator.py` içine Google Drive denetimi ve tamamlanan dilleri otomatik atlama mekanizması entegre edilir.
2. Eksik diller küçükten büyüğe sıralanır.
3. Yerel arka plan süreci başlatılarak boru hattı çalıştırılır.
