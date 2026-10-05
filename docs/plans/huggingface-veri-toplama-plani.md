# Hugging Face Veri Toplama ve Arşivleme Planı

Tarih: 2026-10-05
Durum: Kullanıcının sağladığı Türkiye LLM araştırmasındaki Hugging Face kaynakları için ham arşivleme uygulandı; 2026-10-05 tarihinde keşif ve pilot aktarım başlatıldı.
Güven kademesi: Plan ve yeni modül taslağı Tier 1; mevcut çekirdek dosyalardaki entegrasyon değişiklikleri Tier 2 olarak ayrıca değerlendirilir.

## 1. Amaç ve kapsam varsayımı

Güncel kapsam: Kullanıcı araştırmadaki Hugging Face kaynaklarının çekilmesini istedi. `pipelines/snapshot/huggingface/sources.json` 12 doğrudan dataset ve OttomanNLP kuruluşundan 5 veri setini sabitler. Metin, ses ve OCR ham dosyaları kapsamda; normalizasyon sonraki fazdır. 15 erişilebilir kaynakta 565 dosya / 471.801.019.644 bayt keşfedildi. CulturaX ve TurkASR-Bench mevcut hesap yetkisiyle 403 verdi. Hedef, mevcut Drive arşiv kökü altındaki `HuggingFace/` klasörüdür. Aşağıdaki ilk taslak, bu kapsam güncellemesiyle birlikte okunmalıdır.

Kullanıcının isteği Hugging Face için plan oluşturulmasıdır. Ayrıntılı kapsam henüz belirtilmediği için mevcut DergiPark, DOAJ ve Aperta akışları temel alınmıştır: seçilmiş Hugging Face veri setlerini sürümü sabitlenmiş biçimde toplamak, SQLite katalogda izlemek ve Google Drive'a doğrulanmış olarak arşivlemek.

Hub'a veri yayımlama, model indirme/eğitimi ve inference bu taslağın kapsamı değildir. Hedef dataset listesi, config/split seçimi, toplam indirme bütçesi ve Drive klasörü uygulama başlangıcında netleştirilir. Tüm Hub'ı indiren sınırsız çalışma varsayılmaz.

## 2. Mevcut durum

- `src/actors/corpus/huggingface-datasets-actor.ts`: `HuggingFaceDatasetsActor` mevcut; `rows`, `splits`, `info`, `size` sorgularını ve isteğe bağlı token kullanımını içeriyor.
- `docs/plans/matematik-ve-benchmark-aktorleri-plani.md`: önceki aktör entegrasyonunu tamamlanmış olarak kaydediyor. Bu oturumda testler yeniden çalıştırılmadı.
- `pipelines/shared/`: katalog, temizleyici, sharder, nesne deposu ve Drive aktarımı için ortak bileşenler mevcut. Uygulamadan önce arayüzleri okunup uygun olanlar yeniden kullanılacak.
- `TASKS.md`: diğer veri kaynaklarının devam eden işleri kayıtlı. Yeni iş için ortak disk ve ağ bütçesi gözetilecek; kayıtlı süreçlerin canlı durumu pilot öncesinde kontrol edilecek.

## 3. Mimari kararlar

Mevcut TypeScript aktörü kısa süreli keşif ve örnekleme görevini sürdürecek. Büyük dosya aktarımı, paketleme ve yeniden başlatma mantığı `pipelines/snapshot/huggingface/` altında ayrı Python pipeline'ında çalışacak. REST/MCP taşıma kodu aktöre gömülmeyecek; mevcut registry ve kontrol düzlemi sınırları korunacak.

Ana veri yolu: dataset seçimi → commit sabitleme → dosya manifestosu → bütçe denetimi → indirme → doğrulama → isteğe bağlı normalizasyon → Drive aktarımı → uzak doğrulama → yerel temizlik.

Hub indirmelerinde `repo_type="dataset"`, tam commit kimliği ve seçili dosya yolları kullanılacak. `hf_hub_download` tek dosya; `snapshot_download` filtrelenmiş depo indirmesi için değerlendirilecek. SDK önbelleği disk tüketimine dahil edilecek. [Resmi indirme belgesi](https://huggingface.co/docs/huggingface_hub/guides/download)

Datasets Server `/rows` toplu arşivleme yolu olarak kullanılmayacak. `/parquet` çıktısı alternatif dosya keşfi sağlayabilir; kaynak revision ile dönüşüm revision'ı ayrı tutulacak, liste kapsamı doğrulanmadan tam veri seti kabul edilmeyecek. [Parquet keşif belgesi](https://huggingface.co/docs/dataset-viewer/parquet)

İlk sürüm doğrudan Parquet ve JSONL dosyalarını destekleyecek. CSV desteği açık şema/diyalekt ayarlarıyla eklenecek. Streaming ileriki genişletme olarak ele alınacak; iterable akışın checkpoint davranışı kanıtlanmadan dosya tabanlı resume ile eşdeğer sayılmayacak. [Streaming belgesi](https://huggingface.co/docs/datasets/stream)

## 4. Veri ve güvenilirlik sözleşmesi

- Her kaynak için `repo_id`, talep edilen revision, çözülmüş commit, config, split, dosya yolu, boyut, lisans bilgisi ve toplama zamanı kaydedilecek. Config/split eşleşmesi belirsizse dosya adından tahminle tamlık beyan edilmeyecek.
- İlk sürüm metin/tablosal veri odaklı olacak. Görsel, ses ve video referansları otomatik indirilmez; desteklenmeyen dosyalar gerekçeleriyle manifestoda görünür kalır.
- Kaynak dosyalar orijinal biçimde saklanacak; normalize edilmiş Zstd Parquet çıktısı ayrı türev olacak. Kaynak sütunları ve nested alanlar sessizce atılmayacak. Dönüşüm sürümü ve şema parmak izi kaydedilecek.
- Dosya kimliği `(repo_id, resolved_commit, path)`; türev kimliği ayrıca dönüşüm sürümünü içerecek. Config/split ayrımı ve kaynak satır konumu korunacak; eğitim/test split'leri birleştirilmeyecek.
- Önerilen durumlar: `discovered`, `downloading`, `downloaded`, `validated`, `uploaded`, `remote_verified`, `purged`; hata ve yeniden deneme bilgisi ayrıca tutulacak. Normalizasyon işi ayrı durumla izlenecek.
- İndirme `.part` dosyaya yapılacak, doğrulama sonrası atomik adlandırılacak. Yerel SHA-256 hesaplanacak; sunucu hash'inin algoritması bilinmiyorsa ETag doğrudan SHA-256 kabul edilmeyecek.
- Drive dosya kimliği, boyutu ve mevcut uzak checksum kaydedilecek. Uzak doğrulama sağlanmadan yerel kaynak veya türev silinmeyecek. Upload sonrası katalog yazımı öncesi çökmede uzak nesne bulunarak mükerrer yükleme önlenecek.
- Küçük metadata dosyaları README/lisans/manifestoyla birlikte saklanacak. Büyük Parquet dosyaları tekrar TAR.GZ içine zorlanmayacak.
- Token ortamdan okunacak, loglara ve manifestoya yazılmayacak. Token başka origin'e yönlendirmede taşınmayacak; indirici URL, yönlendirme ve yerel çıktı yolu doğrulaması yapacak.
- Kaynak Python scriptleri çalıştırılmayacak. Gated/private erişim mevcut hesap yetkisi gerektirir; erişim hatası kalıcı blok olarak kaydedilir. Açık erişim otomatik yeniden dağıtım izni sayılmaz; lisans ve amaç eşleşmesi kaynak bazında kaydedilir.

## 5. Uygulama fazları

### Faz 1 — Kaynak manifestosu ve kuru çalıştırma

- [ ] Seçilen veri setlerini ve config/split/dosya filtrelerini içeren yapılandırma biçimini tanımla.
- [ ] `contracts/source-descriptors/huggingface.json` taslağını mevcut sözleşme şemasıyla uyumlu oluştur; erişim/hak durumunu varsayılan olarak onaylı işaretleme.
- [ ] `discovery.py`: metadata ve dosya listesini getir, commit'i sabitle, sayfalamayı tamamla.
- [ ] `--dry-run`: dosya sayısı, bilinen toplam bayt, boyutu bilinmeyen dosyalar ve filtre kapsamını göster. Veri dosyası indirme veya Drive'a yazma yapma.

### Faz 2 — Katalog ve sınırlı indirici

- [ ] `ledger.py`: `data/catalogs/huggingface_catalog.sqlite` içinde dataset revision, kaynak dosya, türev ve aktarım kayıtlarını oluştur.
- [ ] `downloader.py`: dosya başına akış, zaman aşımı, iptal, sınırlı retry ve kısmi dosya kurtarması uygula.
- [ ] 429/5xx için `Retry-After` ve jitter içeren geri çekilme; 401/403 için tekrarsız erişim hatası uygula.
- [ ] `orchestrator.py`: önerilen `--dataset`, `--revision`, `--config`, `--split`, `--include`, `--max-bytes`, `--max-files`, `--workers`, `--min-free-disk-gb`, `--dry-run`, `--resume`, `--status` seçeneklerini uygula. Bunlar henüz mevcut komutlar değildir.
- [ ] Başlangıç önerisi: 2 işçi ve en az 25 GiB boş disk rezervi. Toplam bayt limiti açıkça belirtilmeli; bilinmeyen boyutlar için indirme sırasında bütçe uygulanmalı. Gerçek limitler mevcut işlerin tüketimine göre ayarlanmalı.

### Faz 3 — Normalizasyon ve Drive aktarımı

- [ ] `cleaner.py` ve `packer.py`: sınırlı batch ile PyArrow dönüşümü; satır sayısı, nested alanlar ve Unicode koruması; hatalı kayıtları sayılan ayrı karantinaya taşıma.
- [ ] `drive_sync.py`: ortak Drive bileşenini kullan; önerilen hedef `HuggingFace/<repo>/<commit>/raw` ve `normalized` ayrımıdır.
- [ ] README, lisans, kaynak manifestosu ve doğrulama özetini çıktıya ekle.
- [ ] Yükleme hatasında sınırlı kuyruğu durdur; disk dolana kadar indirmeye devam etme.

### Faz 4 — Kontrol düzlemi ve mevcut aktörle uyum

- [ ] Mevcut aktörün REST/MCP sözleşmesini ve testlerini doğrula; ikinci aktör/araç kaydı oluşturma.
- [ ] Arka plan tetikleme gerekiyorsa mevcut source registry/worker sözleşmesine handler ekle; uzun işi HTTP isteği içinde yürütme.
- [ ] Gerekli mevcut dosya değişiklikleri için Tier 2 kapsamını açıkça belirle. Paket sürümlerini ve uyumluluğu uygulama sırasında resmi kaynaklardan doğrula.
- [ ] Gerekli komutları ve mimari envanteri güncelle; aynı işin eşzamanlı iki kez çalışmasını lease/benzersiz iş anahtarıyla önle.

### Faz 5 — Test ve sınırlı pilot

- [ ] Mock testleri: sayfalama, eksik metadata, config/split ayrımı, revision değişimi, 401/403/429/5xx, zaman aşımı, bozuk indirme, yönlendirmede token izolasyonu ve path traversal.
- [ ] Kurtarma testleri: indirme ortası, upload sonrası katalog commit'i öncesi ve uzak doğrulama sonrası yerel silme öncesi kesinti; tekrar çalıştırmada kayıp veya mükerrer tamamlanmış çıktı olmamalı.
- [ ] Veri testleri: bağımsız fixture ile şema, Unicode, nested alanlar, satır sayısı ve kaynak/türev ilişkisinin korunması.
- [ ] Kaynak seçildikten sonra en fazla 1 GiB ve 2 dosyalık pilot; dosya küçük değilse alternatif küçük kaynak seç. Drive hedefi belirlendikten sonra uçtan uca aktarımı dene.
- [ ] İlgili Python, aktör ve sözleşme testlerini, ardından `npm run verify` çalıştır.
- [ ] Gerçek sonuçları `docs/walkthroughs/huggingface-veri-toplama-walkthrough.md` dosyasında kaydet ve `TASKS.md` durumunu güncelle.

## 6. Kabul ölçütleri

1. Kuru çalıştırma revision ve seçili dosya kapsamını açıkça gösterir; bütçe aşımı indirme başlamadan engellenir veya boyut bilinmiyorsa akış sırasında durdurulur.
2. Pilotun her dosyası kaynak commit'ine ve doğrulama kayıtlarına bağlanır; eksik dosya veya karantina varken iş tam başarılı görünmez.
3. Aynı iş yeniden başlatıldığında tamamlanmış dosyalar tekrar üretilmez; kısmi işlemler tutarlı biçimde kurtarılır.
4. Uzak doğrulama başarısızken yerel veri korunur; boş disk rezervi ve toplam bayt sınırı ihlal edilmez.
5. Mevcut Hugging Face aktörünün sözleşmeleri korunur ve gerekli doğrulamalar geçer.

## 7. Uygulama öncesi açık kararlar

- İlk dataset kimlikleri, dil/konu öncelikleri ve seçilecek config/split'ler.
- Ham arşivin yanında normalizasyon gerekip gerekmediği.
- Toplam indirme/depolama bütçesi ve Drive hedef klasörü.
- Yalnızca public kaynaklar mı, mevcut yetkili gated/private kaynaklar da mı kullanılacağı.

Bu kararlar plan yazımını engellemez; kapsamı ve maliyeti belirlemeden toplu indirme başlatılmaz.
