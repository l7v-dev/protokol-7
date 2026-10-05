# Aktör Wiki Şartnamesi, Dürüst Mimari Danışmanlık ve Merkezi MCP Bütünlüğü — Doğrulama Raporu

## 1. Yönetici Özeti

Bu görev kapsamında, kullanıcı talepleri doğrultusunda aktörlerin dokümantasyon, test ve MCP araç mimarisi kapsamlı bir şekilde analiz edilmiş, teknik riskler ve anti-pattern olasılıkları dürüst mimari ilkeler ışığında değerlendirilmiştir.

Ajanın körü körüne anti-pattern uygulaması engellenerek, `AGENTS.md` içerisine kalıcı **Dürüst Mimari Danışmanlık ve Erken Uyarı** kuralı eklenmiştir. Aktörler içerisine transport katmanı (`mcp/`) gömülmesi yerine; merkezi MCP sunucusunun (`src/mcp/protokol-mcp-server.ts`) tekilliği korunmuş, aktörlerin teknik wiki şartnameleri ise zengin Mermaid diyagramları (Mimari Flowchart, Sıra Şeması, Durum Makinesi) ile `docs/actors/` altında standartlaştırılmıştır.

---

## 2. Yapılan Değişiklikler ve Mimari Kararlar

### 2.1 AGENTS.md — Dürüst Mimari Danışmanlık ve Erken Uyarı İlkesi
`AGENTS.md` belgesindeki **Sabit İlkeler** bölümüne aşağıdaki kural kalıcı olarak eklendi:
> **Dürüst Mimari Danışmanlık ve Erken Uyarı:** Kullanıcı anti-pattern, katman kirliliği (ör. aktör içine transport/mcp gömme) veya verimsiz/hatalı bir yaklaşım önerdiğinde, ajanın körü körüne uygulaması kesinlikle yasaktır. Ajan derhal durup teknik riskleri açıkça belirtmeli, kullanıcıyı uyarmalı ve temiz standardı savunmalıdır.

### 2.2 Mimari Katman Ayrımı ve MCP Tekilliği
* **Aktörler Alan Mantığıdır (Domain Logic):** `src/actors/<kategori>/<ad>-actor.ts` içinde yer alır; HTTP, CLI veya MCP gibi istemci protokollerinden bağımsızdır.
* **MCP Bir Transport/Entegrasyon Katmanıdır:** `src/mcp/protokol-mcp-server.ts` altında tekil bir sunucudur. Bildirimsel araç şemaları `src/actors/actor-manifests.ts` dosyasından okunur. Aktör klasörleri içerisine 120+ dosya saçılması engellenmiştir.
* **Şartname ve Wiki Deposu:** Aktörlerin teknik şartnameleri `docs/actors/<ad>.md` altında, şablonu ise `docs/actor-wiki-template.md` dosyasında konumlandırılmıştır.

### 2.3 Wikipedia Aktörü ve Geriye Dönük Uyumluluk
* `src/actors/corpus/wikipedia-actor.ts` temiz kök-göreli importlarla oluşturuldu.
* `WikimediaActor` ve `WikipediaActor` sınıfları her iki adlandırma (`wikipedia`, `wikimedia`) ve görev seçenekleri (`wikipediaOptions`, `wikimediaOptions`) ile tam uyumlu hale getirildi.
* `src/actors/corpus/wikimedia-actor.ts` doğrudan `wikipedia-actor.ts` modülünü yeniden dışa aktaran geriye dönük uyumluluk modülü olarak ayarlandı.
* Geçici `src/actors/corpus/wikipedia/` klasörü tasfiye edildi.

### 2.4 İskele Üreteci (Scaffolder CLI) Standardizasyonu
* `scripts/scaffold-actor.mjs` temiz mimari gereksinimlerine göre güncellendi.
* Yeni bir aktör oluşturulduğunda (`npm run make:actor`):
  1. `src/actors/<kategori>/<ad>-actor.ts` (Alan aktörü)
  2. `tests/<ad>-actor.test.ts` (Birim test süiti)
  3. `docs/actors/<ad>.md` (Mermaid mimari, sıra ve durum şemalı teknik şartname)
  4. `examples/actors/<ad>.json` (Örnek girdi konfigürasyonu)
  5. `src/actors/<kategori>/index.ts` (Kategori modül dışa aktarımı)
  otomatik olarak üretilmektedir.

---

## 3. Doğrulama ve Test Sonuçları

### 3.1 Birim ve Entegrasyon Testleri (`npm test`)
* **Toplam Test Sayısı:** 509 test (77 test süiti)
* **Sonuç:** 509 BAŞARILI, 0 BAŞARISIZ, 0 İPTAL, 0 ATLANAN
* **Yürütme Süresi:** 48,7 saniye

### 3.2 Deterministik Doğrulama Hattı (`npm run verify`)
6 aşamanın tamamı başarıyla geçildi:
1. `[1/6] Mimari Dosya Bütünlüğü`: Tüm zorunlu dosyalar mevcut.
2. `[2/6] İsimlendirme ve Dokümantasyon Disiplini`: Sıfır pazarlama jargonu (`smart`, `robust` vb.) ve sıfır sohbet dili.
3. `[3/6] Loglama Disiplini`: Sıfır emoji kuralı geçerli.
4. `[4/6] Gizli Anahtar Taraması`: Sıfır secret / key sızıntısı.
5. `[5/6] Yazılım Tedarik Zinciri (SCA)`: 11 bağımlılık resmi npm kayıt defterinde doğrulandı.
6. `[6/6] Kod Stili ve Statik Analiz (Biome)`: 233 dosya incelendi, sıfır lint veya biçim hatası.
