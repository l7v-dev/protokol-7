# Task & Todo Discipline — Hipokampüs Görev Yönetim Şartnamesi

Bu kural, `TASKS.md` çalışan belleğindeki tüm görevlerin formatı, yaşam döngüsü ve kabul kriterleri için bağlayıcı standarttır.

## 1. Görev Anatomisi (Task Format)

Her görev aşağıdaki standart yapıda yazılmak zorundadır:

```markdown
- [ ] **<teknik-gorev-adi>** — `Tier: <0-3>` — `Blok: <yok / gorev-adi>`
  - Bağlam: <neden yapılıyor, hangi context/ veya şartnameye bağlı>
  - Kabul kriteri: <deterministik, ölçülebilir ve test edilebilir kriter>
  - Durum: <son bırakılan nokta — yeni oturumun ilk okuyacağı satır>
```

### Kurallar:
1. **Belirsizlik Yasağı:** Kabul kriteri asla "düzgün çalışmalı", "güzel olmalı", "tamamlanmalı" gibi öznel ifadeler içeremez. Mutlaka çalıştırılabilir bir test, API yanıt kodu veya dosya varlığı belirtilmelidir (ör. `npm test test/auth.test.ts 0 fail vermeli`).
2. **Teknik Başlık:** Başlıkta pazarlama buzzword'ü kullanılamaz (Ref: `skills/dev/naming-discipline`).
3. **Zorunlu Tier Etiketi:** Her görevin başında `Tier: 0`, `1`, `2` veya `3` belirtilmelidir (Ref: `rules/trust-tiers.md`).

## 2. Görev Yaşam Döngüsü (Task Lifecycle)

```text
[Yeni Fikir]
     │
     ▼
[Sağlamlaştırma Bekliyor]  (grilling veya şartname sürecinden geçmemiş)
     │
     ▼
[Bekleyen (Blok Var)]      (Başka bir görevin bitmesini bekliyor)
     │
     ▼
[Aktif Görev]              (Şu an üzerinde çalışılan TEK odak noktası)
     │
     ▼
[Doğrulama Kapısı]         (rules/failure-checklist + npm run verify)
     │
     ▼
[Son Tamamlananlar]        (Son 5 görev burada tutulur)
     │  (> 5 olduğunda)
     ▼
[Arşiv (index.jsonl)]      (npm run consolidate ile otomatik gzip)
```

## 3. Sabit İlkeler

- **Aynı Anda Tek Aktif İş:** `## Aktif` bölümünde aynı anda birden fazla iş yürütülemez. Çok adımlı işler atomik alt görevlere bölünür ve sırayla aktife alınır.
- **Oturum Kapanış Güncellemesi:** Oturum sonlandırılmadan önce `Durum:` satırı mutlaka güncellenmelidir.
- **5 Görev Sınırı:** "Son tamamlananlar" 5'i aştığında `npm run consolidate` çalıştırılarak çalışan bellek yalın tutulur.
