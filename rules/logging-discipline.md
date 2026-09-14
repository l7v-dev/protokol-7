# Logging & Output Discipline — Deterministik Çıktı Standardı

Bu kural, projede çalışan ajanların ve betiklerin ürettiği tüm konsol logları, hata mesajları, durum bildirimleri ve raporlama metinleri için bağlayıcıdır.

## 1. Sıfır Emoji Kuralı (Zero Emoji - Zorunlu)

- **YASAK:** Her türlü Unicode emoji veya grafik sembol (`🚀`, `✅`, `❌`, `🎉`, `⚠️`, `ℹ️`, `📌`, `⛔`, `💡`, `🔥` vb.).
- **Gerekçe:** Emojiler deterministik log ayrıştırıcılarını (grep, awk, jq, CI/CD log parsers) bozar, token israfı yaratır ve kurumsal mühendislik disiplinine aykırıdır.

## 2. Standart Durum Etiketleri (Standard ASCII Tags)

Tüm log çıktıları aşağıdaki standart ASCII etiketleriyle başlamalıdır:

| Seviye / Durum | Standart Etiket | Kullanım Amacı |
|---|---|---|
| **Başarı** | `[OK]` veya `[PASS]` | Bir kontrol, test veya işlem başarıyla tamamlandığında. |
| **Hata** | `[ERROR]` veya `[FAIL]` | Bir işlem çöktüğünde, doğrulama başarısız olduğunda veya kural ihlalinde. |
| **Uyarı** | `[WARN]` | Kritik olmayan anomali, dikkat edilmesi gereken durum. |
| **Bilgi** | `[INFO]` | Süreç adımları, durum güncellemeleri. |
| **Doğrulandı** | `[VERIFIED]` | Canlı kayıt, tip veya sözleşme doğrulaması yapıldığında. |

## 3. Format ve Biçim Kuralları

- Çıktılar lakonik, teknik ve deterministik olmalıdır (maksimum 1-2 cümle, duygusal veya panik ifadeler içermez).
- Örnek geçerli log satırları:
  ```text
  [INFO] Mimari dosya bütünlüğü denetleniyor...
  [OK] Zorunlu mimari dosyalar mevcut.
  [ERROR] Paket bulunamadı: fake-lib-123. Canlı kayıt sorgusu başarısız.
  [WARN] Naming discipline: yasaklı kelime tespit edildi (smart).
  ```

## 4. Uygulama ve Denetim

- `scripts/verify-pipeline.mjs` betiği kod dosyalarında ve betik çıktılarında emoji taraması yapar; emoji tespit edildiğinde doğrulama başarısız sayılır.
