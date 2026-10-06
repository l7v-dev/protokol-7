# Meltano & NiFi Ilham Analizi — Kesif Plani

Bu belge `/home/l7v/l7v-dev/play/meltano` ve `/home/l7v/l7v-dev/play/nifi`
repolarinin kaynak kodu incelenmesiyle uretilmistir.
Protokol-7 projesine uygulanabilir bulgular ve bunlarin gorev tanimlari
burada saklanir.

Tarih: 2026-10-05
Durum: Kesif tamamlandi, uygulama henuz baslamadi
Referans repolar: meltano (Python/Singer ELT), nifi (Java/enterprise dataflow), scrapy (Python/async web crawler)

---

## 1. Kaynak Inceleme Ozeti

### 1.1 Meltano — Incelenen Moduller

| Dosya | Konu |
|---|---|
| `src/meltano/core/job/job.py` | Job state machine, async heartbeat, SIGTERM handler |
| `src/meltano/core/job/finder.py` | Stale job query builder |
| `src/meltano/core/job/stale_job_failer.py` | Periyodik stale tespiti |
| `src/meltano/core/state_store/base.py` | StateStoreManager ABC, MeltanoState, partial/completed merge |
| `src/meltano/core/state_store/db.py` | SQLAlchemy DB backend, yield_per batch okuma |
| `src/meltano/core/block/extract_load.py` | ExtractLoadBlocks, async IO pipe zinciri, ELBExecutionManager |
| `src/meltano/core/logging/formatters.py` | structlog formatters, GCL preset |
| `src/meltano/core/schedule.py` | cron validation, Schedule/JobSchedule/ELTSchedule |
| `src/meltano/core/task_sets.py` | TaskSets, flat_args_per_set |

### 1.2 Scrapy — Incelenen Moduller

| Dosya | Konu |
|---|---|
| `scrapy/downloadermiddlewares/retry.py` | `get_retry_request()`, `RetryMiddleware`, per-request `max_retry_times` override |
| `scrapy/extensions/throttle.py` | `AutoThrottle`: latency-based dinamik delay ayari, target_concurrency |
| `scrapy/extensions/closespider.py` | `CloseSpider`: timeout/itemcount/pagecount/errorcount/timeout_no_item kapama kosullari |
| `scrapy/extensions/httpcache.py` | `RFC2616Policy`, `FilesystemCacheStorage`, ETag/If-Modified-Since revalidasyon |
| `scrapy/downloadermiddlewares/httpcache.py` | `HttpCacheMiddleware`: hit/miss/revalidate/errorrecovery stats entegrasyonu |
| `scrapy/dupefilters.py` | `RFPDupeFilter` (bellek), `DiskDupeFilter` (SQLite WAL), fingerprint-based tekillik |
| `scrapy/statscollectors.py` | `StatsCollector`: inc_value/max_value/min_value, `MemoryStatsCollector`, `DummyStatsCollector` |
| `scrapy/extensions/spiderstate.py` | `SpiderState`: pickle ile job dizinine spider.state kaydet/yukle |
| `scrapy/core/scheduler.py` | `BaseScheduler` ABC: has_pending_requests/enqueue_request/next_request arayuzu |

### 1.3 NiFi — Incelenen Moduller

| Dosya | Konu |
|---|---|
| `nifi-commons/nifi-write-ahead-log/.../WriteAheadRepository.java` | WAL interface: update/checkpoint/recoverRecords |
| `nifi-framework-api/.../controller/queue/FlowFileQueue.java` | Backpressure thresholds, swap-to-disk, acknowledge pattern |
| `nifi-framework-api/.../provenance/ProvenanceRepository.java` | Provenance event store, async lineage query |
| `nifi-framework-api/.../provenance/lineage/LineageNode.java` | Node/Edge lineage graph modeli |
| `nifi-stateless/.../flow/StatelessDataflow.java` | Trigger/TriggerResult, stateful component destegi |
| `nifi-stateless/.../flow/TransactionThresholds.java` | max_flowfiles / max_bytes / max_time uclu baski |

---

## 2. Protokol-7 Icin Gecerli Bulgular

### Bulgu F — RFC2616-Uyumlu HTTP Cache + ETag Revalidasyon (Scrapy)

**Kaynak:** `scrapy/extensions/httpcache.py` -> `RFC2616Policy`, `scrapy/downloadermiddlewares/httpcache.py`

**Scrapy Mekanizmasi:**
- `RFC2616Policy.is_cached_response_fresh()`: max-age, Expires, Last-Modified heuristigi
- Stale response -> `If-Modified-Since` / `If-None-Match` header ekleyip sunucuya iletir
- 304 Not Modified geri donerse cached response guncellenir, tam indirme olmaz
- `errorrecovery`: download exception durumunda cached response fallback olarak kullanilir
- Tum islemler `httpcache/hit`, `httpcache/miss`, `httpcache/revalidate` stat sayaclariyla izlenir

**Protokol-7'deki Gap:**
- DergiPark downloader `--rate-limit` ile cekiyor ama ayni URL tekrar celdiginde
  HTTP 304 optimizasyonu yok — her zaman tam response indirilir
- Aperta OAI-PMH akisi `from` parametresiyle cursor kullaniyor ama
  sunucu tarafli ETag/Last-Modified headerlarini degerlendiren kod yok
- Cache politikasi (ne cachele, ne cacheme, ne kadar sure) configurable degil

**Uygulanacak Adaptasyon:**
- Python orchestrator'lara opsiyonel `HTTPCache` katmani: `IF_MODIFIED_SINCE` / `ETAG`
  headerlarini son basarili cevaptan okuyup bir sonraki istege ekler
- Cache policy: `ALWAYS_STORE`, `IGNORE_HTTP_CODES`, `EXPIRATION_SECS` parametreleri
- `httpcache_stats` kaydi: hit/miss/revalidate sayaclari SQLite'a yazilir
- Bagimsiz modul — mevcut rate limiter'lara dokunmaz

**Oncelik:** ORTA — OAI-PMH/DergiPark tekrar cekimlerinde bant genisligi tasarrufu saglar

---

### Bulgu G — AutoThrottle: Latency-Driven Dinamik Delay (Scrapy)

**Kaynak:** `scrapy/extensions/throttle.py` -> `AutoThrottle._adjust_delay()`

**Scrapy Mekanizmasi:**
```
target_delay = latency / target_concurrency
new_delay = (slot.delay + target_delay) / 2.0  # exponential moving average
new_delay = max(target_delay, new_delay)         # hizlanmaya karsi koruma
new_delay = clamp(new_delay, mindelay, maxdelay) # sinir koruma
# HTTP != 200 ve delay dusuyorsa: ayarlama yapma (hata sayfasi kucuk, yaniltici)
```

**Protokol-7'deki Gap:**
- DergiPark `ThreadSafeRateLimiter`: sabit `1.75s` — sunucu durumuna gore uyum yok
- Aperta rate limiter: sabit `0.8s` — yuk altinda artar, yuk yokken duser
- Cloudflare 429 alinca `global_cooldown` mekanizmasi var ama
  sunucunun normal latency'sine gore proaktif ayarlama yok

**Uygulanacak Adaptasyon:**
- `adaptive_rate_limiter.py`: `download_latency` olcumu + EMA bazli delay hesabi
- `target_concurrency` (kac paralel istek hedefleniyor), `min_delay`, `max_delay`
  parametreleri `ThresholdGuard` ile entegre edilir (Bulgu C ile birlikte)
- 429/503 alinca `max_delay`'e atlayip yeniden azaltir — mevcut global_cooldown yerine

**Oncelik:** DUSUK — mevcut sabit delay'ler calisiyor; uzun vadeli stabilite iyilestirmesi

---

### Bulgu H — DiskDupeFilter: SQLite WAL Ile Kalici Tekillik (Scrapy)

**Kaynak:** `scrapy/dupefilters.py` -> `DiskDupeFilter`

**Scrapy Mekanizmasi:**
```python
# SQLite WAL modunda, WITHOUT ROWID optimizasyonuyla
self._db.execute("PRAGMA journal_mode=WAL")
self._db.execute("CREATE TABLE IF NOT EXISTS seen (fingerprint BLOB PRIMARY KEY) WITHOUT ROWID")

def request_seen(self, request):
    fp = self._fingerprint(request)
    cursor = self._db.execute("INSERT OR IGNORE INTO seen VALUES (?)", (fp,))
    return not cursor.rowcount  # 0 satir etkilendiyse zaten gorulmus
```
Restart sonrasi tekillik korunur, bellek yerine disk kullanilir.

**Protokol-7'deki Gap:**
- DergiPark `ledger.py`: makale URL'leri `dergipark_articles` tablosunda izleniyor — benzer
- Ama HuggingFace ve Aperta orchestrator'larinda URL/dosya tekillik kontrolu
  bellek icinde set ile yapiliyor — restart sonrasi kayboluyor
- Buyuk dosya listelerinde (HuggingFace: 565 dosya, 471 GB) in-memory set
  disk alternatifine gore daha kirılgan

**Uygulanacak Adaptasyon:**
- `dedup_store.py`: `WITHOUT ROWID` + WAL modunda SQLite tekillik deposu
- `fingerprint(url, method, etag)` -> `BLOB PRIMARY KEY`
- HuggingFace orchestrator'ina entegre: restart sonrasi indirilmis dosyalar
  tekrar indirilmez
- Mevcut `dergipark ledger` mimarisine uygun — sadece shared utility olarak cikartilir

**Oncelik:** ORTA — HuggingFace buyuk dosya listesinde restart guvenligi saglar

---

### Bulgu I — CloseSpider: Cok Eksenli Sonlandirma Kosullari (Scrapy)

**Kaynak:** `scrapy/extensions/closespider.py` -> `CloseSpider`

**Scrapy Mekanizmasi:**
```
close_on:
  timeout:           N saniye sonra kapat
  itemcount:         N kayit sonra kapat
  pagecount:         N sayfa sonra kapat
  errorcount:        N hata sonra kapat
  timeout_no_item:   N saniyedir yeni kayit gelmiyorsa kapat
  pagecount_no_item: N sayfadir yeni kayit gelmiyorsa kapat
```
Her kosul bagimsiz, herhangi biri tetiklenince spider kapatilir.

**Protokol-7'deki Gap:**
- Python orchestrator'larinda yalnizca `--max-articles 0` (sinirsiz) veya
  sabit bir ust sinir var — cok eksenli sonlandirma kosulu yok
- "30 dakikadir yeni kayit gelmiyor" gibi akilli sonlandirma mantigi yok
- `errorcount` bazli otomatik sonlandirma yok — surekli hata halinde
  daemon calismaya devam eder

**Uygulanacak Adaptasyon:**
- `pipeline_stopper.py`: `StopCondition` dataclass — timeout, item_count,
  error_count, idle_timeout parametreleri
- Her orchestrator'in ana dongu baskisina `stopper.should_stop()` cagrilir
- `pipeline_runs` tablosuna `stop_reason TEXT` kolonu eklenir
- Heartbeat monitor (Bulgu A) ile entegre: stale tespiti de stop_reason yazar

**Oncelik:** ORTA — uzun sure hata veren daemon'lari otomatik durdurmak operasyonel guvenlik saglar

---

### Bulgu J — StatsCollector: Calisma Sureci Icin Minimum Sayac Altyapisi (Scrapy)

**Kaynak:** `scrapy/statscollectors.py` -> `StatsCollector`, `MemoryStatsCollector`

**Scrapy Mekanizmasi:**
```python
stats.inc_value("items/scraped")        # artir
stats.max_value("file/size_bytes", sz)  # maksimum izle
stats.min_value("response/latency", lt) # minimum izle
# Kapatilinca otomatik dump: logger.info("Dumping stats: ...")
```
`MutableMapping` ile dict gibi kullanilir. `DummyStatsCollector` zero-cost no-op implementasyonu.

**Protokol-7'deki Gap:**
- Her orchestrator kendi sayaclarini (toplam kayit, hata, shard sayisi vb.)
  ad hoc log mesajlariyla yazar — tutarli bir `inc_value` arayuzu yok
- Pipeline tamamlandiginda ozet istatistik log'u yok, her orchestrator farkli format
- `max_value` / `min_value` izleme yok (ornegin maksimum batch suresi)

**Uygulanacak Adaptasyon:**
- `pipeline_stats.py`: `PipelineStats` sinifi — `inc`, `max`, `min`, `set` metodlari
- Orchestrator kapanisinda `pipeline_runs` tablosuna `stats_json` kolonuna JSON yazar
- `/api/v1/runs/{id}/stats` endpoint'i ile TS tarafindan sorgulanabilir
- `DummyStats` implementasyonu: test ortaminda sifir maliyetli

**Oncelik:** DUSUK — operasyonel gorsellik iyilestirmesi; mevcut log'lar calisiyor

---

### Bulgu A — Heartbeat-based Stale Job Detection (Meltano)

**Kaynak:** `job.py` -> `_heartbeater()`, `stale_job_failer.py`

**Meltano Mekanizmasi:**
- Her calisan is async olarak her 1 saniyede `last_heartbeat_at` gunceller
- `HEARTBEAT_VALID_MINUTES = 5`: 5 dakika heartbeat gelmezse stale
- `HEARTBEATLESS_JOB_VALID_HOURS = 24`: heartbeat hic gelmemisse 24 saatte stale
- `fail_stale_jobs()` periyodik cagrilir, stale job'lari `FAIL` state'e gecirir

**Protokol-7'deki Gap:**
- `WorkerPool.reapExpiredLeases()` DB lease'lerini temizler ama calisan
  Python daemon'lar icin heartbeat kaydi yoktur
- 4 aktif daemon (DOAJ, DergiPark, Aperta, HuggingFace) cokusze karsi
  sadece PID dosyasi + manuel `tail -f` ile izlenir
- Stale tespiti otomatik degil, elle yapilir

**Uygulanacak Adaptasyon:**
- `pipeline_runs` tablosuna `last_heartbeat_at`, `heartbeat_interval_seconds` eklenir
- Python orchestrator'lara paylasilmis `heartbeat_writer.py` modulu eklenir
- TS WorkerPool reaper'i `checkStalePipelineRuns()` ile genisletilir
- `/api/v1/health` endpoint'i stale run listesi doner

**Oncelik:** YUKSEK — 4 aktif daemon calisiyor, operasyonel risk var

---

### Bulgu B — Partial/Completed State Merge (Meltano)

**Kaynak:** `state_store/base.py` -> `MeltanoState`, `merge_partial()`, `update()`

**Meltano Mekanizmasi:**
```
MeltanoState:
  state_id: str
  partial_state: dict   # is devam ediyor, cursor bilgisi
  completed_state: dict # son basarili nokta

merge_partial(new_partial, existing_partial) -> merged
update() -> partial degilse mevcut state uzerine merge eder
```

**Protokol-7'deki Gap:**
- `pipeline_runs` tablosunda `cursor_value` var (Faz 3) ama
  `partial` / `completed` ayrimi yoktur
- DOAJ, DergiPark, HuggingFace orchestrator'lari kendi ad hoc
  checkpoint mekanizmalarini yazar
- Crash -> restart senaryosunda cursor geri yukleme deterministic degil

**Uygulanacak Adaptasyon:**
- `pipeline_runs` tablosuna `state_type TEXT CHECK(IN 'partial','completed')`
  ve `state_payload JSON` kolonlari eklenir
- `state_merge.py` yardimcisi: Meltano'nun merge semantigini adapte eder
- TS tarafi `StateService` sinifi: `getLatestState`, `setPartialState`,
  `setCompletedState` metodlari
- Her orchestrator kritik checkpoint noktalarda `partial` kaydeder

**Oncelik:** ORTA — mevcut isler calisiyor, restart senaryosu icin iyilestirme

---

### Bulgu C — Pipeline TransactionThresholds (NiFi)

**Kaynak:** `nifi-stateless/.../flow/TransactionThresholds.java`

**NiFi Mekanizmasi:**
```java
interface TransactionThresholds {
  OptionalLong getMaxFlowFiles();           // max kayit sayisi
  OptionalLong getMaxContentSize(DataUnit); // max byte
  OptionalLong getMaxTime(TimeUnit);        // max sure
}

// Predefined:
TransactionThresholds.SINGLE_FLOWFILE  // tek kayit
TransactionThresholds.UNLIMITED        // sinirsiz
```

**Protokol-7'deki Gap:**
- Her Python orchestrator kendi rate limiter'ini ayri yazar:
  - DergiPark: `ThreadSafeRateLimiter` + `--rate-limit 1.75`
  - DOAJ: `--batch-size 1000` + `--max-shard-records 50000`
  - Aperta: `--rate-limit 0.8` + `--batch-size 500`
- Merkezi bir transaction baski mekanizmasi yoktur
- Parametre isimleri ve semantikleri orchestrator'dan orchestrator'a farkli

**Uygulanacak Adaptasyon:**
- `pipeline_limits.py`: `TransactionThresholds(max_records, max_bytes, max_seconds)` dataclass
- `ThresholdGuard` context manager: esik asilinca cycle tamamlanir
- `contracts/pipeline-thresholds.json` JSON Schema sozlesmesi
- Mevcut orchestrator'larin dis API'si degismez — icinde ThresholdGuard kullanilir

**Oncelik:** DUSUK — mevcut rate limiterlar calisiyor, standardizasyon iyilestirmesi

---

### Bulgu D — WriteAheadRepository Checkpoint Pattern (NiFi) — ADR

**Kaynak:** `nifi-commons/nifi-write-ahead-log/.../WriteAheadRepository.java`

**NiFi Mekanizmasi:**
- Her write once EditLog'a gider
- `checkpoint()`: mevcut state snapshot'i alir, EditLog temizlenir
- Restart: snapshot yukle + EditLog replay = tam recovery

**Protokol-7'deki Gap:**
- Ledger SQLite ACID yazar ama checkpoint/compaction yoktur
- `npm run consolidate` ile eski task'lar `ledger/` klasorune tasinir
  ama bu bir WAL degil, belge kompaksiyonudur
- Uzun suren daemon'larin SQLite kutlukleri buyudukce okuma yavaslar

**Karari:**
- Anda SQLite performansi sorun degil (max birkac yuz bin kayit)
- WAL uygulamasi yuksek karmasiklik, dusuk aciliyet
- ADR belgesi olarak kayit altina alinir, Faz 5+ hedefi

**Oncelik:** ADR — uygulama yok, belge kaydi yeterli

---

### Bulgu E — Lineage Node/Edge Graph (NiFi) — ADR

**Kaynak:** `nifi-framework-api/.../provenance/lineage/LineageNode.java`,
`LineageEdge.java`, `ComputeLineageSubmission.java`

**NiFi Mekanizmasi:**
```
LineageNode:
  nodeType: FLOWFILE_NODE | PROVENANCE_EVENT_NODE
  flowFileUuid: String
  identifier: String
  timestamp: long

LineageEdge:
  source: LineageNode
  destination: LineageNode
```
Her FlowFile hangi component'ten gectigi graph olarak sorgulanabilir.

**Protokol-7'deki Gap:**
- `provenance_events` tablosu var (Faz 3) ama duz kayit, graph yok
- `source_id -> run_id -> dataset_id` zinciri takip edilebilir ama
  lineage query arayuzu yoktur

**Karari:**
- Mevcut provenance semasi ile gap analizi yapilir, ADR'a eklenir
- Faz 5+ hedefi: `provenance_nodes`, `provenance_edges` tablolari
- Anda uygulama yok

**Oncelik:** ADR — uygulama yok, Faz 5+ hedefi

---

---

## 3b. Selenium — Incelenen Moduller

| Dosya | Konu |
|---|---|
| `py/selenium/webdriver/support/wait.py` | `WebDriverWait`: timeout + poll_frequency + ignored_exceptions ile predicate dongusu |
| `py/selenium/webdriver/support/expected_conditions.py` | 30+ callable EC: visibility, staleness, any_of/all_of/none_of compositor |
| `py/selenium/webdriver/common/service.py` | `Service` ABC: subprocess yasam dongusu, exponential backoff baslangiç, SIGTERM/SIGKILL |
| `py/selenium/webdriver/common/timeouts.py` | `Timeouts`: implicit_wait/page_load/script — ms donusum ile W3C WebDriver spec |
| `py/selenium/webdriver/remote/errorhandler.py` | `ErrorHandler`: W3C hata kodu -> typed exception mapping |

## 3c. Trafilatura — Incelenen Moduller

| Dosya | Konu |
|---|---|
| `trafilatura/downloads.py` | SSRF korumasi, pycurl/urllib3 cift katman, SSL fallback, retry_after backoff, domain-aware URL store |
| `trafilatura/deduplication.py` | `Simhash` (Charikar), `LRUCache` (OrderedDict + RLock), `generate_bow_hash` (blake2b) |
| `trafilatura/spider.py` | `CrawlParameters`: base/ref URL ayrimi, robots.txt, is_exhausted_domain |
| `trafilatura/settings.py` | `Extractor` dataclass: tum cikarim seceneklerini tek nesnede toplar |

---

## 4. Selenium'dan Gecerli Bulgular

### Bulgu K — WebDriverWait / Condition Polling Pattern (Selenium)

**Kaynak:** `wait.py` -> `WebDriverWait.until()`, `expected_conditions.py`

**Selenium Mekanizmasi:**
```python
WebDriverWait(driver, timeout=30, poll_frequency=0.5,
              ignored_exceptions=[NoSuchElementException])
    .until(EC.visibility_of_element_located((By.ID, "result")))

# EC'ler callable predicate'ler:
# any_of(ec1, ec2)  -> birisi True ise True
# all_of(ec1, ec2)  -> hepsi True ise list[result]
# none_of(ec1, ec2) -> hicbiri True degil ise True
```
`until()`: `time.monotonic()` ile kesin timeout, half-second poll, ignored exception listesi,
timeout asilinca screen + stacktrace dahil `TimeoutException`.

**Protokol-7'deki Gap:**
- Python orchestrator'larinda "OAI-PMH cursor gelene kadar bekle", "Drive upload bitmeden
  shard'a yazma" gibi bekleme mantigi `time.sleep()` ile sabit polling ile yapiliyor
- Retry loop'larinda ignored exception kavrami yok — her exception ayni sekilde isleniyor
- `any_of` / `all_of` gibi kosal kompozitor yok; multi-kaynak hazirlik kontrolu
  ic ice if bloklariyla yaziliyor

**Uygulanacak Adaptasyon:**
- `condition_wait.py`: `wait_until(condition_fn, timeout, poll, ignored_exceptions)`
  generic yardimci — Selenium'un `until()` mantigi, WebDriver bagimlilik olmadan
- `Condition` callable protokolu: `(context) -> bool | T`
- Kullanim: Drive upload tamamlanmasini, OAI cursor guncellenmesini,
  heartbeat yazilmasini beklemek icin mevcut `time.sleep()` satirlarini degistir

**Oncelik:** DUSUK — mevcut sleep/polling calisiyor; test edilebilirlik ve okunabilirlik iyilestirmesi

---

### Bulgu L — Service ABC: Subprocess Yasam Dongusu + Graceful Shutdown (Selenium)

**Kaynak:** `service.py` -> `Service.start()`, `_terminate_process()`

**Selenium Mekanizmasi:**
```python
# Baslangic: exponential backoff ile baglanti kontrolu
sleep(min(0.01 + 0.05 * count, 0.5))  # 0.01 -> 0.5s arasi artan bekleme
if self.is_connectable(): break        # /status endpoint sorgusu
if count == 70: raise WebDriverException(...)

# Durdurma: oncelikle graceful, sonra zorla
process.terminate()           # SIGTERM
process.wait(timeout=60)      # 60s bekle
# timeout asildiysa:
process.kill()                # SIGKILL
```

**Protokol-7'deki Gap:**
- Python daemon baslatma kodunda `subprocess.Popen` dogrudan kullaniliyor
  ama baslama hazirligini denetleyen bir loop yok — servis hemen hazir sayiliyor
- `stop()` siralamasi SIGTERM -> bekleme -> SIGKILL degil; cogunlukla sadece
  PID dosyasina bakilip `os.kill(pid, signal.SIGTERM)` cagiriliyor
- Graceful shutdown timeout'u ayarlanamaz

**Uygulanacak Adaptasyon:**
- `subprocess_service.py`: `ManagedService` ABC — `start()`, `stop()`, `is_connectable()`
  metodlari; `_terminate_process()` SIGTERM -> bekleme -> SIGKILL sirasini uygular
- `start()`: exponential backoff ile readiness probe (HTTP /health veya PID dosyasi)
- `GRACEFUL_SHUTDOWN_TIMEOUT_S` konfigurasyonu
- Mevcut `orchestrator.py` baslangic kodlarini `ManagedService` altsiniflarina tasir

**Oncelik:** ORTA — 4 aktif daemon'in guvenli baslama/durma kalibini standartlastirir;
Bulgu A (heartbeat) ile birlikte calisir

---

## 5. Trafilatura'dan Gecerli Bulgular

### Bulgu M — SSRF Korumasi + Cift Katman HTTP (Trafilatura)

**Kaynak:** `downloads.py` -> `_SafePoolManager`, `_ssrf_opensocket`, `_SSLRetryError`

**Trafilatura Mekanizmasi:**
```python
class _SafeHTTPConnection(urllib3.connection.HTTPConnection):
    def _new_conn(self):
        sock = super()._new_conn()
        _vet_peer(sock.getpeername()[0])  # baglanti sonrasi DNS rebinding kontrolu
        return sock

# SSL hata ise _SSLRetryError firlat -> no_ssl=True ile tekrar dene
try:
    response = dl_function(url, no_ssl=False, config)
except _SSLRetryError:
    response = dl_function(url, no_ssl=True, config)  # tek seferlik fallback
```
pycurl birincil (DNS/SSL paylasimi), urllib3 yedek. FORCE_STATUS (429, 5xx) -> retry.
`retry_after_max=30`: Retry-After header'ina uyar ama 30 saniye ust siniriyla.

**Protokol-7'deki Gap:**
- DergiPark downloader Cloudflare 429'a karsi `global_cooldown` uyguluyor ama
  `Retry-After` header degerini okuyup uymuyor — sabit bekleme suresi kullaniyor
- SSRF korumasi yok — ic ag adreslerine yonlendirilmis bir URL cekilebilir
- pycurl gibi alternatif HTTP backend yok

**Uygulanacak Adaptasyon:**
- `safe_http.py`: `_vet_peer()` + `_SafePoolManager` implementasyonu protokol-7'ye tasir
- `Retry-After` header okuma: 429 alinca header degerini parse et, `min(header_value, MAX_BACKOFF)` kadar bekle
- `SSRF_PROTECTION` config flag'i: prod'da True, test'te False
- Mevcut urllib3 kullanan downloader'lara SSRF-safe pool inject edilir

**Oncelik:** ORTA — prod guvenlik iyilestirmesi; ozellikle web'den kaynak ceken pipeline'lar icin

---

### Bulgu N — Simhash ile Fuzzy Content Deduplication (Trafilatura)

**Kaynak:** `deduplication.py` -> `Simhash`, `LRUCache`, `duplicate_test()`

**Trafilatura Mekanizmasi:**
```python
# Charikar Simhash: token bag-of-words -> 64-bit hash
hash1 = Simhash("bir belge icerigi")
hash2 = Simhash("cok benzer belge icerigi")
similarity = hash1.similarity(hash2)  # Hamming mesafesine gore 0.0-1.0

# Thread-safe LRU cache: tekrar eden metin bloklari tespiti
lru = LRUCache(maxsize=10000)
lru.increment(text)  # onceki sayi doner; > max_repetitions ise duplikat
```
`generate_bow_hash(text)` -> blake2b ile hizli fingerprint.
`__slots__` ile bellek verimliligi, `@lru_cache` ile token vektoru cache.

**Protokol-7'deki Gap:**
- DergiPark PDF extractor'u ayni makale bircok kez cekildiyse metni tekrar isler
- DOAJ OAI-PMH akisinda ayni kayit farkli cursor'lardan tekrar gelebilir
  (OAI-PMH spec geregi) ama icerik bazli deduplication yok, sadece ID bazli
- `dedup` mekanizmasi su an sadece SQLite unique constraint — fuzzy similarity yok

**Uygulanacak Adaptasyon:**
- `content_dedup.py`: `SimhashDedup` sinifi — `Simhash` + `LRUCache` kombinasyonu
- `is_near_duplicate(text, threshold=0.9)` metodu: mevcut cache'e gore fuzzy eslesme
- DergiPark PDF extractor'una entegre: cikartilan metin cok benzerse `DUPLICATE` olarak isaretle
- `provenance_events` tablosuna `content_simhash TEXT` kolonu ekle

**Oncelik:** ORTA — DergiPark 800K+ makale akisinda yinelenen icerik tespiti saglar

---

### Bulgu O — Domain-Aware URL Store + robots.txt Entegrasyonu (Trafilatura)

**Kaynak:** `downloads.py` -> `add_to_compressed_dict()`, `load_download_buffer()`,
`spider.py` -> `CrawlParameters`, `get_rules()`

**Trafilatura Mekanizmasi:**
```python
# Domain bazli hiz siniri: ayni domain'den URL'leri
# backoff_time arayla grupla
url_store = UrlStore(compressed=False, strict=False)
url_store.add_urls(inputlist)
bufferlist = url_store.get_download_urls(time_limit=5.0, max_urls=100000)
# is_exhausted_domain(base): tum URL'ler goruldu mu?

# robots.txt: standart RobotFileParser entegrasyonu
rules = RobotFileParser()
rules.set_url(urljoin(base, "/robots.txt"))
rules.read()
if not rules.can_fetch(USER_AGENT, url): skip
```

**Protokol-7'deki Gap:**
- DergiPark crawler domain bazli backoff uygular ama `UrlStore` gibi
  compressed/persistent bir URL yonetimi yok — URL listesi bellekte tutuluyor
- robots.txt kontrolu hicbir orchestrator'da yok
- URL blacklist regex kontrolu yok

**Uygulanacak Adaptasyon:**
- Mevcut web'den veri ceken pipeline'lara `courlan.UrlStore` entegrasyonu:
  domain bazli backoff ve tekillik
- `robots_guard.py`: `is_allowed(url, user_agent)` yardimci — robots.txt cache'i
- Bu bulgu Scrapy Bulgu F (HTTP Cache) ile birlestirilirse tam bir nazik cekme katmani olusur

**Oncelik:** DUSUK — mevcut DergiPark sabit rate-limit ile calisiyor;
diger web kaynaklari eklenirse oncelik artar

---

## 6. PASS Edilen Alanlar

### Meltano'dan Pass

| Alan | Gerekce |
|---|---|
| Plugin system (pip install, venv isolation) | Protokol-7 node/python mikro surec mimarisi, plugin registry farkli kavram |
| Singer tap/target protokolu | Protokol-7'de Singer formati yok, kendi contract/schema standartlari var |
| Airflow/dbt/Superset entegrasyonu | Kapsam disi |
| Meltano Hub plugin discovery | Protokol-7'nin kendi MCP + Actor Registry altyapisi mevcut |
| Alembic migration sistemi | Protokol-7'de kendi migration altyapisi var ve calisiyor |
| Schedule cron validation | Protokol-7 ScheduleBroker'da zaten 5-field cron parser var |

### NiFi'dan Pass

| Alan | Gerekce |
|---|---|
| NAR (NiFi Archive) plugin isolasyonu | Java classloader — protokol-7 mimarisiyle uyumsuz |
| Cluster / site-to-site protokol | Protokol-7 single-node tasarimi |
| FlowFile swap-to-disk | Protokol-7 zaten Parquet shard/Drive yazar, farkli pattern |
| NiFi Registry | Protokol-7'nin kendi actor registry'si var |
| Bootstrap/JVM lifecycle yonetimi | Tamamen farkli runtime |
| NiFi Frontend (React UI) | Kapsam disi |

### Scrapy'den Pass

| Alan | Gerekce |
|---|---|
| Twisted/asyncio reactor mimarisi | Protokol-7 Node.js event loop + Python asyncio kullaniyor |
| Item Pipeline sistemi | Protokol-7'nin kendi Actor/Processor zinciri var |
| Spider middleware zinciri | Protokol-7 kendi ActorRegistry + WorkerPool mimarisini kullaniyor |
| Selector (XPath/CSS) motoru | Trafilatura ile kapsaniyor |

### Selenium'dan Pass

| Alan | Gerekce |
|---|---|
| WebDriver protokolu / browser otomasyonu | Protokol-7'nin browser modulu zaten ayri; pipeline orchestration farkli alan |
| BiDi (CDP) entegrasyonu | Kapsam disi |
| ActionChains (fare/klavye simulasyonu) | Protokol-7 headless tarama yapmiyor |

### Trafilatura'dan Pass

| Alan | Gerekce |
|---|---|
| HTML tam metin cikarimi (main_extractor) | DergiPark zaten PyMuPDF ile PDF'ten metin cikiyor; HTML katmani farkli |
| XML/TEI cikti formatlari | Protokol-7 Parquet/JSON kullaniyor |
| Sitemap/feed tarama | Mevcut OAI-PMH ve API akis mimarisiyle ortusuyor |

---

---

---

## 7. Uygulama Oncelik Sirasi (Guncellenmis)

| # | Gorev | Bulgu | Kaynak | Oncelik | Tier | Bagimlilik |
|---|---|---|---|---|---|---|
| 1 | Heartbeat-based Stale Job Detection | A | Meltano | YUKSEK | Tier 1 | pipeline_runs migration |
| 2 | Partial/Completed State Merge | B | Meltano | ORTA | Tier 1 | Gorev 1 sonrasi |
| 3 | SSRF Korumasi + Retry-After | M | Trafilatura | ORTA | Tier 1 | Bagimsiz |
| 4 | Simhash Fuzzy Deduplication | N | Trafilatura | ORTA | Tier 1 | Bagimsiz |
| 5 | Subprocess ManagedService ABC | L | Selenium | ORTA | Tier 1 | Gorev 1 ile birlikte |
| 6 | ManagedProcessControl IPC | W | MinerU | ORTA | Tier 1 | Gorev 5 ile birlikte |
| 7 | RFC2616 HTTP Cache + ETag | F | Scrapy | ORTA | Tier 1 | Bagimsiz |
| 8 | CloseSpider: Cok Eksenli Stop | I | Scrapy | ORTA | Tier 1 | Gorev 1 ile birlikte |
| 9 | Cursor Optimistic Lock (ClockTag) | S | Qdrant | ORTA | Tier 1 | Gorev 2 sonrasi |
| 10 | Drive Sync Async Thread Refactor | R | Qdrant | ORTA | Tier 1 | Bagimsiz |
| 11 | DocumentParser ABC + ParseResult | V | MinerU | ORTA | Tier 1 | Bagimsiz |
| 12 | Retry Policy (constant/exp/random) | T | Kestra | ORTA | Tier 1 | Bagimsiz |
| 13 | Pipeline TransactionThresholds | C | NiFi | DUSUK | Tier 1 | Bagimsiz |
| 14 | AutoThrottle: Latency-Driven Delay | G | Scrapy | DUSUK | Tier 1 | Bulgu C sonrasi |
| 15 | DiskDupeFilter: SQLite Tekillik | H | Scrapy | ORTA | Tier 1 | Bagimsiz |
| 16 | PipelineStats Sayac Altyapisi | J | Scrapy | DUSUK | Tier 1 | Bagimsiz |
| 17 | Actor Telemetry (token/maliyet) | Q | Scrapegraph | DUSUK | Tier 1 | Bulgu J ile birlikte |
| 18 | Condition Polling (wait_until) | K | Selenium | DUSUK | Tier 1 | Bagimsiz |
| 19 | Domain-Aware URL Store | O | Trafilatura | DUSUK | Tier 1 | Bagimsiz |
| 20 | Step Input Expression Parser | P | Scrapegraph | DUSUK | Tier 1 | Bagimsiz |
| 21 | Extraction Tier Secimi | X | MinerU | DUSUK | Tier 1 | Bagimsiz |
| 22 | Backfill Pencere Kontrolu | U | Kestra | DUSUK | Tier 1 | Bagimsiz |
| 23 | Pydantic CLI Arg Validation | Y | Pydantic | DUSUK | Tier 1 | Bagimsiz |
| 24 | WAL Checkpoint ADR (NiFi+Qdrant) | D+R | NiFi/Qdrant | ADR | - | Bagimsiz |
| 25 | Lineage Graph ADR belgesi | E | NiFi | ADR | - | Bagimsiz |

---

## 6. Scrapegraph-ai'dan Gecerli Bulgular

### Incelenen Moduller

| Dosya | Konu |
|---|---|
| `scrapegraphai/graphs/abstract_graph.py` | `AbstractGraph`: LLM fabrika, rate limiter entegrasyonu, token saymasi, async calisma |
| `scrapegraphai/graphs/base_graph.py` | `BaseGraph`: node/edge DAG yurutme, token + maliyet izleme, conditional node |
| `scrapegraphai/nodes/base_node.py` | `BaseNode`: input expression parser (AND/OR/parantez), state dict gecisi |
| `scrapegraphai/nodes/conditional_node.py` | `ConditionalNode`: `simpleeval` ile runtime condition, true/false dal secimi |
| `scrapegraphai/nodes/rag_node.py` | `RAGNode`: Qdrant client entegrasyonu, embedding + koleksiyon olusturma |
| `scrapegraphai/nodes/robots_node.py` | `RobotsNode`: LLM ile robots.txt degerlendirmesi, force_scraping override |

### Bulgu P — BaseNode Input Expression Parser (Scrapegraph-ai)

**Kaynak:** `nodes/base_node.py` -> `_parse_input_keys()`, `get_input_keys()`

**Scrapegraph Mekanizmasi:**
```python
# Input: state'den hangi anahtarlar gerekiyor?
# Expression: "doc & url | html & url" (AND/OR/parentez)
node.input = "parsed_doc | (url & html)"

def _parse_input_keys(self, state, expression):
    # AND: tum anahtarlar varsa hepsini dondur
    # OR: ilk eslesen grubu dondur
    # Parantez: once ic grubu coz, sonra dis
    # Gecersiz operator: ValueError firlatir
```
State dict'ten runtime'da anahtarlar cozumleniyor; node hangi girdilere
ihtiyac duydugunu static tip degil, expression ile tanimlıyor.

**Protokol-7'deki Gap:**
- Workflow step'leri arasinda veri gecisi dogrudan parametre veya sabit alan isimleriyle
  yapiliyor — hangi cikti hangi girdi olarak aktarilacagi kod icine gomulu
- Pipeline'da bir step baska step'in ciktisina "varsa A, yoksa B kullan" seklinde
  esnek bagli degil

**Uygulanacak Adaptasyon:**
- `step_context.py`: `resolve_inputs(state, expression)` yardimcisi —
  Scrapegraph'in `_parse_input_keys` mantigi, pipeline step'lerine uyarlanir
- Workflow YAML/JSON'da adim girdi ifadeleri: `"cursor_value | last_known_offset"`
- Boru hatti adimlarinin input/output sozlesmeleri `contracts/` altinda dokumante edilir

**Oncelik:** DUSUK — mimari iyilestirme; mevcut hard-coded parametre gecisleri calisiyor

---

### Bulgu Q — DAG Execution + Token/Maliyet Izleme (Scrapegraph-ai)

**Kaynak:** `graphs/base_graph.py` -> `_execute_standard()`, `_execute_node()`, `cb_total`

**Scrapegraph Mekanizmasi:**
```python
# Her node icin:
cb_data = {
    "node_name": ...,
    "total_tokens": cb.total_tokens,
    "prompt_tokens": cb.prompt_tokens,
    "completion_tokens": cb.completion_tokens,
    "total_cost_USD": cb.total_cost,
    "exec_time": node_exec_time,
}

# Toplam:
exec_info.append({"node_name": "TOTAL RESULT",
                  "total_tokens": cb_total["total_tokens"],
                  "total_cost_USD": cb_total["total_cost_USD"],
                  "exec_time": total_exec_time})
```
Her node USD maliyeti ve token kullanimi raporluyor; toplam graph bazinda birikim.

**Protokol-7'deki Gap:**
- LLM cagrilari (MCP araclari uzerinden) ne kadar token, ne kadar maliyet
  harcadigini izlemiyor — sadece basari/basarisizlik kaydi var
- Actor bazinda calisma suresi izlenmiyor; bottleneck tespiti manuel

**Uygulanacak Adaptasyon:**
- `actor_telemetry.py`: Actor cagrilarinda `exec_time_ms`, `llm_tokens_in`,
  `llm_tokens_out`, `llm_cost_usd` alanlari kaydi
- `pipeline_runs.stats_json` kolonuna actor bazli telemetry yazilir (Bulgu J ile ortusuyor)
- MCP tool response'larinda token kullanim bilgisi parse edilirse otomatik dolabilir

**Oncelik:** DUSUK — LLM aktorleri aktif kullanildiginda maliyeti izlemek icin gerekli

---

## 7. Qdrant'tan Gecerli Bulgular

### Incelenen Moduller

| Dosya | Konu |
|---|---|
| `lib/wal/src/lib.rs` | `Wal`: open/closed segment yonetimi, `append`/`truncate`/`prefix_truncate`, async flush, flock ile exclusive dir lock |
| `lib/collection/src/wal_delta.rs` | `RecoverableWal`: clock tag, `newest_clocks`/`oldest_clocks` map, delta recovery |
| `lib/collection/src/operations/mod.rs` | `CollectionUpdateOperations`: `SplitByShard` trait, `OperationToShard::ByShard/ToAll` |
| `lib/bm25/src/lib.rs` | BM25 sparse retrieval, basic tokenizer |

### Bulgu R — WAL Segment Yonetimi: Closed/Open Segment Dongusu (Qdrant)

**Kaynak:** `lib/wal/src/lib.rs` -> `Wal`, `retire_open_segment()`, `prefix_truncate()`

**Qdrant WAL Mekanizmasi:**
```rust
// open segment: yazma devam ediyor
// closed-{start_index}: tamamlanmis, read-only
// prefix_truncate(until): eski closed segment'lari sil,
//   en az `retain_closed` (varsayilan 1) segment tut
// async flush: retire sirasinda bir onceki segment
//   ayri thread'de flush edilir — write path'i bloklamaz

Wal {
    open_segment: OpenSegment,
    closed_segments: Vec<ClosedSegment>,
    retain_closed: NonZeroUsize,  // min 1 koruma garantisi
}
```
Crash recovery: `open-*` ve `closed-*` dosyalari dizinden okuyup
non-overlapping, contiguous kontrol ederek WAL yeniden kurulur.
`tmp-*` dosyalari crash kalintisi olarak temizlenir.

**Protokol-7'deki Ilgi:**
- Bu, NiFi WAL bulgusunun (D) pratik Rust implementasyonu.
  Qdrant WAL'in `prefix_truncate` + `retain_closed` modeli
  ledger kompaksiyonu icin somut referans saglıyor.
- `async flush` (ayri thread, write path bloklamaz) Python
  orchestrator'larin `Drive upload` sirasinda ana is dongusu
  duraklamasini onlemek icin ilham kaynagi.

**Uygulanacak Adaptasyon:**
- NiFi WAL ADR belgesi (Bulgu D) icine Qdrant'in somut implementasyon
  detaylarini (segment boyutu, retain_closed, async flush) referans olarak ekle
- Python shard writer'larda Drive upload'u ayri thread'e tasima:
  mevcut `drive_sync.py` cagrilarinda ana dongu bloklanmamali

**Oncelik:** ADR guncellemesi + mevcut drive_sync'te ORTA oncelikli refactor

---

### Bulgu S — RecoverableWal: ClockTag ile Operasyon Siralama (Qdrant)

**Kaynak:** `lib/collection/src/wal_delta.rs` -> `RecoverableWal`, `lock_and_write()`

**Qdrant Mekanizmasi:**
```rust
// Her operasyon bir ClockTag tasir: peer_id + clock_id + tick
// newest_clocks: her peer/clock icin en yuksek gorulmus tick
// oldest_clocks: recovery'de kesmek icin alt sinir

pub async fn lock_and_write(&self, operation: &mut OperationWithClockTag)
    -> Result<(u64, OwnedMutexGuard<...>)> {

    // clock tag'i ilerlet ya da reddet
    if !self.newest_clocks.advance_clock_and_correct_tag(clock_tag) {
        return Err(WalError::ClockRejected); // duplikat veya geriden gelen op
    }
    // WAL'a yaz, mutex guard dondur — release edene kadar kimse yazamaz
    wal_lock.write(&record)
}
```

**Protokol-7'deki Ilgi:**
- `pipeline_runs`'ta `run_id` var ama ayni pipeline'in paralel cagirilmasi
  durumunda hangi operasyonun once yazilacagi belirsiz
- OAI-PMH cursor ilerlemesi monoton olmali; geriden gelen cursor kabul
  edilmemeli (sunucu tarafli deltalarda duplikat kayit riski)

**Uygulanacak Adaptasyon:**
- Mevcut `pipeline_runs.cursor_value` alanina `cursor_version INTEGER DEFAULT 0` eklenir
- Python orchestrator cursor guncelleme sirasinda `WHERE cursor_version = :expected_version`
  ile optimistic lock uygular: beklenenden dusuk versiyon gelirse red
- Bu Meltano Bulgu B (state merge) ile direkt baglantilidır —
  partial state merge sirasinda "stale cursor" yazilmasini engeller

**Oncelik:** ORTA — OAI-PMH ve cok isci senaryolarinda cursor bütünlugu saglar

---

### Qdrant'tan Pass

| Alan | Gerekce |
|---|---|
| Vector index (HNSW) | Protokol-7 vektor arama yapmıyor |
| Quantization (scalar/binary/product) | Kapsam disi |
| Distributed shard yonetimi | Single-node tasarim |
| BM25 sparse retrieval | Metin arama altyapisi mevcut degil |
| Snapshot/backup sistemi | Drive TAR.GZ arsiviyle kapsaniyor |

### Scrapegraph-ai'dan Pass

| Alan | Gerekce |
|---|---|
| LLM tabanli web scraping pipeline | Protokol-7 kural bazli + API/OAI-PMH cekiyor |
| SmartScraper/OmniScraper graph'lari | Farkli paradigma — kapsam disi |
| Speech/image-to-text node'lari | Kapsam disi |
| Burr state machine entegrasyonu | Protokol-7'nin kendi workflow mimarisi var |

---

## 8. Uygulama Notlari

- Gorev 1 ve 2 aktif daemon'lar calisirken sifir-kesinti migration gerektirir.
  Migration once `DEFAULT NULL` ile eklenir, daemon'lar yeniden baslatilana
  kadar heartbeat yazmaz — bu guvenli gecis saglar.
- Gorev 5 (ManagedService) ve Gorev 1 (Heartbeat) ayni daemon restart penceresi icinde
  uygulanabilir — birbirini tamamlar.
- Gorev 3 (SSRF) bagimsizdir, mevcut downloader'lara yeni pool inject edilerek devreye alinir.
- ADR belgeleri (Gorev 14-15) kod degisikligi gerektirmez, `docs/plans/` altinda
  ayri dosyalar olarak tutulur.
- Tum gorevler `npm run verify` ve mevcut test altyapisina entegre olmalidir.
- Degisiklikler `rules/failure-checklist.md` taramasindan gecirilmelidir.

---

## 9. Referans Kaynaklar

- Meltano heartbeat: `meltano/src/meltano/core/job/job.py:215-280`
- Meltano stale failer: `meltano/src/meltano/core/job/stale_job_failer.py`
- Meltano state merge: `meltano/src/meltano/core/state_store/base.py:130-175`
- NiFi WAL: `nifi/nifi-commons/nifi-write-ahead-log/src/main/java/org/wali/WriteAheadRepository.java`
- NiFi thresholds: `nifi/nifi-stateless/nifi-stateless-api/src/main/java/org/apache/nifi/stateless/flow/TransactionThresholds.java`
- NiFi lineage: `nifi/nifi-framework-api/src/main/java/org/apache/nifi/provenance/lineage/LineageNode.java`
- Scrapy retry: `scrapy/scrapy/downloadermiddlewares/retry.py`
- Scrapy throttle: `scrapy/scrapy/extensions/throttle.py`
- Scrapy closespider: `scrapy/scrapy/extensions/closespider.py`
- Scrapy httpcache: `scrapy/scrapy/extensions/httpcache.py`
- Scrapy dupefilters: `scrapy/scrapy/dupefilters.py`
- Scrapy statscollectors: `scrapy/scrapy/statscollectors.py`
- Selenium wait: `selenium/py/selenium/webdriver/support/wait.py`
- Selenium expected_conditions: `selenium/py/selenium/webdriver/support/expected_conditions.py`
- Selenium service: `selenium/py/selenium/webdriver/common/service.py`
- Trafilatura downloads: `trafilatura/trafilatura/downloads.py`
- Trafilatura deduplication: `trafilatura/trafilatura/deduplication.py`
- Trafilatura spider: `trafilatura/trafilatura/spider.py`
- Scrapegraph abstract_graph: `Scrapegraph-ai/scrapegraphai/graphs/abstract_graph.py`
- Scrapegraph base_graph: `Scrapegraph-ai/scrapegraphai/graphs/base_graph.py`
- Scrapegraph base_node: `Scrapegraph-ai/scrapegraphai/nodes/base_node.py`
- Scrapegraph conditional_node: `Scrapegraph-ai/scrapegraphai/nodes/conditional_node.py`
- Qdrant WAL: `qdrant/lib/wal/src/lib.rs`
- Qdrant RecoverableWal: `qdrant/lib/collection/src/wal_delta.rs`
- Qdrant operations: `qdrant/lib/collection/src/operations/mod.rs`
- Kestra retry: `kestra/core/src/main/java/io/kestra/core/models/tasks/retrys/`
- Kestra TaskRun: `kestra/core/src/main/java/io/kestra/core/models/executions/TaskRun.java`
- Kestra Backfill: `kestra/core/src/main/java/io/kestra/core/models/triggers/Backfill.java`
- MinerU DocumentParser: `MinerU/mineru/parser/base.py`
- MinerU process_control: `MinerU/mineru/parser/process_control.py`
- MinerU types/Tier: `MinerU/mineru/types.py`
- Pydantic validators: `pydantic/pydantic/functional_validators.py`
- Pydantic serializers: `pydantic/pydantic/functional_serializers.py`

---

## 13. Celery, Colly, curl_cffi, FlareSolverr, crawl4ai, Docling, Debezium Bulgulari

### Incelenen Moduller

| Repo | Dosya | Konu |
|---|---|---|
| celery | `celery/bootsteps.py` | `Blueprint` DAG: `send_all(reverse=True)` tersten durdurma, `shutdown_complete Event`, step bagimlilik grafı |
| celery | `celery/canvas.py` | `chain/group/chord`: fan-out → callback kompozisyon, `maybe_unroll_group` |
| celery | `celery/schedules.py` | `crontab`, `solar`, `BaseSchedule.is_due/next` |
| colly | `colly.go`, `http_backend.go` | `LimitRule`: domain regex/glob + Delay + RandomDelay + Parallelism kanal |
| colly | `storage/storage.go` | `Storage` interface: `IsVisited(uint64)`, `InMemoryStorage`, cookie serialization |
| curl_cffi | `curl_cffi/fingerprints.py` | TLS fingerprint impersonation: chrome99–chrome136, firefox, safari |
| FlareSolverr | `src/flaresolverr_service.py` | Cloudflare challenge selectors + Turnstile tespiti + Selenium wait loop |
| crawl4ai | `crawl4ai/cache_context.py` | `CacheMode` enum: ENABLED/DISABLED/READ_ONLY/WRITE_ONLY/BYPASS |
| crawl4ai | `crawl4ai/async_dispatcher.py` | `RateLimiter`: domain bazli exponential backoff + jitter, basaridaki tedricen azalma |
| docling | `docling/document_converter.py` | `FormatOption` pattern: `pipeline_cls + backend`, 20+ format backend, `ThreadPoolExecutor` |
| debezium | `pipeline/spi/OffsetContext.java` | `preSnapshotStart/Completion/postSnapshotCompletion`, `event(collectionId, timestamp)` |
| debezium | `pipeline/EventDispatcher.java` | `ScheduledHeartbeat`, filter, SchemaChange routing, `ChangeEventQueue` |
| debezium | `pipeline/ErrorHandler.java` | `RetriableException` vs `ConnectException`, `RETRIES_UNLIMITED=-1`, `maxRetries` |

---

### Bulgu Z — Blueprint Tersten Durdurma + Step DAG (Celery)

**Kaynak:** `celery/bootsteps.py` -> `Blueprint.stop()`, `send_all(reverse=True)`, `DependencyGraph.topsort()`

**Celery Mekanizmasi:**
```python
# Bagimlilik grafina gore topologik sirala -> baslat
# Durdururken TERSTEN yurut: en son baslayan ilk durur
blueprint.send_all(parent, method='stop', reverse=True)

# shutdown_complete: threading.Event ile senkronizasyon
blueprint.shutdown_complete.set()  # tum step'ler durdu sinyali
blueprint.join(timeout=5)          # dis kod bekleyebilir

# Step'ler bagimliligini beyan eder:
class MyStep(StartStopStep):
    requires = ('celery.worker.consumer:Connection',)
```

**Protokol-7'deki Gap:**
- WorkerPool.stop(): `await Promise.all(workers.map(w => w.stop()))` — tum workers paralel durduruluyor
- Hangi worker'in hangi handler'a bagimli oldugu bilgisi yok — sirasiz kapanma
- Python daemon'larin kapatma sirasi da belirsiz (DOAJ, DergiPark, Aperta bagimsiz calisiyor)

**Uygulanacak Adaptasyon:**
- `shutdown_coordinator.py`: `ShutdownGraph` — bagimlilik sirali kapatma
- `WorkerPool.stop()` icin kapatma siralamasi: once handler'lar, sonra worker'lar, sonra ledger
- `shutdown_complete` event'i: tum daemon'lar kapaninca sinyal, orkestrator bunu bekler

**Oncelik:** DUSUK — mevcut paralel kapanma isliyor; temiz shutdown senaryolari icin iyilestirme

---

### Bulgu AA — LimitRule: Domain Regex/Glob + Channel Bazli Rate Limit (Colly)

**Kaynak:** `colly/http_backend.go` -> `LimitRule`, `colly/storage/storage.go` -> `Storage`

**Colly Mekanizmasi:**
```go
type LimitRule struct {
    DomainRegexp string     // veya DomainGlob
    Delay        time.Duration
    RandomDelay  time.Duration  // [0, RandomDelay] araliginda rasgele ek bekleme
    Parallelism  int            // kanal kapasitesi = max esanlik istek
    waitChan     chan bool       // baslatilan istek doldurur, biten bosaltir
}
// Her istek once waitChan <- true (bloklar), bitince <-waitChan
// Idempotent Init(): ayni kural iki Collector'a verilirse ikinci init no-op
```
`Storage.IsVisited(uint64)`: URL'e hash ile tekillik — pluggable backend.

**Protokol-7'deki Gap:**
- ThreadSafeRateLimiter tum domain'ler icin tek global sinir
- Domain bazli farkli hiz siniri yok (DergiPark 1.75s, baska bir site 0.5s gibi)
- Parallelism kanal mekanizmasi yok — max esanlik istek kavrami yok

**Uygulanacak Adaptasyon:**
- `domain_rate_limiter.py`: `DomainLimitRule(pattern, delay, random_delay, parallelism)` + `asyncio.Semaphore`
- Mevcut `ThreadSafeRateLimiter`'in uzerine domain eslesme katmani eklenir
- Trafilatura `UrlStore` Bulgu O ile birlestirilirse tam domain-aware rate control olusur

**Oncelik:** DUSUK — mevcut sabit rate calisiyor; cok domain senaryolarinda gerekli

---

### Bulgu AB — TLS Fingerprint Impersonation (curl_cffi)

**Kaynak:** `curl_cffi/fingerprints.py` -> `NATIVE_IMPERSONATE_TARGETS`, `FingerprintManager`

**curl_cffi Mekanizmasi:**
```python
# libcurl'un TLS el sikismasini gercek browser gibi yapar
# chrome99, chrome120, chrome136, firefox133, safari18 hedefleri
import curl_cffi.requests as requests
response = requests.get(url, impersonate="chrome120")
# -> TLS JA3 fingerprint + H2 settings + header sirasi Chrome ile ayni
```
Cloudflare ve benzeri bot koruma sistemleri TLS fingerprint kontrolu yapar.
Normal Python `requests`/`urllib3` Java/Python TLS stack imzasi birakir.

**Protokol-7'deki Gap:**
- DergiPark `ThreadSafeRateLimiter` ile rate control yapiyor ama
  Cloudflare TLS fingerprint tespitine karsi onlem yok
- 429 almanin bir kismi IP bazli degil, TLS parmak izi bazli olabilir

**Uygulanacak Adaptasyon:**
- `curl_cffi_downloader.py`: mevcut urllib3 downloader'a alternatif backend
  `curl_cffi.requests.Session(impersonate="chrome120")` ile
- `--use-impersonation` CLI flag'i: sadece TLS engeli yasandiginda devreye alinir
- FlareSolverr Bulgu AC ile birlikte degerlendirilmeli

**Oncelik:** ORTA — DergiPark Cloudflare engeli yasanirsa ilk basvurulacak cozum

---

### Bulgu AC — FlareSolverr: Cloudflare Challenge Selector Katalogu (FlareSolverr)

**Kaynak:** `src/flaresolverr_service.py` -> `CHALLENGE_SELECTORS`, `CHALLENGE_TITLES`, `TURNSTILE_SELECTORS`

**FlareSolverr Mekanizmasi:**
```python
CHALLENGE_TITLES = ['Just a moment...', 'DDoS-Guard']
CHALLENGE_SELECTORS = [
    '#cf-challenge-running', '.ray_id', '.attack-box',
    '#cf-please-wait', '#challenge-spinner',
    '#turnstile-wrapper', '.lds-ring',
    # Custom CloudFlare: EbookParadijs, Film-Paleis gibi
    'td.info #js_info',
]
TURNSTILE_SELECTORS = ["input[name='cf-turnstile-response']"]

# Tespit loop: title veya selector varsa challenge bekle, yoksa ACCESS_DENIED
```
Headless Chrome ile challenge cozuyor, oturumu `SessionsStorage`'a sakliyor.

**Protokol-7'deki Gap:**
- Browser modulu var ama Cloudflare challenge tespiti icin standart bir selector katalogu yok
- Turnstile vs klasik JS challenge ayrimi yapilmiyor

**Uygulanacak Adaptasyon:**
- `cloudflare_detector.py`: `CHALLENGE_SELECTORS`, `ACCESS_DENIED_SELECTORS`,
  `TURNSTILE_SELECTORS` sabitleri — FlareSolverr'dan dogrudan port
- Browser aktoru: challenge tespit edince `solve_challenge()` yoluna git
- curl_cffi Bulgu AB ile katmanlanir: once TLS impersonation dene, engel aslamazsa browser'a gec

**Oncelik:** ORTA — Cloudflare korumasiyla karsilasilan site sayisi artarsa direkt uygulanir

---

### Bulgu AD — CacheMode Enum: 5-Mod Cache Kontrol (crawl4ai)

**Kaynak:** `crawl4ai/cache_context.py` -> `CacheMode`, `CacheContext.should_read/write()`

**crawl4ai Mekanizmasi:**
```python
class CacheMode(Enum):
    ENABLED    = "enabled"    # oku + yaz
    DISABLED   = "disabled"   # hic cache yok
    READ_ONLY  = "read_only"  # sadece oku, yazma
    WRITE_ONLY = "write_only" # sadece yaz, okuma
    BYPASS     = "bypass"     # bu islem icin atla

def should_read(self) -> bool:
    if self.always_bypass or not self.is_cacheable: return False
    return self.cache_mode in [CacheMode.ENABLED, CacheMode.READ_ONLY]
```
URL tipi (web/local/raw) otomatik tespit; `always_bypass` per-request override.

**Protokol-7'deki Gap:**
- Scrapy HTTPCache Bulgu F'de sadece `HTTPCACHE_ENABLED: bool` var
- "Sadece yaz ama okuma" (backfill sirasinda yeni kayit cache'le ama eskiyi okuma),
  "sadece oku" (test modunda canli istek yapma) gibi senaryolar desteklenmiyor

**Uygulanacak Adaptasyon:**
- `CacheMode` enum Scrapy HTTPCache entegrasyonuna eklenir (Bulgu F genisletilir)
- Pipeline CLI'a `--cache-mode` parametresi
- Backfill senaryolarinda `WRITE_ONLY`, test ortaminda `READ_ONLY`

**Oncelik:** DUSUK — Bulgu F uygulandiktan sonra dogal genisleme

---

### Bulgu AE — RateLimiter: Jitter + Tedricen Azalan Backoff (crawl4ai)

**Kaynak:** `crawl4ai/async_dispatcher.py` -> `RateLimiter.update_delay()`

**crawl4ai Mekanizmasi:**
```python
# 429/503 alinca:
state.current_delay = min(
    state.current_delay * 2 * random.uniform(0.75, 1.25),  # +/- %25 jitter
    self.max_delay                                            # ust sinir
)
# Basari durumunda YAVASCACA azalt:
state.current_delay = max(
    random.uniform(*self.base_delay),          # taban seviyesine in
    state.current_delay * 0.75                 # %25 azalt
)
```
"Hizli arttir, yavas azalt" — sunucu iyilesirken ani trafikten kacinir.

**Protokol-7'deki Gap:**
- Mevcut `global_cooldown` sabit bir sure bekler, sonra normal hiza doner
- Basarili isteklerde delay tedricen azaltilmiyor — gereksiz yere yavash kalmaya devam ediyor
- Jitter yok: tum worker'lar ayni anda ayni delay ile istek yapabilir (thundering herd)

**Uygulanacak Adaptasyon:**
- `adaptive_rate_limiter.py`: `update_delay(url, status_code)` implementasyonu
  crawl4ai'nin jitter + tedricen azalma logigi ile
- Mevcut `ThreadSafeRateLimiter.global_cooldown` bu ile degistirilir
- Kestra Retry Bulgu T + NiFi TransactionThresholds Bulgu C ile birlesince
  tam bir rate/retry katmani olusur

**Oncelik:** ORTA — mevcut sabit backoff yerine; uzun surecli pipeline'larda
gereksiz yavaslama ve thundering herd onler

---

### Bulgu AF — FormatOption Pattern: Pipeline x Backend Matrisi (Docling)

**Kaynak:** `docling/document_converter.py` -> `FormatOption`, `DocumentConverter`

**Docling Mekanizmasi:**
```python
class FormatOption(BaseFormatOption):
    pipeline_cls: Type[BasePipeline]   # hangi pipeline
    backend: Type[AbstractDocumentBackend]  # hangi backend

class PdfFormatOption(FormatOption):
    pipeline_cls: Type = StandardPdfPipeline
    backend: Type = DoclingParseDocumentBackend

class WordFormatOption(FormatOption):
    pipeline_cls: Type = SimplePipeline
    backend: Type = MsWordDocumentBackend

# Converter:
converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(...),
                    InputFormat.DOCX: WordFormatOption(...)}
)
result = converter.convert(source)
```
`ThreadPoolExecutor` ile paralel batch; `ConversionStatus` (SUCCESS/FAILURE/PARTIAL_SUCCESS).

**Protokol-7'deki Gap:**
- Aperta pipeline: PDF, ZIP, XLSX, DOCX, TAR.GZ gibi farkli formatlari indirir
  ama her format icin cikartma stratejisi yok — sadece PDF icin `pdf_extractor.py` var
- Multi-format arsivleme yapiliyor ama metadata cikarimi sadece PDF'e ozgu

**Uygulanacak Adaptasyon:**
- `format_extractor.py`: `FormatOption` pattern — `file_suffix -> (pipeline_fn, backend_cls)`
  sozluk eslemesi
- Aperta `pdf_downloader.py` genisletilir: `.pdf`, `.docx`, `.xlsx` icin ayri extractor
- MinerU `DocumentParser` Bulgu V + Docling `FormatOption` birlesince
  tam multi-format dokuman pipeline'i olusur

**Oncelik:** ORTA — Aperta multi-format arsivinde metadata geri kazanimi saglar

---

### Bulgu AG — OffsetContext: Snapshot/Streaming Gecis Protokolu (Debezium)

**Kaynak:** `debezium-connector-common/.../pipeline/spi/OffsetContext.java`

**Debezium Mekanizmasi:**
```java
interface OffsetContext {
    void preSnapshotStart(boolean onDemand);   // snapshot basladi
    void preSnapshotCompletion();               // snapshot bitmek uzere
    void postSnapshotCompletion();              // snapshot tamamlandi, streaming'e gec

    void event(DataCollectionId collectionId, Instant timestamp); // her olayda cagrilir

    boolean isInitialSnapshotRunning();  // hangi modda oldugunu sorgula
    Map<String, ?> getOffset();          // Kafka'ya commit edilecek offset
}
```
Restart sonrasi: snapshot tamamsa `offset` bilgisinden streaming'e devam,
snapshot yarimdaysa basina don. Her iki mod icin tutarli offset yonetimi.

**Protokol-7'deki Gap:**
- Meltano Bulgu B (partial/completed state): ayni sorunu cozer ama
  Debezium bu gecisi daha formal tanimliyor — 3 lifecycle metodu ile
- DergiPark, DOAJ, Aperta'nin "ilk cekimde tam snapshot, sonra delta" modeli yok;
  hep bastan basiyor

**Uygulanacak Adaptasyon:**
- `offset_context.py`: `OffsetContext` ABC — `pre_snapshot_start()`,
  `post_snapshot_completion()`, `advance_streaming(cursor)` metodlari
- Meltano partial/completed Bulgu B ile entegre: snapshot modu `partial`,
  streaming modu `completed` olarak eslesir
- DOAJ ve DergiPark: ilk full-cekimi "snapshot", sonrasini "streaming delta" olarak modelleyin

**Oncelik:** ORTA — Bulgu B ile birlikte uygulanirsa restart semantigini netlestirir

---

### Bulgu AH — ErrorHandler: Retriable vs Fatal Hata Ayrimi (Debezium)

**Kaynak:** `debezium-connector-common/.../pipeline/ErrorHandler.java`

**Debezium Mekanizmasi:**
```java
// Retriable: gecici ag hatasi, yeniden denemek mantikli
RetriableException("... This connector will be restarted.")

// Fatal: veri kaybi riski, dur ve operatoru bekle
ConnectException("... This connector will be stopped.")

// maxRetries = -1 (RETRIES_UNLIMITED): sonsuz retry
// maxRetries =  0 (RETRIES_DISABLED): hic retry yok
// Her retry'da counter arttirilir, replacedErrorHandler ile sayac tasindi
```
`communicationExceptions()` override edilebilir: bazi exception turlerini
her zaman retriable sayar (IOException vs RuntimeException).

**Protokol-7'deki Gap:**
- Kestra Retry Bulgu T: kac kez dene, ne kadar bekle — bu da ne zaman dur karar verir
- Mevcut orchestrator hatada tek davranis: log yaz + devam et (ya da cok)
- "Bu hata retriable mi?" sorusunu her orchestrator kendisi cevapliyor

**Uygulanacak Adaptasyon:**
- `error_classifier.py`: `is_retriable(exception) -> bool`
  `RETRIABLE_EXCEPTIONS = (ConnectionError, TimeoutError, HTTPError_429, HTTPError_503)`
  `FATAL_EXCEPTIONS = (AuthError, DiskFullError, SchemaValidationError)`
- Retry Bulgu T ile entegre: `RetryPolicy` + `is_retriable()` birlikte kullanilir
- `pipeline_runs.last_error_type TEXT` kolonu: retriable/fatal ayrimi kayit

**Oncelik:** ORTA — Kestra Retry Bulgu T ile birlikte uygulanirsa tam retry sistemi olusur

---

### Celery, Colly, curl_cffi, FlareSolverr, crawl4ai, Docling, Debezium'dan Pass

| Repo | Alan | Gerekce |
|---|---|---|
| celery | AMQP/Redis broker mimarisi | Protokol-7 SQLite + WorkerPool kullaniyor |
| celery | chord/group distributed execution | Single-node tasarim |
| colly | Go runtime + goroutine modeli | Farkli dil/runtime |
| curl_cffi | WebSocket/HTTP2 push | Protokol-7 pull-based cekiyor |
| FlareSolverr | Flask REST API katmani | Protokol-7'nin kendi API'si var |
| crawl4ai | LLM tabanli extraction | Kapsam disi |
| crawl4ai | Browser pool yonetimi | Protokol-7'nin browser aktoru zaten var |
| docling | OCR/vision pipeline | GPU/model bagimliligi, kapsam disi |
| debezium | Kafka Connect entegrasyonu | Kafka kullanilmiyor |
| debezium | Incremental snapshot (WAL-based) | Cok karmasik, kapsam disi |

---

## 14. Guncellenmis Uygulama Oncelik Sirasi (Tum Repolar)

| # | Gorev | Bulgu | Kaynak | Oncelik | Bagimlilik |
|---|---|---|---|---|---|
| 1 | Heartbeat-based Stale Job Detection | A | Meltano | YUKSEK | pipeline_runs migration |
| 2 | Partial/Completed State Merge | B | Meltano | ORTA | Gorev 1 sonrasi |
| 3 | OffsetContext: Snapshot/Streaming Gecisi | AG | Debezium | ORTA | Gorev 2 ile birlikte |
| 4 | SSRF Korumasi + Retry-After | M | Trafilatura | ORTA | Bagimsiz |
| 5 | TLS Fingerprint Impersonation | AB | curl_cffi | ORTA | Bagimsiz |
| 6 | Cloudflare Challenge Detector | AC | FlareSolverr | ORTA | Bulgu AB ile birlikte |
| 7 | Adaptive RateLimiter (jitter + tedricen azalma) | AE | crawl4ai | ORTA | Bagimsiz |
| 8 | Retriable vs Fatal Hata Ayrimi | AH | Debezium | ORTA | Kestra Bulgu T ile birlikte |
| 9 | Retry Policy (constant/exp/random) | T | Kestra | ORTA | Bagimsiz |
| 10 | Simhash Fuzzy Deduplication | N | Trafilatura | ORTA | Bagimsiz |
| 11 | Subprocess ManagedService ABC | L | Selenium | ORTA | Gorev 1 ile birlikte |
| 12 | ManagedProcessControl IPC | W | MinerU | ORTA | Gorev 11 ile birlikte |
| 13 | RFC2616 HTTP Cache + ETag | F | Scrapy | ORTA | Bagimsiz |
| 14 | CloseSpider: Cok Eksenli Stop | I | Scrapy | ORTA | Gorev 1 ile birlikte |
| 15 | Cursor Optimistic Lock (ClockTag) | S | Qdrant | ORTA | Gorev 2 sonrasi |
| 16 | Drive Sync Async Thread Refactor | R | Qdrant | ORTA | Bagimsiz |
| 17 | DocumentParser ABC + ParseResult | V | MinerU | ORTA | Bagimsiz |
| 18 | FormatOption: Multi-format Extractor | AF | Docling | ORTA | Gorev 17 ile birlikte |
| 19 | DiskDupeFilter: SQLite Tekillik | H | Scrapy | ORTA | Bagimsiz |
| 20 | Pipeline TransactionThresholds | C | NiFi | DUSUK | Bagimsiz |
| 21 | AutoThrottle: Latency-Driven Delay | G | Scrapy | DUSUK | Bulgu C sonrasi |
| 22 | PipelineStats Sayac Altyapisi | J | Scrapy | DUSUK | Bagimsiz |
| 23 | Actor Telemetry (token/maliyet) | Q | Scrapegraph | DUSUK | Gorev 22 ile birlikte |
| 24 | Condition Polling (wait_until) | K | Selenium | DUSUK | Bagimsiz |
| 25 | Domain-Aware URL Store + LimitRule | O+AA | Trafilatura/Colly | DUSUK | Bagimsiz |
| 26 | Backfill Pencere Kontrolu | U | Kestra | DUSUK | Bagimsiz |
| 27 | CacheMode Enum Genisletme | AD | crawl4ai | DUSUK | Gorev 13 sonrasi |
| 28 | Extraction Tier Secimi | X | MinerU | DUSUK | Bagimsiz |
| 29 | Blueprint Shutdown Graph | Z | Celery | DUSUK | Bagimsiz |
| 30 | Step Input Expression Parser | P | Scrapegraph | DUSUK | Bagimsiz |
| 31 | Pydantic CLI Arg Validation | Y | Pydantic | DUSUK | Bagimsiz |
| 32 | WAL Checkpoint ADR (NiFi+Qdrant) | D+R | NiFi/Qdrant | ADR | Bagimsiz |
| 33 | Lineage Graph ADR | E | NiFi | ADR | Bagimsiz |

---

## 15. Ek Referans Kaynaklar (7 Yeni Repo)

- Celery bootsteps: `celery/celery/bootsteps.py`
- Celery canvas: `celery/celery/canvas.py`
- Celery schedules: `celery/celery/schedules.py`
- Colly LimitRule: `colly/http_backend.go`
- Colly Storage: `colly/storage/storage.go`
- curl_cffi fingerprints: `curl_cffi/curl_cffi/fingerprints.py`
- FlareSolverr service: `FlareSolverr/src/flaresolverr_service.py`
- crawl4ai cache_context: `crawl4ai/crawl4ai/cache_context.py`
- crawl4ai async_dispatcher: `crawl4ai/crawl4ai/async_dispatcher.py`
- Docling document_converter: `docling/docling/document_converter.py`
- Debezium OffsetContext: `debezium/debezium-connector-common/src/main/java/io/debezium/pipeline/spi/OffsetContext.java`
- Debezium EventDispatcher: `debezium/debezium-connector-common/src/main/java/io/debezium/pipeline/EventDispatcher.java`
- Debezium ErrorHandler: `debezium/debezium-connector-common/src/main/java/io/debezium/pipeline/ErrorHandler.java`
