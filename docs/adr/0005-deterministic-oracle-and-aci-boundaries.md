# ADR 0005: Deterministik Oracle Doğrulaması, ACI Standartları ve AST Tabanlı Repo Haritalama

- **Durum:** Kabul Edildi
- **Tarih:** 2026-09-15
- **Karar Vericiler:** Antigravity, Sistem Mimarı
- **İlgili Belgeler:**
  - `Resource-Pool/LLM Ajanlarının Çözülmemiş Sorunları.md`
  - `Resource-Pool/Yazılım ve AI Dokümantasyon Stratejileri.md`
  - `docs/adr/0004-brain-inspired-agent-architecture.md`

## Bağlam ve Problem

Otonom yapay zeka ajanlarının yazılım yaşam döngüsündeki kırılganlıkları üzerine yapılan ampirik çalışmalar (Huang et al. ICLR 2024, Princeton SWE-agent NeurIPS 2024, SWE-Master 2025/2026), dil modellerinin içsel akıl yürütmeyle kendi hatalarını düzeltemediğini (%91'den %88'e gerileme ve vacillation), kontrolsüz terminal/kod manipülasyonlarının bağlam kirlenmesine (context pollution) yol açtığını ve adım sayısı uzadıkça sessiz arıza entropisinin (E = ∑ δ_i) birikerek sistemi çökerttiğini kanıtlamıştır.

Bu yapısal kısıtlar karşısında; protokol-7 mikroservis projesinde bilişsel ve niyet borcunu engellemek, ajanların halüsinatif döngülerini kırmak ve doğrulamayı matematiksel/deterministik temellere oturtmak gerekmektedir.

## Karar (Y-İfadesi)

*LLM ajanlarının içsel mantık körlükleri ve kontrolsüz çevre etkileşimleri bağlamında; halüsinasyon, yön kayması (goal drift) ve sessiz arıza birikimi sorunları karşısında; deterministik sistem güvenilirliğine ulaşmak ve ek araç karmaşıklığı ödünleşimini kabul etmek adına; saf yönlendirme (prompting) ve denetimsiz kabuk erişimi yerine aşağıdaki 5 mühendislik standardına karar verilmiştir:*

1. **İçsel Öz-Düzeltme Yasağı ve Harici Deterministik Oracle Zorunluluğu:**
   Ajanın harici bir doğrulama sinyali olmaksızın "kendi kendini düzeltmesi" (self-correction) yasaklanmıştır. Tüm doğrulamalar; Biome linter, TypeScript derleyicisi (`tsc --noEmit`), test koşucusu (`npm test`) ve `scripts/verify-pipeline.mjs` tarafından ikili (pass/fail) geri bildirimle sağlanacaktır.

2. **Ajan-Bilgisayar Arayüzü (ACI) Standartları:**
   Ajanın tüm dosya sistemi ve terminal etkileşimleri SWE-agent ACI ilkeleriyle sınırlandırılmıştır:
   - 100 satırdan uzun dosyalarda pencereli okuma zorunludur.
   - Dosya güncellemeleri tüm dosyayı baştan yazarak değil, aralık tabanlı atomik yamalarla (`replace_file_content`) yapılacaktır.
   - Dosya ve metin aramaları tek seferde en fazla 50 sonuçla sınırlandırılacaktır.

3. **AST Tabanlı Connectome ve Repo Haritalama:**
   `scripts/generate-connectome.mjs` içindeki regex tabanlı sembol çıkarma yaklaşımı; TypeScript Compiler API AST ayrıştırma ve PageRank merkezilik derecelendirmesine geçirilmiştir. Ajan, binlerce satır kod yerine en kritik sembolleri ve sözleşmeleri içeren hafif repo haritası üzerinden çalışacaktır.

4. **Mimari Uygunluk Fonksiyonları (Fitness Functions):**
   `verify-pipeline` sürecine kod kalitesi ve paket kontrolünün ötesinde mimari sınırlar eklenecektir:
   - Katman izolasyonu (server → registry → actor sınırları).
   - Paketler arası döngüsel bağımlılık (circular dependency) denetimi.
   - Kaynak kodda gizli anahtar (secret) taraması.

5. **Çoklu Ajan İzolasyonu (Git Worktree):**
   Eşzamanlı alt ajan (subagent) görevlerinde ortak çalışma alanı paylaşımı yasaklanmıştır. Paralel görevler `git worktree` veya izole çalışma alanları üzerinden, bağımsız port ve `.env` konfigürasyonlarıyla koşturulacaktır.

## Kesin Dışlamalar (Ban Decisions)

- **YASAK:** Harici derleyici/linter/test çıktısı olmaksızın ajana "kodunu tekrar kontrol et ve düzelt" denilerek döngüye sokulması.
- **YASAK:** Dosya düzenlemelerinde yüzlerce satırlık tam dosya üzerine yazma (full rewrite) yöntemi.
- **YASAK:** Çıktısı 50 satırı aşan bastırılmamış ham terminal aramaları (örn. filtresiz `grep -r`, `find .`).
- **YASAK:** Birden fazla ajanın aynı dosya sisteminde eşzamanlı ve izolesiz dosya değiştirmesi.

## Sonuçlar ve Ödünleşimler

- **Pozitif:** Hedef kayması (goal drift), sessiz arıza birikimi ve halüsinatif test üretimi engellenir.
- **Pozitif:** Token tüketimi ve bağlam penceresi doluluğu radikal biçimde optimize edilir.
- **Ödünleşim:** Yeni modül veya script eklerken daha katı doğrulama adımları ve test yazma zorunluluğu doğar.
