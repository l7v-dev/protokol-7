# Kültür ve Turizm Bakanlığı E-Kitap (ekitap.ktb.gov.tr) Arşivleme ve LLM Damıtma Planı

Bu belge, **Kültür ve Turizm Bakanlığı E-Kitap Portalı** (`https://ekitap.ktb.gov.tr/`) üzerindeki tüm dijital kitap, dîvân, mesnevî, tarih ve kültürel miras eserlerini indiren; KTB güvenlik/hotlink korumasını aşan, 4 kapılı Veto Zinciri ile doğrulayan ve **doğrudan akış içinde LLM için arındırılmış (sanitized) `.md.gz` formatına dönüştüren** boru hattının teknik şartnamesidir.

---

## 1. Hedef Sistem Analizi ve Kritik Bulgular

Yapılan teknik keşif ve HTTP paket incelemelerinde aşağıdaki kurallar tespit edilmiştir:

1. **Kategori Hiyerarşisi (Taxonomy):**
   - Kök kategoriler: `Edebiyat`, `Halk Bilimi`, `Halk Kütüphaneleri`, `Kültür`, `Kültürel Miras`, `Kütüphanecilik`, `Sanat`, `Tanıtım Eserleri`, `Tarih`, `Son Eklenen Kitaplar`.
   - Derinlik: Sayfalar hiyerarşik alt kategorilere ayrılır (Örn: `Edebiyat` $\to$ `Eski Türk Edebiyatı` $\to$ `Dîvânlar ve Mesnevîler` $\to$ `Dîvânlar` $\to$ Eser Sayfaları).
   - Eser rotası: `/TR-{id}/{slug}.html` (Örn: `/TR-277417/muhyi-divani.html`).
2. **Kritik Hotlink / Firewall Koruması (Anti-Hotlinking):**
   - Eser indirme bağlantısı `/Eklenti/{eklentiId},{slug}pdf.pdf?0` formatındadır.
   - **Önemli:** Doğrudan yapılan istekler KTB güvenlik duvarı tarafından `HTTP 404 Not Found` ile engellenmektedir.
   - İndirmenin başarılı (`HTTP 200 OK`, `application/pdf`) olması için istek başlığında mutlaka ilgili eser sayfasının `Referer: https://ekitap.ktb.gov.tr/TR-...` bilgisi bulunmalıdır.
3. **İki Aşamalı Sıralı Mimari (Two-Phase Sequential):**
   - **Faz 1 (İndirme):** Tüm kategoriler özyinelemeli taranır, PDF'ler `Referer` başlığıyla çekilir, Veto Zinciri ile `%PDF-` ve SHA-256 kontrolünden geçirilerek `raw_landing_pool/ktb-ekitap/` içine kaydedilir.
   - **Faz 2 (Damıtma & LLM Sanitization):** PDF'ler okunur; sayfa başlıkları, dipnotlar ve tireli satır bölünmeleri arındırılır; temiz Markdown üretilip Gzip ile `out/ktb-ekitap/` altına mühürlenir. Orijinal PDF'ler `trash/ktb-ekitap/` havuzuna aktarılır.

---

## 2. Entegre LLM Metin Arındırma (In-Pipeline LLM Sanitizer)

Kullanıcının belirttiği üzere, ayrı bir serviste ikinci bir işleme katmanı kurmak operasyonel sürtünmeyi ve disk maliyetini artırmaktadır. Bu nedenle metin temizliği **doğrudan damıtma anında** gerçekleştirilecektir:

| Gürültü Türü (Ham PDF Çıktısı) | Arındırma Yöntemi (Sanitizer) | Hedef Çıktı (LLM Formatı) |
|---|---|---|
| **Tekrarlayan Sayfa Başlığı/Altlığı** (`< < < Cilt/ 68 Sayı...`, `Kültür Bakanlığı Yayınları`) | Frekans filtresi: Belgedeki sayfaların %50'sinden fazlasında tekrarlanan 1-2. satırlar silinir. | Tamamen yok edilir, sadece gövde metni kalır. |
| **Bölünmüş Kelimeler (Hyphenation)** (`has- <br> talık`) | Regex: `([a-zA-ZçğıöşüÇĞİÖŞÜ])-[\r\n]+([a-zA-ZçğıöşüÇĞİÖŞÜ])` | `hastalık` (akıcı kelime). |
| **Sayfa Geçiş İmleri** (`--- [SAYFA GEÇİŞİ] ---`) | Cümle sonu denetimi: Önceki sayfa nokta/soru işaretiyle bitmiyorsa tek boşlukla birleştirilir. | Kesintisiz, akıcı paragraflar. |
| **Sayfa Numaraları** (`- 12 -`, `Sayfa 14`) | Yalnız duran sayı satırları temizlenir. | Çıkarılır. |
| **Dizgi Süslemeleri** (`< < <`, `• • •`, `......`) | Regex ile temizlenir. | Temiz metin. |

---

## 3. Havuz Dizin Yapısı (`/home/l7v/protokol-data-pool/`)

```text
/home/l7v/protokol-data-pool/
├── raw_landing_pool/ktb-ekitap/         -> Faz 1: İndirilen ham PDF'ler
├── out/ktb-ekitap/                     -> Faz 2: Nihai LLM kasası (PDF'SİZ)
│   ├── 00_map_index_pool/
│   │   ├── catalog.jsonl               -> Eser katalog metaverileri
│   │   ├── checksums.sha256            -> Kriptografik bütünlük imzaları
│   │   ├── checkpoint.json             -> Duraklatılabilir ilerleme durumu
│   │   └── manifest.json               -> Arşiv sözleşmesi
│   └── 01_refined_content_pool/        -> Arındırılmış .md.gz ve .json.gz dosyaları
├── trash/ktb-ekitap/                   -> Damıtılan orijinal PDF'ler (7 gün TTL)
└── quarantine_vetoed/ktb-ekitap/       -> Veto edilen bozuk/geçersiz yanıtlar
```

---

## 4. Kullanıcı İncelemesi Gerektiren Konular

> [!IMPORTANT]
> **KTB E-Kitap Koleksiyon Boyutu:**
> KTB E-Kitap portalında yüzlerce Dîvân, Mesnevî ve tarihi eser bulunmaktadır. Eserlerin birçoğu yüzlerce sayfalık Osmanlıca/Türkçe edebi transkripsiyonlardır.
> - Betik varsayılan olarak **kategori bazlı keşif** yapacak ve checkpoint sistemi sayesinde kesintiye uğrasa bile kaldığı yerden devam edebilecektir.
> - Test ve doğrulama için `--limit=10` parametresi desteklenecektir.

---

## 5. Uygulama Adımları

### Aşama 1: KTB E-Kitap Arşivleyicisi (`scripts/harvest-ktb-ekitap.mjs`)
- [ ] KTB Kategori ve Eser Ağacını özyinelemeli çözen BFS crawler algoritması.
- [ ] `Referer` başlığı enjeksiyonlu güvenli akış tabanlı indirme modülü.
- [ ] 4 Kapılı Veto Zinciri (`GATE1_METADATA`, `GATE2_MAGIC_BYTES`, `GATE3_CRYPTO`, `GATE4_CONTENT`).
- [ ] Entegre LLM Sanitizer (Header/footer silme, hece bağlama, akıcı paragraf birleştirme).
- [ ] İki aşamalı sıralı çalışma: `all`, `download`, `refine` fazları.
- [ ] 8 karakterli kanonik dosya adlandırması (`YYYY` + 4 haneli ID).

### Aşama 2: Actor Store & Server Entegrasyonu
- [ ] `src/actors/actor-manifests.ts` içerisine `ktb-ekitap` aktör manifesti ve şemalarının eklenmesi.
- [ ] Web MVP Store kataloğunda `ktb-ekitap` kartının ve görsel formunun aktif edilmesi.
- [ ] `package.json` içerisine `npm run harvest:ktb` komutunun eklenmesi.

### Aşama 3: Doğrulama ve Test
- [ ] Birim testi: `tests/harvest-ktb-ekitap.test.ts` (Referer koruması, Veto kapıları ve Sanitizer kuralları).
- [ ] `npm run verify` ile 6 aşamalı deterministik doğrulama kontrolü.

---

## 6. Doğrulama Planı

```bash
# Test çalıştırması (1 eser indirip damıtarak tüm boru hattını doğrular)
node scripts/harvest-ktb-ekitap.mjs --limit=1

# Tam doğrulama hattı
npm test
npm run verify
```
