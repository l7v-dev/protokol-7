# Progress Tracker

## Project

protokol-7 — Headless Web Scraping, Deep Crawling & Anti-Detection Browser Automation Microservice (Node.js 20+, TypeScript, Playwright Chromium, Cheerio, Mozilla Readability, GFM Structured Extraction, Politeness Limiter, and HTTP REST API).

---

## Current Phase

**Faz 2: Beceri Kütüphanesi, Bağlam Dokümanları ve Kurumsal Standartlar Altyapısı (Skills, Context, Docs & Standards Architecture) tamamlandı. `.agents/skills/` (38 teknik beceri), `context/` (6 bağlam dokümanı), `docs/` (Git commit standardı, geliştirici rehberi ve ADR 0001-0003), `AGENTS.md` ve `GEMINI.md` kuruldu. 51/51 test %100 yeşil, TypeScript derlemesi ve isimlendirme denetimi sıfır hata.**

---

## Completed (Faz 2: Skills, Context & Documentation Infrastructure)

- [x] **Beceri Kütüphanesi (`.agents/skills/`):** 38 teknik beceri (naming discipline, neuro-ergonomic communication, code review, codebase design, diagnosing bugs, tdd, wizard, vb.) `protokol-7` deposuna entegre edildi.
- [x] **Otomatik İsimlendirme Denetimi (`lint:naming`):** `check-naming.sh` çalıştırılabilir kılındı, `package.json` içine `npm run lint:naming` eklendi ve 0 pazarlama jargonu ihlali ile doğrulandı.
- [x] **Ajan Kuralları (`AGENTS.md` & `GEMINI.md`):** Protokol-7 mimarisine özel platform kimliği, bağlam okuma sırası, sıfır mükerrerlik, teknik isimlendirme ve nöro-ergonomik iletişim kuralları tanımlandı.
- [x] **Bağlam Dokümantasyonu (`context/`):** 
  - `project-overview.md`: Ürün tanımı, temel aktörler ve HTTP API yetenekleri.
  - `architecture-context.md`: 3 katmanlı mikroservis yapısı, BrowserPool yaşam döngüsü ve 5 değişmez (Invariants).
  - `architecture-schema.md`: 21 kaynak dosya, 14 test dosyası ve konfigürasyon envanteri.
  - `code-standards.md`: Kod standartları, teknik isimlendirme, hata yönetimi ve TypeScript kuralları.
  - `ai-workflow-rules.md`: Şartname güdümlü geliştirme, kapsam kuralları ve git iş akışı.
  - `progress-tracker.md`: İlerleme takipçisi ve test skorları.
- [x] **Mühendislik Standartları ve ADR'ler (`docs/`):**
  - `git-commit-convention.md`: Git Commit Convention v1.0 standardı ve ajan kimlik atfı kuralları.
  - `developer-onboarding.md`: Kurulum, ortam değişkenleri, çalıştırma ve REST API referansı.
  - `adr/0001-standalone-scraping-service-architecture.md`: Mikroservis mimarisine geçiş kararı.
  - `adr/0002-browser-pool-and-resource-lifecycle.md`: Playwright Chromium havuzu ve kaynak yönetimi.
  - `adr/0003-multi-actor-pipeline-and-readability-extraction.md`: 3 aşamalı HTML'den Markdown'a dönüşüm boru hattı.

---

## Completed (Faz 1: Standalone Microservice Extraction & Testing)

- [x] **Bağımsız Git Deposu Kurulumu:** `/home/l7v/l7v-dev/protokol-7` deposu sıfırdan başlatıldı.
- [x] **Aktör ve Yardımcı Dosyaların Taşınması:** 20 aktör ve yardımcı modül `src/` altına taşındı, `Agent-Smith` bağımlılıkları tamamen koparıldı (`EntityId = string`).
- [x] **HTTP REST Sunucusu (`src/server.ts`):** `GET /health`, `GET/POST /api/v1/actors`, `POST /api/v1/scrape`, `POST /api/v1/crawl`, `POST /api/v1/browser/action`, `DELETE /api/v1/browser/session/:id` uç noktaları uygulandı.
- [x] **Test Paketi Doğrulaması:** 14 test dosyası `tests/` altına alındı; `npm test` ile 51/51 test %100 başarılı oldu.
- [x] **Derleme ve Yayın:** `npm run build` (`tsc`) ile `dist/` çıktısı hatasız üretildi; ilk sürüm commit'i yapıldı.

---

## Verification Metrics

```bash
# Test Suite
$ npm test
ℹ tests 51
ℹ suites 2
ℹ pass 51
ℹ fail 0

# TypeScript Type Check
$ npm run lint
Exit Code: 0 (0 errors)

# Naming Discipline
$ npm run lint:naming
No banned words found in filenames.
No banned words found in code contents.
Exit Code: 0

# Build
$ npm run build
Exit Code: 0
```
