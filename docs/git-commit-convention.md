# Git Commit Convention v1.0

**Document Type:** Engineering Standard  
**Version:** 1.0  
**Status:** Active  
**Scope:** All Software Repositories & Autonomous AI Agents  

---

## 1. Purpose

Bu standart, tüm Git commit mesajlarının:

* Tutarlı
* Okunabilir
* Teknik
* İzlenebilir
* Otomasyona uygun

olmasını sağlamak amacıyla oluşturulmuştur.

Tüm geliştiriciler ve otonom AI ajanları commit oluştururken bu standarda uymalıdır.

---

## 2. Commit Format

Temel format:

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Örnek:

```text
feat(auth): add refresh token support
```

Scope kullanılmasının gerekli olmadığı durumlarda:

```text
docs: update deployment documentation
```

---

## 3. Commit Types

| Type       | Kullanım                                     |
| :--------- | :------------------------------------------- |
| `feat`     | Yeni özellik                                 |
| `fix`      | Bug/hata düzeltmesi                          |
| `refactor` | Davranış değiştirmeyen kod iyileştirmesi     |
| `perf`     | Performans iyileştirmesi                     |
| `test`     | Test ekleme/değiştirme                       |
| `docs`     | Dokümantasyon                                |
| `build`    | Build sistemi veya dependency değişiklikleri |
| `ci`       | CI/CD değişiklikleri                         |
| `chore`    | Teknik bakım ve yardımcı değişiklikler       |
| `revert`   | Önceki commit'i geri alma                    |

---

## 4. Scope

Scope, değişikliğin hangi teknik modül veya etki alanını ilgilendirdiğini belirtir:

```text
auth
api
agents
actors
chat
code-runner
database
documents
eval
frontend
logging
planning
security
swarm
tools
ui
deps
config
ci
docker
```

Örnekler:

```text
feat(auth): add JWT authentication
fix(database): handle connection timeout
refactor(api): simplify error handling
perf(cache): optimize user lookup
```

Scope teknik modül veya mimari sınırla tam uyumlu olmalıdır.

---

## 5. Description Rules

Commit açıklaması:

* İngilizce yazılmalıdır.
* Kısa ve teknik olmalıdır.
* Emir kipi (imperative mood) kullanılmalıdır (`add`, `fix`, `refactor`).
* İlk harf küçük olmalıdır.
* Sonuna nokta konulmamalıdır.
* Pazarlama jargonu (`smart`, `intelligent`, `next-gen` vb.) kesinlikle yasaktır.
* Gereksiz detay içermemelidir.

### Doğru

```text
feat(auth): add OAuth2 authentication
fix(api): validate request payload
refactor(database): simplify transaction handling
perf(query): optimize user lookup
```

### Yanlış

```text
updated backend
some fixes
I changed the authentication system
fix stuff
updates
```

---

## 6. Commit Atomicity

Her commit tek bir mantıksal değişiklik içermelidir:

> **One commit = one logical change**

### Yanlış

```text
feat: update auth, database, frontend, docker and tests
```

### Doğru

```text
feat(auth): add refresh token support
test(auth): add refresh token tests
refactor(database): simplify session storage
build(docker): optimize production image
```

---

## 7. Commit Size

Commit'ler gereğinden fazla büyük olmamalıdır:

```text
Small -> Focused -> Reviewable -> Reversible
```

---

## 8. Breaking Changes

Sistem veya API sözleşmesini bozan değişiklikler açıkça belirtilmelidir:

```text
feat(api)!: change authentication response format
```

Veya body içerisinde:

```text
feat(api)!: replace legacy authentication endpoint

BREAKING CHANGE: /v1/auth/login has been replaced by /v2/auth/login
```

---

## 9. AI Agent Attribution (Zorunlu Ajan Kimlik Standardı)

Otonom veya eş-programcı AI ajanları tarafından yapılan commit'lerde, commit gövdesinde (body/trailer) ajanın kimliği, modeli ve rolü açıkça belirtilmelidir.

Format:

```text
<type>(<scope>): <description>

[Opsiyonel teknik açıklama veya mimari gerekçe]

Agent: <Agent-Name>
Model: <Model-Identifier>
Agent-Role: <Architect | Engineer | Subagent-Role>
Co-authored-by: <Agent-Name> <agent@local>
```

Örnek:

```text
feat(eval): add Zod validation to trajectory payloads

Agent: Antigravity
Model: Gemini 3.8 Flash
Agent-Role: Chief Technology Architect
Co-authored-by: Antigravity <antigravity@google.com>
```

---

## 10. Branch Stratejisi ve Doğru Branch Kullanımı

Ajanlar ve geliştiriciler değişiklikleri commit ederken mutlaka doğru branch stratejisine uymalıdır:

1. **`main` / `master`**: Üretim dalıdır. Doğrudan commit atılması kesinlikle yasaktır.
2. **`staging`**: Kararlı ön-üretim doğrulama dalıdır.
3. **`develop`**: Günlük entegrasyon ve geliştirme dalıdır.
4. **`feature/<scope>-<kebab-name>`**: Yeni özellikler için açılır (`feature/auth-refresh-token`, `feature/eval-metrics`).
5. **`fix/<scope>-<kebab-name>`**: Hata düzeltmeleri için açılır (`fix/api-rate-limit-check`).

> **Kural**: Eğer üzerinde çalışılan görev için uygun branch henüz mevcut değilse, commit oluşturulmadan önce `git checkout -b <branch-name>` komutuyla ilgili branch oluşturulmalı ve oraya geçilmelidir.

---

## 11. Prohibited Commit Messages

Aşağıdaki mesajlar kesinlikle yasaktır:

```text
update, changes, fix, test, wip, stuff, final, final-final, temporary, asdf, works
```

---

## 12. Özet Şablon

```text
<type>(<scope>): <description>

<Technical description / rationale>

Agent: Antigravity
Model: <Model-Name>
Agent-Role: <Role>
```
