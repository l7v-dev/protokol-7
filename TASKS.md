# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Oturum kapandı. Faz 1, Faz 2 ve Faz 3 tamamlandı; v1.0.0 versiyonu mühürlendi.)*

## Bekleyen (Blok var)

- *(Bekleyen görev yok)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Faz 10: L5 Güvenlik Seviyesi: Atomik Kontrol Noktası ve Geri Alma (ADR-0009)** — `Tier: 2` — `scripts/checkpoint.mjs` L5 seviyesinde atomik Git snapshot ve geri alma yeteneğiyle geliştirildi; `npm run checkpoint` ve `npm run rollback` scriptleri bağlandı; 76/76 test, doctor ve 6 aşamalı doğrulama hattı geçti.
- [x] **Faz 9: 9 Katmanlı Açıklık Mimarisi ve Korelasyon Telemetrisi (ADR-0008)** — `Tier: 2` — `scripts/telemetry-logger.mjs` 9 katmanlı açıklık taksonomisi (`SPAN_TYPES`), `trace_id`, `span_id` ve `parent_span_id` desteğiyle güncellendi; 76/76 test, `doctor` ve `verify-pipeline` `SAFETY_MONITOR` ve `FEEDBACK_INTEG` açıklıklarıyla mühürlendi.
- [x] **Faz 8: Hibrit Format Standartları, Duraklama Kontrolü ve Ajan Baskısı Koruması (ADR-0007)** — `Tier: 1` — `context/format-standards.md` oluşturuldu, iki aşamalı çıkarım (NL-to-Format) mühürlendi, failure-checklist'e duraklama ve ajan baskısı ($W/C_{rem}$) kuralları eklendi, 76/76 test, doctor ve 6 aşamalı doğrulama hattı geçti.
- [x] **Faz 7: Engineering Telemetrisi, Doctor Denetimi ve Açıklama Disiplini (ADR-0006)** — `Tier: 2` — Sıfır dış bağımlılıklı JSONL telemetri kayıtçısı, 7 aşamalı repository doctor (`npm run doctor`), gizli anahtar (secret) taraması, katı açıklama ve sohbet jargonu yasağı (`rules/documentation-discipline.md`) entegre edildi; 76/76 test ve 6 aşamalı doğrulama hattı geçti.
- [x] **Faz 6: Deterministik Oracle, ACI Standartları ve AST Connectome Zenginleştirmesi (ADR-0005)** — `Tier: 2` — TypeScript Compiler API AST ile connectome haritası 462 satıra zenginleştirildi, ADR-0005 ve failure-checklist ACI/Huang et al. kurallarıyla mühürlendi, 76/76 test ve doğrulama hattı geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
