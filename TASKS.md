# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [/] **Çok Dilli Wikipedia Dump ETL ve Google Drive Senkronizasyonu** — `Tier: 2` — Drive'da tamamlanmış 23 dil hariç tutularak eksik olan 40 dünya dili (`te`, `mk`, `hi`, `th`, `ta`, `bn`, `sl`, `ka`, `lt`, `gl`, `hr`, `sk`, `et`, `cy`, `bg`, `da`, `hy`, `eo`, `he`, `ms`, `eu`, `ro`, `hu`, `cs`, `fi`, `no`, `ur`, `sr`, `ko`, `id`, `ca`, `pt`, `vi`, `uk`, `ja`, `zh`, `pl`, `nl`, `sv`, `de`) küçükten büyüğe sıralandı; `multi_lang_orchestrator.py` motoru Drive OAuth2 yükleme, dinamik ayna seçimi, md5 doğrulama, wikitext temizleme ve otomatik ham dump silme (`--clean-dump`) özellikleriyle yapılandırıldı ve kuru çalışma testinden başarıyla geçti.

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Formel Mantık, Teorem Kanıtlama ve Rasyonalite Aktörleri (Faz 4: ProofWiki, Lean Mathlib, LessWrong)** — `Tier: 2` — `proofwiki`, `lean-mathlib`, `lesswrong` aktörleri; tip sözleşmeleri (`src/api/types.ts`), manifestoları (`src/actors/actor-manifests.ts`), REST rotaları (`POST /api/v1/proofwiki`, `/lean-mathlib`, `/lesswrong`), MCP araçları (`query_proofwiki`, `query_lean_mathlib`, `query_lesswrong`), teknik wikileri (`docs/actors/*.md`), örnek boru hatları (`examples/pipelines/*.yaml`) ve birim testleri eksiksiz tamamlandı; 638/638 test, 6 aşamalı verify ve Biome format kontrolleri başarıyla geçti (Toplam 44 aktör, 54 MCP aracı).

- [x] **Matematik, Mantık ve Benchmark Aktörleri (Faz 3: HuggingFace Datasets, Math Reasoning, Code Eval)** — `Tier: 2` — `huggingface-datasets`, `math-reasoning`, `code-eval` aktörleri; tip sözleşmeleri (`src/api/types.ts`), manifestoları (`src/actors/actor-manifests.ts`), REST rotaları (`POST /api/v1/huggingface-datasets`, `/math-reasoning`, `/code-eval`), MCP araçları (`query_huggingface_datasets`, `query_math_reasoning`, `query_code_eval`), teknik wikileri (`docs/actors/*.md`), örnek boru hatları (`examples/pipelines/*.yaml`) ve birim testleri eksiksiz tamamlandı; 606/606 test, 6 aşamalı verify ve Biome format kontrolleri başarıyla geçti.

- [x] **SWE ve Muhakeme Aktörleri (Faz 2: GitHub, OpenReview, HackerNews)** — `Tier: 2` — `github`, `openreview`, `hacker-news` aktörleri; tip sözleşmeleri (`src/api/types.ts`), manifestoları (`src/actors/actor-manifests.ts`), REST rotaları (`POST /api/v1/github`, `/openreview`, `/hacker-news`), MCP araçları (`query_github`, `query_openreview`, `query_hacker_news`), teknik wikileri (`docs/actors/*.md`) ve örnek boru hatları (`examples/pipelines/*.yaml`) eksiksiz tamamlandı; 577/577 test, 6 aşamalı verify, doctor ve Biome format kontrolleri başarıyla geçti.

- [x] **Yerel Hukuk ve Finans Aktörleri (Faz 1: Resmî Gazete, Yargıtay & Danıştay, KAP)** — `Tier: 2` — T.C. Resmî Gazete (`resmi-gazete`), Yargıtay & Danıştay (`yargitay`) ve Kamuoyu Aydınlatma Platformu (`kap`) aktörleri; tip sözleşmeleri (`src/api/types.ts`), manifestoları (`src/actors/actor-manifests.ts`), REST rotaları (`POST /api/v1/resmi-gazete`, `/yargitay`, `/kap`), MCP araçları (`query_resmi_gazete`, `query_yargitay`, `query_kap`), teknik wikileri (`docs/actors/*.md`) ve Google Drive boru hatları (`examples/pipelines/yerel-*.yaml`) eksiksiz tamamlandı; 548/548 test, 6 aşamalı verify ve Biome format kontrolleri başarıyla geçti.

- [x] **Standart Log Sablonlari, Log Fihristi ve Anomali Telemetrisi** — `Tier: 2` — `TerminalTheme` sifir emojili ASCII banner/badge/panel/table sablon motoru (`scripts/terminal-theme.mjs`, `src/utils/terminal-theme.ts`), anomali taksonomisi (`STALL_TIMEOUT`, `RATE_LIMIT_BACKOFF`, `SECURITY_BLOCK_403`, `SSRF_INTERCEPTION` vb. — `src/telemetry/anomalies.ts`), atomik calisma logu dosyalama ve fihrist defteri (`src/api/run-logger.ts`, `ledger/logs/index.jsonl`), `npm run logs` anomali radari CLI'i, `scripts/pulse.mjs` tema entegrasyonu ve 100 dosyalik log rotasyonu tamamlandi; 524/524 test, verify ve doctor kontrolleri basariyla gecti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
