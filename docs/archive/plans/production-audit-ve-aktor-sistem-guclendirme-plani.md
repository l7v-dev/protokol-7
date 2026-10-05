# Production Hazirlik ve Aktor Sistemi Guclendirme Plani

## 1. Problem Tanimi ve Baglam
- Bagimsiz betikler (`scripts/harvest-ekutuphane.mjs`, `scripts/harvest-ktb-ekitap.mjs`) protokol-7 mikroservis mimarisine aykiri olarak izole calismakta ve aktor soyutlamasini baypas etmekteydi.
- `store-router.ts` icerisinde `saglik-ekutuphane` icin hardcoded yerel dosya yolu (`/home/l7v/protokol-data-pool/...`) kontrolu yer almaktaydi.
- Buyuk veri (500 TB seviyesi) veri yonetimi icin Parquet parcalari ve veri kumesi envanterinin SQLite uzerinde metaveri tablosu eksikti.
- TypeScript tip kontrolu (`tsc --noEmit`) `src/` ve `tests/` katmanlarinda bazi aktorlerde derleme hatalari barindiriyordu.

## 2. Mimari Hedefler
1. Betik tabanli veri kazima islemlerinin tamamen kaldirilmasi ve resmi aktorlerin (`SaglikEkutuphaneActor`, `KtbEkitapActor`) standart boru hatti (`PipelineRunner`, `ActorRegistry`) ile calistirilmasi.
2. `store-router.ts` uzerindeki tum baypas mekanizmalarinin silinerek mikroservis REST rotasinin homojenlestirilmesi.
3. `RegistryDatabase` icerisine `dataset_shards` tablosu eklenerek 500 TB olcegindeki Parquet parcalari, kayit sayisi, bayt boyutu, kriptografik SHA-256 ozeti ve depolama URI adreslerinin ACID garantisiyle indekslenmesi.
4. Tum TypeScript derleme hatalarinin ve unit test uyumsuzluklarinin giderilmesi.
5. Tum dogrulama hatti kontrollerinin (`npm run verify`, `npm test`) %100 basariyla gecmesi.

## 3. Uygulama Adimlari
1. `src/core/registry-database.ts`: `dataset_shards` tablosu, indeksleri ve CRUD metotlarinin eklenmesi.
2. `src/pipeline/pipeline-runner.ts`: Basarili dosya yukleme ciktilarinda `dataset_shards` kaydinin otomatik olusturulmasi.
3. `src/pipeline/execution/local-executor.ts`: Tum aktor seceneklerinin esnek iletiminin saglanmasi.
4. `src/core/store-router.ts`: Hardcoded kontrol bloklarinin kaldirilmasi.
5. `scripts/harvest-*.mjs` betiklerinin silinmesi ve `package.json` guncellenmesi.
6. `examples/pipelines/` altinda ornek YAML dosyalarinin olusturulmasi.
7. Kod formatlama, lint denetimi ve deterministik dogrulama.
