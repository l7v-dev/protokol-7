# Hugging Face araştırma kaynakları

`sources.json`, kullanıcının `turkiye_llm_veri_ekosistemi.md` araştırmasındaki 12 veri setini ve OttomanNLP kuruluşundan keşfedilen 5 ilgili veri setini tam commit kimliğiyle sabitler. Genel Türkçe Hub kataloğu tek başına veri seti sayılmaz.

Bu araç ham dosya arşivler; normalizasyon, eğitim karışımı veya yeniden yayımlama yapmaz. Mevcut Hugging Face aktörünün REST/MCP davranışını değiştirmez. Metin, ses ve Osmanlıca OCR dosyaları kendi repo/split yollarıyla korunur.

## Çalıştırma

Proje kökünden:

```bash
.venv/bin/python pipelines/snapshot/huggingface/orchestrator.py discover
.venv/bin/python pipelines/snapshot/huggingface/orchestrator.py run --min-free-disk-gb 25
.venv/bin/python pipelines/snapshot/huggingface/orchestrator.py status
.venv/bin/python -m unittest pipelines.snapshot.huggingface.test_snapshot -v
```

`discover` dosya listesini sayfalayarak toplar, erişimi küçük bir akış isteğiyle sınar ve boyutları kaydeder. TQuAD için yükleyicide açıkça belirtilen iki JSON dosyasını GitHub commit'ine sabitleyerek doğrular; yükleme betiğini çalıştırmaz. Kaynak başına hata/erişim engeli diğer kaynakların keşfini durdurmaz.

`run --max-files 30` pilot içindir. Sınırsız dosya sayısı yalnızca keşfedilmiş sabit manifestoyu işler. Dosyalar küçükten büyüğe ve tek işçiyle aktarılır; yerel disk rezervi her blokta denetlenir. Aktif indirme yeniden başlatılır, tamamlanmış dosyalar katalogdan sürdürülür; byte-range resume henüz yoktur.

## Kayıt ve depolama

- SQLite katalog: `data/huggingface/catalog.sqlite`.
- İncelenebilir manifesto: `data/huggingface/manifest.json`.
- Geçici dosyalar: `data/huggingface/staging/`.
- Drive hedefinin doğrulanmış metadata'sı: `data/huggingface/drive-target.json`.
- Drive düzeni: `protokol-object-vault/HuggingFace/<owner--repo>/<commit>/<kaynak yolu>`.
- `inventory-start.json` ve `inventory-current.json`: başlangıç ve çalıştırma sonu arşiv manifestoları. Devam eden işin güncel durumu yerel SQLite/manifestodan okunur.

Kaynak boyutu ve varsa kaynak SHA-256 kontrol edilir. Her dosyanın yerel SHA-256 ve MD5'i kaydedilir. Drive'da boyut ve gerçek `md5Checksum` okunarak doğrulanmadan yerel dosya silinmez. Ortak aktarım modülünün silme seçeneği kapalıdır; silme doğrulama ve SQLite commit'inden sonra bu araç tarafından yapılır.

Yükleme sonrası katalog commit'i öncesinde kesilirse, aynı hedef klasörde ad/boyut/MD5 eşleşmesiyle dosya yeniden bulunur. Katalog commit'i ile yerel silme arasında kesinti olması durumunda küçük bir yerel artık kalabilir; otomatik temizleme henüz uygulanmadı. Aynı katalogla iki yazıcı `flock` ile engellenir. Aktarım hatasında iş durur ve veri korunur; hata nedeni dosya kaydında sınıf adıyla tutulur. Yeniden çalıştırma kalan dosyaları işler.

Token yalnızca `huggingface.co` origin'ine gönderilir; `HF_TOKEN` veya Hugging Face önbellek tokenı kullanılır. URL ve yönlendirme hostları sabit izin listesiyle sınırlıdır. Token veya imzalı URL loglanmaz.

## Kapsam kararları

- CulturaX ve TurkASR-Bench: mevcut hesapta 403; yetki sağlanınca `discover` yeniden çalıştırılır. Araç kullanıcı adına koşul kabul etmez.
- MADLAD-400: `data/tr/tr_clean_*`; noisy sürüm ve alternatif `data-v1p5` aynı arşive karıştırılmaz.
- FineWeb2: `data/tur_Latn`; `_removed` bölümü hariç.
- mC4: araştırmanın `mC4_3.1.0` revision'ı ve yalnızca `c4-tr.*` dosyaları.
- FLEURS: ses içeren Türkçe Parquet dağıtımı; mükerrer TAR kopyası hariç.
- OttomanNLP: Parquet bulunan veri setlerinde `data/` dağıtımı; mükerrer ZIP/kök Parquet hariç. Görseller ve eşleşen metadata aynı kaynak yollarında korunur.

Lisans bilgileri ve kartlar arşivlenir; indirme erişimi ticari eğitim veya yeniden dağıtım izni olarak yorumlanmaz.
