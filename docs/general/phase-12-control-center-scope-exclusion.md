# Phase 12 — Control Center Scope Exclusion

**Program:** Scraping Platform  
**Phase:** 12 — Control Center  
**Karar:** Scope Excluded — kullanıcı talimatı  
**Kapsam türü:** Frontend/UI hariç; bu phase için backend implementation başlatılmayacaktır

## Karar

Kullanıcı, daha önce geri çekilen web sitesi/frontend talebini yeniden açıkça kapsam dışı bırakmıştır. Phase 12 task register'daki P12-T01–P12-T08 maddelerinin tamamı UX, Frontend veya UX/QA kapsamındadır. Bu nedenle Phase 12 için backend repository'sinde API/UI contract genişletmesi, frontend kodu, deployment veya yayın çalışması yapılmayacaktır.[1]

Özellikle `/home/ubuntu/scraping-platform-operations-site` static WebDev projesi bu program kapsamında değiştirilmemeli, sunulmamalı veya yayımlanmamalıdır.

| Task aralığı | Task register workstream | Program kararı |
|---|---|---|
| P12-T01 | UX / bilgi mimarisi | Scope Excluded |
| P12-T02–P12-T07 | Frontend ekranları ve permission-aware route guard | Scope Excluded |
| P12-T08 | UX/QA UAT, accessibility, responsive release readiness | Scope Excluded |

## İleri akış

Phase 12'nin frontend/UI kapsam dışı kararı, P13 — Observability için backend-only contract çalışmasını engellemez. P13-T01, ayrı bounded paket olarak başlayacak ve kendi kullanıcı review/onay kapısından geçecektir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 12 — Control Center"
