---
name: neuro-ergonomic-communication
description: Kullanıcı durumuna göre bilişsel yükü (cognitive load) minimize eden, panik ve çaresizlik hissini engelleyip kontrolü (agency) kullanıcıya devreden nöro-ergonomik ve Matrix-stoik iletişim kural seti. Hata mesajları, sistem durum bildirimleri, rehberlik metinleri ve sohbet üslubu üretilirken daima bu kurallar uygulanır.
---

# Neuro-Ergonomic Communication — Durum Adaptasyonlu İletişim Protokolü

## 1. Nörolojik Temel ve Amaç

İnsan beyni belirsizlik ve hata anlarında tehdit algılar (amygdala uyarımı). Geleneksel sistemlerin yaptığı iki büyük hata vardır:
1. **Bilişsel Aşırı Yük (Cognitive Overload)**: `HTTP request failed with status 401 [openrouter]...` gibi ham dökümler kafa karıştırır, kullanıcıyı platformdan soğutur.
2. **Çaresizlik Hissi (Helplessness)**: *"Üzgünüz, beklenmedik bir hata oluştu"* gibi ifadeler kontrolü kullanıcının elinden alır, terk etme dürtüsü doğurur.

Matrix felsefesinin (Morpheus - Neo kırmızı hap diyaloğu) ve nöro-ergonominin çözümü:
> **Durumu 1 kısa cümlede tespit et, rotayı göster, kontrolü ve tercihi doğrudan kullanıcıya ver.**

---

## 2. Duruma Göre Üslup Adaptasyonu (State-Adaptive Cadence)

### A. Hata & Kesinti Anı (Sakinleştirici & Kontrol Verici)
- **Ton**: Düşük sesli, mutlak soğukkanlı, kararlı (Morpheus tonu).
- **Uzunluk**: 1-2 kısa cümle (5-9 kelime).
- **Yasaklar**: Ünlem işaretleri, yapmacık özürler ("Özür dileriz", "Üzgünüz"), kurban psikolojisi ("Bir hata oluştu").
- **Kural**: Ne olduğunu söyle, alternatif veya eylem rotası sun.
- **Örnekler**:
  - `Erişim anahtarı reddedildi. Yetkilendirmeyi kontrol edin.`
  - `Kredi tükendi. Kotayı yenileyin veya farklı bir hatta geçin.`
  - `Sinyal trafiği yoğun. Birkaç saniye sonra tekrar deneyin.`
  - `Sağlayıcı hattı kapandı. Alternatif bir modele geçin.`
  - `Sinyal zaman aşımına uğradı. Tekrar deneyin.`
  - `Veri akışı koptu. Bağlantıyı kontrol edip tekrar gönderin.`

### B. Bekleme & İşlem Akışı Anı (Güven Veren Operatör Dili)
- **Ton**: Operatör konsolu (Tank / Link dili); şeffaf, net.
- **Kural**: Sürecin kontrol altında olduğunu hissettir, belirsizliği gider.
- **Örnekler**:
  - `Sinyal kuruluyor...`
  - `Veri akışı işleniyor...`
  - `Araştırma başlatıldı...`

### C. Başarı & Onay Anı (Mütebessim Netlik)
- **Ton**: Abartısız, sade, tatmin edici.
- **Yasaklar**: Yapay coşku, havai fişek dili ("Tebrikler! Harika bir iş başardınız!").
- **Örnekler**:
  - `Bağlantı kuruldu.`
  - `Oturum güncellendi.`
  - `Değişiklikler işlendi.`

---

## 3. Siber Mitoloji Sözlüğü

Platform dili şu teknik ve mitolojik çapalardan beslenir:
- **Sinyal**: Bağlantı ve veri iletimi.
- **Hat**: Sağlayıcı veya iletişim kanalı.
- **Anahtar**: Yetki ve API anahtarı.
- **İz**: Oturum ve geçmiş kaydı.
- **Koordinat**: Sayfa, rota veya kaynak konumu.
- **Kesinti**: Hata veya kopma durumu.
- **Merkez**: Ana çalışma alanı / çalışma konsolu.

---

## 4. Uygulama ve Süreklilik
Bu kurallar istisna kabul etmez. Tüm kullanıcı arayüzü bileşenleri (`components/`), hata yakalayıcılar (`lib/chat/user-facing-errors.ts`), sistem durum çubukları ve model yanıtları bu dil disiplinine sadık kalır.
