# Uretici provenance ve runtime gecisi

Tier 2; kullanici tum ureticiler, API/WorkerPool activation ve commit/push istedi. OpenAlex'in onceki canli aktivasyon dislamasi korunur.

1. Ortak daemon monitor env'ini API ve worker systemd unit'lerine bagla; scheduler ve job backlog'u once denetle. Test fixture islerini backup/audit ile quarantine et.
2. Gercek raw artifact saklama/receipt ve merkezi belge/occurrence/run yazicisini idempotent, transaction ve FK denetimli kur. Temizlenmis veriyi raw diye etiketleme; eski eksik kaniti uydurma.
3. Ureticileri envanterle, raw elde etme ile belge append sinirlarini kaynak bazinda bagla. Dosya tabanli kaynaklarda raw artifact receipt kullan; belgeler yalniz gercek metin ciktisi icin olussun.
4. Canli migration'i immutable backup, ayri rehearsal kopyasi ve integrity/FK kaniti sonrasi uygula. Tum producer yollarini izole test et; mevcut aktif iscilere dosya/batch sinirinda kontrollu restart uygula. DOAJ kapali kalir.
5. Standart/spec incelemesi, testler, typecheck, verify, diff/secrets taramasi; duzeltmeler sonrasi commit ve remote branch push. Merge kapsamda degil.
