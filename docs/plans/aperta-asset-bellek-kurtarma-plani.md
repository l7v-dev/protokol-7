# Aperta asset bellek kurtarma

Tier 2; kullanici 2026-10-06 onayli kapsam.

1. Gercek worker yolunda dosya boyutundan kucuk bellek butcesiyle regresyon: once MemoryError, sonra eksiksiz TAR dogrulamasi.
2. HTTP cevabini 1 MiB parcalar ile sahip olunan gecici dosyaya indir; retry ayni gecici dosyayi truncate eder. Content-Length, challenge prefix, dosya limiti ve disk reserve kontrollerini koru.
3. TAR'a dosya stream'i ver; hard shard limit rotasyonunu katalog association commit'inden once yap. Append hatasinda association'i pending'e geri al.
4. Unsealed 5.448 kaydi kopyada prova edip canli katalogda pending yap; ham arşivleri koru.
5. Global WorkerPool'u acmadan dakikalik dedicated systemd heartbeat reaper etkinlestir.
6. OOM'daki Q14517.tar.gz ile 2 GiB unit altinda gercek indirme, metadata MD5 ve TAR roundtrip denetle; sonra Aperta'yi Restart=no ile baslat.
7. DOAJ kapali; DergiPark calisir; HF tamamlanmistir. Kalici provenance gecisi ayri kapsamdir.
