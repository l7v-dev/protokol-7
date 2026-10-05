# Proje becerileri

- `dev/<name>/SKILL.md`: Kod geliştirme, inceleme ve hata teşhis prosedürleri.
- `ops/<name>/SKILL.md`: Veri toplama, kalite, provenance ve yayımlama prosedürleri.
- Kök `skills/` symlink'i bu dizine gider.

Yeni ops becerileri sürüm, kategori, izinli araçlar ve yerel girdi/çıktı şema yollarını frontmatter içinde taşır. `schemas/` altında Draft 2020-12 şemaları, `references/platform-policy.md` altında kök `context/code-standards.md` dosyasına bağlantı bulunur. Mevcut data-ingestion-protocol ve dbx-management içerikleri taşınırken korunmuştur.

Prosedür tanımı çalışma zamanı yeteneği sağlamaz. Faz 2-4 bağımlılığı eksik olan operasyon `blocked` sonucu üretir; henüz uygulanmamış release kapıları veya provenance tabloları varmış gibi yürütülmez.
