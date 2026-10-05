# Mimari Faz 1: Yapı ve sözleşmeler

Tarih: 2026-10-05. Tier: 2.
Plan: `docs/plans/mimari-analiz-airbyte-blueprint-2026-10.md` §15.

## Uygulanan değişiklikler

- 14 mevcut geliştirme becerisi `.agents/skills/dev/`, data-ingestion-protocol ve dbx-management `.agents/skills/ops/` altına taşındı. Kök `skills/` symlink'i korundu.
- 9 yeni ops becerisine sürüm, kategori, araç listesi, girdi/çıktı şemaları ve platform policy bağlantısı eklendi. Eksik runtime yeteneği `blocked` döndürür; prosedür tanımı uygulama sağlamaz.
- Beş Draft 2020-12 yerel sözleşme yazıldı: document.v1, manifest.v1, log-event.v1, source.v1, dataset-release.v1. Özgün dış Blueprint şemaları repoda bulunmadığı için dış uyumluluk iddiası yok.
- Kaynak tanımlayıcısına isteğe bağlı verification_level, evidence, streams ve agent_permissions alanları; contracts/index.ts dosyasına TypeScript karşılıkları eklendi. Mevcut kaynaklar geçerliliğini koruyor.
- AGENTS.md, ARCHITECTURE.md, mimari katalog, README ve aktif kural yönlendirmeleri yeni konumlara uyarlandı. Kurallardaki iki değişiklik yalnız beceri referans yollarıdır.
- ADR 0010 canonical document identity, çok-kaynaklı occurrences, immutable artifacts ve beş kapılı release kararını kaydediyor. Mevcut NFKC çıktısının NFC etiketiyle sunulamayacağı açıklandı.

## Doğrulama

- `uv run --no-project --with 'jsonschema[format]' --with pyyaml python tests/blueprint_contracts_test.py`: 8/8 başarılı. Şema meta-doğrulaması, mevcut kaynak uyumluluğu, geçersiz izin/tarih/stream girdileri, release kapıları, belge hakları, manifest kimlikleri, severity eşleşmesi ve skill referansları denetlendi.
- `node_modules/.bin/tsx --test tests/contracts.test.ts`: 12/12 başarılı.
- `npm run typecheck`: başarılı.
- `npm run verify`: altı katman başarılı; SCA için izinli ağ erişimi kullanıldı.
- `git diff --check`: başarılı.
- Standards incelemesinin yakaladığı iki eski kural yolu düzeltildi ve tekrar incelemede kapandı. Spec incelemesinde bulgu yok.
- Ek `npm run lint:naming` taraması çalışıyor ancak eski README/kurallardaki yasaklı sözcük örneklerini ve Python super() çağrılarını da ihlal sayıp başarısız oluyor. Bu tarayıcı davranışı önceki koddan geliyor; bu fazda değiştirilmedi. Zorunlu npm run verify isimlendirme denetimi başarılı.

İlk şema testi 9 hatalı relative policy linkini yakaladı; bir üst dizine giden bağlantılar proje köküne düzeltildi. Tarih testleri jsonschema'nın format eklentisinin eksikliğini yakaladı; geçici test ortamına format ekleri dahil edildi. Proje runtime bağımlılıklarına paket eklenmedi.

## Faz 0 kalan Git işi

Canlı remote envanterinde yalnız main, legacy/monolith-initial ve feature/github-actions-wikipedia-etl var. Feature branch'in main'e ancestor olduğu doğrulandı. GitHub silmeyi varsayılan branch olduğu için reddetti. Varsayılan branch main yapılmadan bu adım tamamlanamaz; repository ayarı değiştirilmedi. Standart `git gc` tamamlandı; dangling nesnelerin saklama süresini kaldıran `--prune=now` kullanılmadı.

## Devam

Faz 2: şema migration'ı, registry tabloları ve OTel log emitter. Phase 1 şemaları mevcut DatasetPublisher veya register-source CLI için runtime enforcement sağlamaz; sonraki fazların uygulaması gerekir. Canlı veri pipeline'ları ve veritabanları değiştirilmedi. Commit oluşturulmadı; önceki GEMINI.md silinmesi çalışma ağacında korunuyor.
