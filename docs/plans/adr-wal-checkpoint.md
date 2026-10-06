---
status: accepted
---
# SQLite WAL checkpoint siniri

Mevcut kataloglarda SQLite WAL korunur; NiFi'nin FlowFile journal'i ve Qdrant'in segment yasam dongusu SQLite dosyasina uygulanmaz. Kayit sayisina dayali bir "1 milyon" yeterlilik siniri icin olcum yoktur; karar WAL boyutu, yazma gecikmesi, checkpoint suresi ve uzun okuyucularin olculmesine dayanir. Canli checkpoint/kompaksiyon politikasi bu uygulamada degistirilmez.

SQLite checkpoint okuyucunun ihtiyac duydugu sayfada durabilir; varsayilan otomatik esik 1000 sayfadir. `prefix_truncate` ve `retain_closed`, ancak uygulamanin kendi sirali journal segmentleri olursa anlamlidir: onaylanmis prefix temizlenir, kapanmis fakat referanslari suren segment korunur; SQLite WAL dosyasi elle kesilmez veya silinmez. Zorlayici TRUNCATE icin bakim penceresinde okuyucu/yazici durumu ve SQLITE_BUSY davranisi once olculmelidir.

Kaynaklar: [SQLite WAL](https://www.sqlite.org/wal.html), [NiFi repository tasarimi](https://nifi.apache.org/nifi-docs/nifi-in-depth.html), [Qdrant storage](https://qdrant.tech/documentation/manage-data/storage/), [Qdrant optimizer](https://qdrant.tech/documentation/operations/optimizer/).
