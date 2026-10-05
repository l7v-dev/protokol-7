# Hugging Face Araştırma Kaynakları — Yürütme Kaydı

Tarih: 2026-10-05. Durum: Pilot tamamlandı; toplu aktarım başlatıldı, tüm veri henüz indirilmedi.

## Uygulanan kapsam

Kullanıcının `turkiye_llm_veri_ekosistemi.md` dosyasından 12 ayrı dataset bağlantısı çıkarıldı. OttomanNLP kuruluşunun 5 ilgili dataset'i eklendi. Genel Türkçe katalog bağlantısı veri seti sayılmadı. Kaynak dokümanın SHA-256 değeri, 17 sabit commit ve kapsam filtreleri `pipelines/snapshot/huggingface/sources.json` içinde kayıtlı.

Keşif sonucu 15 erişilebilir kaynak, 565 dosya ve 471.801.019.644 bayt (yaklaşık 472 GB / 439,4 GiB). Bu toplam CulturaX ve TurkASR-Bench'i içermez; her iki kaynak dosya erişiminde mevcut tokenla 403 döndürdü. Koşul kabulü veya erişim başvurusu yapılmadı.

Kaynaklar: VNGRS, FineWeb2 Türkçe, mC4 Türkçe, MADLAD-400 clean Türkçe, mOSCAR Türkçe, FLEURS Türkçe, TQuAD, Turkish STEM DPO, Turkish Instruct Reasoning DPO, tr-dpo-preferences; ayrıca OttomanNLP gazetteer, OpenITI satırları, Osmanlıca Ekmek ve Nişasta Kitabı, Akis ve CHURRO alt kümesi.

TQuAD Hub deposu veri yerine yükleme betiği içerdiğinden, betikteki resmî GitHub kaynakları commit'e sabitlenerek alındı. Betik çalıştırılmadı. FLEURS sesli Parquet ve Osmanlıca OCR görselleri kapsamda. Mükerrer dağıtım biçimleri ve MADLAD noisy/FineWeb removed sürümleri hariç tutuldu.

## Değişiklikler

- Yeni `pipelines/snapshot/huggingface/orchestrator.py`: sayfalanan keşif, sabit manifesto, SQLite durum, tek yazıcı kilidi, sınırlı retry, disk rezervi, boyut/hash doğrulaması ve Drive arşivleme.
- Yeni `sources.json`, `README.md` ve `test_snapshot.py`.
- Mevcut `BaseDriveSync` yeniden kullanıldı. `purge_on_success=False` ile aktarım yapılıp bağımsız Drive metadata okumasında gerçek MD5 ve boyut doğrulandıktan sonra yerel dosya siliniyor.
- Mevcut aktör, REST/MCP, ortak aktarım modülü ve bağımlılıklar değiştirilmedi.

## Doğrulama

- `.venv/bin/python -m unittest pipelines.snapshot.huggingface.test_snapshot -v`: 10/10 başarılı. Dil sınırları, path/host doğrulaması, kaynak hash/boyut bozulması, redirect token izolasyonu, 403 retry davranışı, pagination, disk rezervi ve uzak checksum/yeniden yükleme kurtarması kapsandı.
- 30 dosyalık canlı pilot: tamamı `remote_verified`; toplam 3.235.867 bayt. Pilot sonunda staging içinde dosya kalmadığı doğrulandı. Bu pilot küçük metadata ve OCR dosyalarıyla aktarımı doğrular; büyük corpusların tamamlandığını göstermez.
- `npm run verify`: altı doğrulama aşaması başarılı; Biome 364 dosyayı kontrol etti. Pipeline Python davranışı ayrıca yukarıdaki unittest ile doğrulandı.
- `git diff --check`: başarılı.

## Canlı iş ve sınırlar

Arka plan işi `.venv/bin/python -u pipelines/snapshot/huggingface/orchestrator.py run --min-free-disk-gb 25` ile başlatıldı. PID `data/huggingface/runner.pid` dosyasında; log `logs/huggingface.log`; güncel dosya durumları `data/huggingface/catalog.sqlite` ve `manifest.json` içinde.

Hedef klasör metadata okunarak doğrulandı: [Drive HuggingFace arşivi](https://drive.google.com/drive/folders/1nYsMPSI1ke1LX0PDFTXcczFJbEl5KegL).

Araç ham arşivleyicidir; satır normalizasyonu, corpuslar arası dedup ve eğitim karışımı yapmaz. Dosya seviyesinde devam eder; yarım indirmeyi baştan alır. Son retry sonrasında aktarım hatası olursa durur ve yerel veriyi korur. Katalog commit'iyle yerel silme arasındaki kesintide yerel artık kalabilir. Büyük hacmin tamamlanması ve erişim bekleyen iki kaynak sonraki takip işidir.
