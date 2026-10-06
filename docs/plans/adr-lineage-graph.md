---
status: accepted
---
# Lineage icin mevcut iliskilerin korunmasi

Repo'da `provenance_events` tablosu yoktur; mevcut model `document_provenance`, `document_occurrences`, `document_occurrence_runs` ve `pipeline_run_manifests` iliskileridir. Yeni `provenance_nodes`/`provenance_edges` yazma modeli bu asamada eklenmez: kaynak ureticilerinin mevcut occurrence/run/raw artifact baglarini tamamlamasi once gelir, aksi halde iki eksik otorite olusur. OffsetContext ilerleme konumunu tasir; belge kokeni kaniti yerine gecmez.

Bir artifact birden fazla transformation'a girip cikmaya basladiginda ve mevcut sorgular bu baglari temsil edemediginde graph modeli yeniden degerlendirilir; kimlik, edge turu, silme/retention ve eski kayit backfill sozlesmeleri migration'dan once tanimlanir. DergiPark fingerprint ve HF URL receipts yerel operasyon kayitlaridir; merkezi lineage graph'i tamamlanmis sayilmaz. NiFi provenance event modeli referanstir, mevcut schema olarak kabul edilmez.

Kaniti: `infra/migrations/0002-blueprint-provenance.sql`, `0003-release-reviews.sql`, `0004-source-cursors.sql` ve `pipelines/shared/offset_context.py`. Kaynak: [NiFi repository ve provenance](https://nifi.apache.org/nifi-docs/nifi-in-depth.html).
