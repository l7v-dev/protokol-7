# Ilham Analizi Uygulama Faz Plani

Kaynak: `docs/plans/meltano-nifi-ilham-analizi-plani.md`
16 repo — 33 bulgu (A–AH) — bu plan bunlari uygulanabilir fazlara boler.

Tarih: 2026-10-05
Durum: Faz 1-6 kod ve izole dogrulama tamamlandi; belgelenen uyarlamalar gecerlidir. Uretim migration/aktivasyon ve canli kabul kullaniciyla sonraki asamada; surecler kapali.
Pipeline sayisi: 4 (DOAJ, DergiPark, Aperta, HuggingFace); 2026-10-06 bakimda, uretim sureci yok

---

## Tasarim Ilkeleri

1. **Sifir kesinti:** Her faz aktif daemon'lari durdurmayi gerektirmeyen degisikliklerle baslar.
   Migration'lar `DEFAULT NULL` ile eklenir; daemon restart gerekiyorsa bunu son adima birakir.
2. **Serbestce geri alinan (reversible) adimlar once:** Her faz, oncesindeki faz bozulursa
   calismayi surdurecek sekilde tasarlanir.
3. **Tier kural uyumu:** Her degisiklik `rules/trust-tiers.md`'ye gore tier etiketi tasir.
   Yeni dosya = Tier 1, mevcut dosyada degisiklik = Tier 2.
4. **Verify zorunlu:** Her faz bitmeden `npm run verify` + ilgili Python testleri yesil olmali.
5. **Bulgu birlestirme:** Birbirini tamamlayan bulgular ayni faza alinir;
   bag olmayan dusuk oncelikli bulgular son faza ertelenir.

---

## Faz Ozeti

| Faz | Ad | Bulgular | Tier | Etkilenen Alan | Oncelik |
|---|---|---|---|---|---|
| **Faz 1** | Dayaniklilik Altyapisi | A, AG, B, S | 1-2 | `pipelines/shared/`, `pipeline_runs` schema | YUKSEK |
| **Faz 2** | HTTP Guvenligi ve Hata Direnci | M, AB, AC, AH, T | 1-2 | `pipelines/shared/`, DergiPark/Aperta downloader | ORTA |
| **Faz 3** | Icerik Kalitesi | N, H, V, AF | 1 | DergiPark extractor, shared dedup | ORTA |
| **Faz 4** | Surecler ve Yasam Dongusu | L, W, I, Z | 1-2 | `pipelines/shared/`, tum orchestrator'lar | ORTA |
| **Faz 5** | Performans ve Gozlemlenebilirlik | R, AE, J, Q, F, AD | 1 | drive_sync, shared rate limiter, stats | DUSUK |
| **Faz 6** | Uzun Vadeli ve ADR | D, E, U, O, AA, P, K, Z, X, Y | 1/ADR | Mimari notlar, kucuk yardimcilar | DUSUK |

---

## FAZ 1 — Dayaniklilik Altyapisi

### Uygulama uyumluluk notu (2026-10-05)

- Repoda Alembic altyapisi yok. Adim 1.1, `infra/migrations/0005-pipeline-heartbeat.sql`
  ve `pipelines/shared/heartbeat_migration.py` ile uygulanir; yeni bagimlilik eklenmez.
- Uygulayici mevcut katalog ve `run_id` kolonu gerektirir; iki ALTER tek transaction'da
  calisir. Tekrar uygulama mevcut heartbeat kolonlarini korur, uyumsuz tipleri reddeder.
- Corpus `pipeline_runs` durumlari buyuk harflidir ve `running/stale` kabul etmez;
  yerel kaynak ledger'lari ortak `pipeline_runs` tablosu olusturmaz.
  Adim 1.3'te durum sozlesmesi belirlenmeden `status='stale'` yazilamaz.
- Adim 1.1'in alti testi gecti. Canli migration, backup ve katalog kopyasinda prova
  tamamlaninca aktive edilir.
- Salt okunur envanter: `data/catalog.sqlite`, DOAJ/DergiPark/Aperta kaynak
  kataloglari ve `data/huggingface/catalog.sqlite` icinde `pipeline_runs` yok.
  Sadece ALTER migration'i canliya uygulamak yeterli degildir; once daemon run
  kaydi sahipligi ve yasam dongusu mevcut `pipeline_executions` ile eslestirilmelidir.
- Adim 1.2 `heartbeat_writer.py` tamamlandi: ilk ping senkron, periyodik thread,
  stop/join ve son ping, context manager, opsiyonel ping. Arka plan hatasi
  `error` alaninda ve sonraki ping/stop cagrilarinda gorunur. 10 writer testi gecti.
  Daemon entegrasyonu ve canli heartbeat uretimi henuz uygulanmadi.
- `pipeline_executions` yalniz terminal succeeded/failed sonuclari saklar;
  Python daemon liveness veya cursor kaydi yerine kullanilamaz. Corpus run
  durumlari INITIALIZING/INGESTING/CLEANING/PACKING/VERIFYING aktiftir.
- Adim 1.3 Python detector tamamlandi: NULL heartbeat izlenmez, terminal kayitlar
  atlanir, stale esigi kesin olarak asilmali. `mark_stale` tek UPDATE icinde esigi
  yeniden denetler; desteklenen FAILED durumu, completed_at ve Heartbeat expired
  nedeni yazilir. running/stale/ended_at ornekleri mevcut corpus sozlesmesine uyarlandi.
- Adim 1.3 REST health/reaper entegrasyonu ve daemon run uretimi bekliyor.
  Aktif daemon'lar corpus run tablosu uretmedigi icin detector canlida aktive edilmedi.

### Entegrasyon ve bakim guncellemesi (2026-10-06)

Onceki bekleme notlari bu kayitla guncellenir: dort kaynak icin `monitor_daemon`
entegrasyonu, `DaemonRun` lifecycle katalogu, REST health ve WorkerPool reaper
uygulandi. Kaynak kataloglari ve terminal `pipeline_executions` sozlesmesi korunur.
`PROTOKOL_DAEMON_RUN_DB` bosken entegrasyon kapali; ayni ayri SQLite yolunun
daemon/API/worker'a verilmesi izlemeyi etkinlestirir. Sema kimligi olmayan kaynak
kataloglari reddedilir. NULL heartbeat eski run'i stale yapmaz; terminal run'e
heartbeat yazilamaz. Health en yeni pipeline run'ini dikkate alir, eski stale
gecmisi yeni run'i degraded yapmaz.

Kullanici sistem restart'ini bildirdi. /proc envanterinde pipeline sureci yok;
veri ve PID dosyalari silinmedi. Uretim surecleri tum isler ve dogrulama bitene
kadar baslatilmayacak. Bu entegrasyon gecici test kataloglarinda dogrulandi;
uretim kaynaklarina ag istegi veya yeniden baslatma yapilmadi.

### State ve cursor uygulamasi (2026-10-06)

Adim 1.4-1.5 kodu tamamlandi. `0006-pipeline-state.sql` run state_type,
state_payload ve cursor_version kolonlarini atomik ekler. `pipeline_states`
stable stream key, owner_run_id ve versiyonla authoritative checkpoint saklar;
ayni transaction run tablosundaki kaniti da gunceller. Her yeni run UUID'sine
ayri cursor baglamak restart ve paralel kaynak yazicilarini fence edemedigi
icin stream state eklenmistir. Monitor katalogu icin migration DaemonRun
baslangicinda uygulanir; mevcut corpus semasi da test edilmistir.

`OffsetContext(db_path, stream_id)` load_latest(run_id), pre_snapshot_start,
set_partial_state, advance_streaming ve post_snapshot_completion saglar.
Yazma metodlari expected_version ister; donen kayit state_type, effective
state_payload, cursor_version ve snapshot_completed alanlarini icerir.
Partial JSON object'ler recursive merge edilir; array/scalar/null replace edilir.
Snapshot completion partial'i completed baseline'a tasir. Streaming partial
baseline'i silmez. Cursor state_payload icinde tutulur; ayri cursor_value
kolonu ile ayni bilgi iki kez saklanmaz.

Aktif owner'in checkpoint'i yeni run'e verilemez. Heartbeat suresi gecmis owner
ayni claim transaction'inda FAILED yapilir; yeni run son committed state'i
devralir. Kapanmis run tekrar state yazamaz. Version CAS ve run evidence mirror
bir transaction'dadir; mirror hatasi cursor'u da rollback eder.

Kaynak restart sinirlari:
- DOAJ: checkpoint sadece shard kapandiktan sonra sayfanin baslangic token'ini
  saklar. Partial sayfa replay edilebilir; bu at-least-once davranistir.
- Aperta: token sadece SQLite'a indexed veri yazildiktan sonra ilerler; resume
  once indexed kayitlar paketlenir. Degisen kayit tekrar indexed olur.
- DergiPark fulltext: scalar cursor concurrency icin kullanilmaz; pending work
  queue authoritative'dir. Kapanmamis output referanslari startup'ta pending'e
  doner, state receipt ancak final output'lar kapandiktan sonra yazilir.
- HF: revision/inventory scope'u ayrilir; remote_verified catalogu authoritative'dir.
  State hatasi verified durumu geri alamaz; limitli run snapshot complete sayilmaz.

Namespace secimi mevcut yetim Parquet/TAR dosyalarinin part indexlerini atlar;
bu dosyalar silinmez veya ezilmez. Yeni tarih bazli API delta/CDC sorgulari bu
degisiklikte etkinlestirilmedi; snapshot/streaming state protokolu uygulanmistir.
107 Python ve 15 TS testi, typecheck ve verify basarili. Uretim backup/activation
ve canli restart kabul kriterleri bakim bitimine kadar bekler; Faz 1'in uretim
aktivasyonu tamamlanmis kabul edilmez.

**Hedef:** Calisan 4 daemon'in cokme tespitini otomatiklestir;
restart sonrasi cursor'in duzgun geri yuklenmesini garantile.

**Neden once:** Canlida 4 daemon var, cokme tespiti elle yapiliyor. Bu en yuksek operasyonel risk.

### Adim 1.1 — pipeline_runs Heartbeat Kolonlari (Bulgu A — Meltano)

```
Tier: 2  |  Dosya: var olan tablo — migration
Kapsam: SQL migration + test
Beklenti: mevcut daemon'lar restart olmadan calisir (DEFAULT NULL)
```

Yapilacak:
- Yeni Alembic migration: `pipeline_runs` tablosuna iki kolon
  - `last_heartbeat_at DATETIME DEFAULT NULL`
  - `heartbeat_interval_seconds INTEGER DEFAULT 60`
- Migration backward-compatible: `DEFAULT NULL` ile eklenir,
  daemon'lar yeniden baslatilana kadar heartbeat yazmaz
- `npm run verify` + migration test

Kabul kriteri:
- Migration uygulanir, tablo mevcut kayitlari bozulmaz
- `last_heartbeat_at IS NULL` olan satirlar mevcut calisan daemon'lar icin beklenir

---

### Adim 1.2 — heartbeat_writer.py Shared Modulu (Bulgu A — Meltano)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/heartbeat_writer.py
Kapsam: Python, yeni dosya
```

Yapilacak:
- `HeartbeatWriter(db_path, run_id, interval_s=60)` sinifi
- `start()`: arka plan thread, her `interval_s` saniyede
  `UPDATE pipeline_runs SET last_heartbeat_at = ? WHERE run_id = ?`
- `stop()`: thread'i durdur, son heartbeat'i yaz
- `__enter__` / `__exit__` context manager
- Unit test: mock SQLite + thread join testi

Entegrasyon:
```python
# Her orchestrator main loop'unda:
with HeartbeatWriter(db_path=ledger.db_path, run_id=run_id) as hb:
    for batch in stream_batches():
        process(batch)
        hb.ping()  # opsiyonel: her batch'de de guncelle
```

---

### Adim 1.3 — Stale Detector (Bulgu A — Meltano)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/stale_detector.py
Kapsam: Python
```

Yapilacak:
- `StalePipelineDetector(db_path)` sinifi
- `get_stale_runs(grace_multiplier=3) -> list[dict]`:
  `WHERE last_heartbeat_at IS NOT NULL`
  `AND last_heartbeat_at + interval_s * grace_multiplier < NOW()`
  `AND status = 'running'`
- `mark_stale(run_id)`: `UPDATE ... SET status='stale', ended_at=NOW()`
- TS tarafi `/api/v1/health` endpoint'ine stale_runs listesi eklenir
- Mevcut `WorkerPool` reaper'ina entegre edilir

Test: stale threshold'u mock timestamp ile birim testi

---

### Adim 1.4 — OffsetContext + State Merge (Bulgu B — Meltano, Bulgu AG — Debezium)

```
Tier: 2  |  Dosyalar: yeni + mevcut ledger'a eklenti
```

Yapilacak:
- `pipeline_runs` tablosuna iki kolon:
  - `state_type TEXT CHECK(IN ('partial', 'completed')) DEFAULT NULL`
  - `state_payload JSON DEFAULT NULL`
- `offset_context.py` yeni modulu:
  ```python
  class OffsetContext:
      def pre_snapshot_start(self, run_id): ...    # state_type = 'partial'
      def post_snapshot_completion(self, run_id): ... # state_type = 'completed'
      def advance_streaming(self, run_id, cursor): ... # partial guncelle
      def load_latest(self, run_id) -> dict | None: ...
  ```
- `state_merge.py`:
  ```python
  def merge_partial(existing_completed: dict, new_partial: dict) -> dict:
      # Meltano merge() semantigi
  ```
- Her orchestrator `OffsetContext` ile restart sonrasi cursor yukler:
  ```python
  ctx = OffsetContext(ledger.db_path)
  state = ctx.load_latest(run_id)  # tamamlanmis veya partial
  cursor = state['cursor'] if state else None
  ```
- 2 Python integration testi: crash simulation + restart from partial

---

### Adim 1.5 — Cursor Optimistic Lock (Bulgu S — Qdrant)

```
Tier: 2  |  Dosya: mevcut ledger migration
```

Yapilacak:
- `pipeline_runs` tablosuna `cursor_version INTEGER DEFAULT 0` kolonu
- `offset_context.py` icinde cursor guncelleme:
  ```python
  def advance_streaming(self, run_id, cursor, expected_version):
      rows = conn.execute(
          "UPDATE pipeline_runs SET cursor_value=?, cursor_version=cursor_version+1 "
          "WHERE run_id=? AND cursor_version=?",
          (cursor, run_id, expected_version)
      ).rowcount
      if rows == 0:
          raise StaleWriteError("concurrent cursor update detected")
  ```
- Test: paralel iki guncelleme, birinin StaleWriteError almasi beklenir

---

**Faz 1 Dogrulama:**
- `npm run verify` yesil
- `python -m pytest pipelines/shared/test_heartbeat_writer.py`
- `python -m pytest pipelines/shared/test_offset_context.py`
- Migration uygulanmis, canli daemon'lar hala ayni PID'le calisiyor (restart yok)

---

## FAZ 2 — HTTP Guvenligi ve Hata Direnci

**Hedef:** DergiPark/Aperta downloader'larini SSRF'e karsi koru;
Cloudflare engelini asacak TLS impersonation altyapisi kur;
retriable vs fatal hata ayrimi + retry politikasi ekle.

**Onkosul:** Faz 1 tamamlanmis olmali.

### Adim 2.1 — safe_http.py: SSRF Korumasi + Retry-After (Bulgu M — Trafilatura)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/safe_http.py
```

Yapilacak:
- `_vet_peer(host)`: sock.getpeername() sonrasi non-global IP reddet
- `SafePoolManager(urllib3.PoolManager)`: her baglantida `_vet_peer` cagirir
- `retry_after_backoff(response, max_backoff=30)`:
  `Retry-After` header varsa o kadar bekle, yoksa eksponansiyel backoff
- `SSRF_PROTECTION = os.environ.get('SSRF_PROTECTION', 'true') != 'false'`
- `FORCE_STATUS = frozenset({429, 499, 500, 502, 503, 504, 520-530})`
- Mevcut DergiPark `downloader.py` icindeki `requests.get` cagrilari
  `SafePoolManager` uzerinden yapilacak sekilde guncellenir

Test: mock socket ile non-global IP reddi testi

---

### Adim 2.2 — error_classifier.py: Retriable vs Fatal (Bulgu AH — Debezium)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/error_classifier.py
```

Yapilacak:
```python
RETRIABLE_EXCEPTIONS = (ConnectionError, TimeoutError)
RETRIABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
FATAL_EXCEPTIONS = (PermissionError, ValueError)  # schema hatasi vb.

def is_retriable(exc: Exception, status_code: int | None = None) -> bool: ...
def classify(exc: Exception) -> Literal['retriable', 'fatal', 'unknown']: ...
```

---

### Adim 2.3 — retry_policy.py (Bulgu T — Kestra)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/retry_policy.py
```

Yapilacak:
```python
@dataclass
class RetryPolicy:
    type: Literal['constant', 'exponential', 'random'] = 'exponential'
    interval_s: float = 5.0
    max_interval_s: float = 300.0
    delay_factor: float = 2.0
    max_attempts: int = 5
    max_duration_s: float | None = None  # toplam sure siniri

    def next_retry_seconds(self, attempt: int, last_ts: float) -> float:
        # Kestra Exponential.nextRetryDate() mantigi, overflow-safe
        ...
```

`RetryExecutor` context manager:
```python
with RetryExecutor(policy, error_classifier) as retry:
    for attempt in retry.attempts():
        try:
            result = do_work()
            retry.success()
            break
        except Exception as exc:
            retry.handle(exc)  # retriable -> bekle ve devam, fatal -> re-raise
```

Entegrasyon:
- DergiPark `downloader.py`: HTTP isteklerini `RetryExecutor` ile sar
- DOAJ `orchestrator.py`: OAI-PMH cagrilarini `RetryExecutor` ile sar
- `pipeline_runs.retry_config JSON` kolonu: hangi politikayla calisildigi kayit

Test: 3 tip policy icin `next_retry_seconds` testi + mock HTTPError ile RetryExecutor testi

---

### Adim 2.4 — TLS Impersonation Backend (Bulgu AB — curl_cffi)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/curl_downloader.py
Yeni bagimllik: curl_cffi (mevcut requirements'a ekle, Tier 1 onayi gerekir)
```

Yapilacak:
- `CurlDownloader(impersonate='chrome120')` sinifi
- `get(url, headers, timeout) -> Response`
- `safe_http.py` ile ayni `Response` interface'ini implemente eder
  (drop-in replacement olarak kullanilabilir)
- CLI flag: `--use-impersonation` (`False` varsayilan)

Entegrasyon:
- DergiPark `fulltext_runner.py`: `--use-impersonation` flag'i ile
  `CurlDownloader` secilir
- Cloudflare 429/403 alinca otomatik `CurlDownloader`'a gec (step-up)

---

### Adim 2.5 — Cloudflare Detector (Bulgu AC — FlareSolverr)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/cloudflare_detector.py
```

Yapilacak:
```python
CHALLENGE_TITLES = ['Just a moment...', 'DDoS-Guard']
CHALLENGE_SELECTORS = [
    '#cf-challenge-running', '.ray_id', '.attack-box',
    '#cf-please-wait', '#challenge-spinner',
    '#turnstile-wrapper', '.lds-ring',
]
TURNSTILE_SELECTORS = ["input[name='cf-turnstile-response']"]

def is_cloudflare_challenge(html: str) -> bool: ...
def challenge_type(html: str) -> Literal['js', 'turnstile', 'access_denied', None]: ...
```

Entegrasyon:
- DergiPark `downloader.py`: her yanit `is_cloudflare_challenge()` ile kontrol edilir
- Challenge tespit edilirse `CurlDownloader`'a step-up (Adim 2.4)

---

**Faz 2 Dogrulama:**
- `npm run verify` yesil
- SSRF: mock non-global IP reddi
- RetryPolicy: 3 tip policy birimleri
- DergiPark downloader: dry-run ile 5 URL cekilip SSRF/retry akisi test edilir
- Canli daemon'lar hala calisiyor

---

## FAZ 3 — Icerik Kalitesi

**Hedef:** DergiPark PDF extraction'i kismi yazi riskinden koru;
duplikat icerik tespiti ekle; multi-format dokuman destegine zemin hazirla.

### Adim 3.1 — DocumentParser ABC (Bulgu V — MinerU)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/document_parser.py
```

Yapilacak:
```python
class ParseResult:
    raw_text: str
    metadata: dict
    source_path: str
    page_count: int | None

    def save(self, writer: DataWriter) -> None:
        # Once validate, sonra yaz — kismi cikti riski yok
        validated = self._validate()
        writer.write_string("text.md", validated.raw_text)
        writer.write_string("meta.json", json.dumps(validated.metadata))

class DocumentParser(ABC):
    @abstractmethod
    def parse(self, path, *, page_range="") -> ParseResult: ...
    async def parse_async(self, path, **kw) -> ParseResult:
        return await asyncio.to_thread(self.parse, path, **kw)
    def parse_batch(self, paths, **kw) -> list[ParseResult]:
        return [self.parse(p, **kw) for p in paths]
    async def parse_batch_async(self, paths, **kw) -> list[ParseResult]:
        return await asyncio.gather(*(self.parse_async(p, **kw) for p in paths))
    def close(self): ...
    def __enter__(self): return self
    def __exit__(self, *args): self.close()
```

DergiPark PDF extractor bu ABC'yi implemente eder:
- `PyMuPDFParser(DocumentParser)` sinifi
- Mevcut `pdf_extractor.py` mantigi icine alir
- `save()` garantisi: exception olursa yarim dosya kalmaz

---

### Adim 3.2 — SimhashDedup (Bulgu N — Trafilatura)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/content_dedup.py
```

Yapilacak:
```python
class Simhash:
    # Charikar Simhash — Trafilatura'dan adapte
    def __init__(self, text: str, length: int = 64): ...
    def similarity(self, other: 'Simhash') -> float: ...  # Hamming

class LRUSimhashCache:
    # thread-safe OrderedDict + RLock
    def is_near_duplicate(self, text: str, threshold=0.9) -> bool: ...

def content_fingerprint(text: str) -> str:  # hex str
```

Entegrasyon:
- DergiPark `fulltext_runner.py`: cikarilan metin `is_near_duplicate()` ile kontrol,
  duplikat ise `pdf_status = 'duplicate'` olarak isaretlenir
- `provenance_events` tablosuna `content_simhash TEXT` kolonu eklenir (migration)

---

### Adim 3.3 — DiskDupeFilter: SQLite URL Tekillik (Bulgu H — Scrapy)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/url_dedup.py
```

Yapilacak:
```python
class DiskUrlDedup:
    """SQLite WAL + WITHOUT ROWID ile restart-safe URL tekillik."""
    def __init__(self, db_path: str):
        # PRAGMA journal_mode=WAL; WITHOUT ROWID; fingerprint BLOB PK
    def is_seen(self, url: str) -> bool: ...
    def mark_seen(self, url: str) -> None: ...
    def close(self): ...
```

HuggingFace orchestrator: restart sonrasi indirilmis dosyalar tekrar indirilmez.

---

**Faz 3 Dogrulama:**
- `npm run verify` yesil
- `PyMuPDFParser.save()` exception testi: yari yazilmis dosya kalmiyor mu?
- `SimhashDedup`: ayni metin + benzer metin + farkli metin testi
- `DiskUrlDedup`: restart simulation testi

---

## FAZ 4 — Surecler ve Yasam Dongusu

**Hedef:** Daemon'lari guvenli baslatma/durdurma standartina kavustur;
orphan process sorununu coz; cok eksenli sonlandirma kosullari ekle.

### Adim 4.1 — ManagedService ABC (Bulgu L — Selenium)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/managed_service.py
```

Yapilacak:
```python
class ManagedService(ABC):
    graceful_shutdown_timeout_s: float = 60.0

    @abstractmethod
    def command(self) -> list[str]: ...
    def is_connectable(self) -> bool: ...  # HTTP /health veya PID dosyasi kontrol

    def start(self) -> None:
        # Exponential backoff readiness probe (Selenium pattern)
        self._proc = subprocess.Popen(self.command(), ...)
        for count in range(70):
            if self.is_connectable(): break
            time.sleep(min(0.01 + 0.05 * count, 0.5))
        else:
            raise ServiceStartError(...)

    def stop(self) -> None:
        # SIGTERM -> wait(60s) -> SIGKILL
        self._proc.terminate()
        try: self._proc.wait(self.graceful_shutdown_timeout_s)
        except subprocess.TimeoutExpired: self._proc.kill()
```

---

### Adim 4.2 — ManagedProcessControl IPC (Bulgu W — MinerU)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/managed_process_control.py
```

MinerU'nun `process_control.py` modulunu dogrudan port et:
- `ManagedProcessControl.create()`: unix socket + HMAC authkey
- `ManagedProcessControlWatcher.from_environment(on_shutdown)`: cocuk taraf
- `child_env()`: env var uzerinden kanal bilgisi

Entegrasyon:
- Her orchestrator icin `ManagedService` alt sinifi + `ManagedProcessControlWatcher`
- `orchestrator.py` main entrypoint:
  ```python
  watcher = ManagedProcessControlWatcher.from_environment(on_shutdown=graceful_exit)
  if watcher: watcher.start()
  ```

---

### Adim 4.3 — pipeline_stopper.py: Cok Eksenli Stop (Bulgu I — Scrapy)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/pipeline_stopper.py
```

Yapilacak:
```python
@dataclass
class StopConditions:
    timeout_s: float | None = None        # N saniye sonra dur
    max_records: int | None = None        # N kayit sonra dur
    max_errors: int | None = None         # N hata sonra dur
    idle_timeout_s: float | None = None   # N saniyedir yeni kayit yok

class PipelineStopper:
    def should_stop(self) -> tuple[bool, str | None]:
        # (dur mu, neden)
    def record_processed(self): ...
    def record_error(self): ...
    def record_item(self): ...
```

Entegrasyon:
- Her orchestrator'in `while True:` ana dongusuna `stopper.should_stop()` eklenir
- `pipeline_runs.stop_reason TEXT` kolonu

---

**Faz 4 Dogrulama:**
- `npm run verify` yesil
- `ManagedService.stop()`: SIGTERM -> timeout -> SIGKILL akisi testi
- `PipelineStopper`: her stop kosulunu tetikleyen birer test
- Orphan process: orchestrator kill edilince watcher `on_shutdown` cagirir mi testi

---

## FAZ 5 — Performans ve Gozlemlenebilirlik

**Hedef:** Drive upload'u ana donguden ayir; adaptif rate limiter ekle;
ilk calistirilabilir stats altyapisi kur.

### Adim 5.1 — Drive Sync Async Thread (Bulgu R — Qdrant)

```
Tier: 2  |  Dosya: mevcut drive_sync_base.py guncelleme
```

Yapilacak:
- `BaseDriveSync.upload_async(path, folder_id)`:
  `threading.Thread` ile upload, ana dongu bloklanmaz
- Upload kuyrugu: `queue.Queue(maxsize=4)` — en fazla 4 bekleyen upload
- Upload tamamlaninca `shard.status = 'uploaded'` guncellenir
- Hata durumunda `shard.status = 'failed'`, ana dongu devam eder

Mevcut kullanim:
```python
# Oncesi:
drive_sync.upload(shard_path, folder_id)  # bloklayan
# Sonrasi:
drive_sync.upload_async(shard_path, folder_id)  # non-bloklayan
```

---

### Adim 5.2 — adaptive_rate_limiter.py (Bulgu AE — crawl4ai)

```
Tier: 2  |  Dosya: mevcut ThreadSafeRateLimiter guncelleme veya yeni subclass
```

Yapilacak:
- `update_delay(url, status_code)`:
  - 429/503: `delay = min(delay * 2 * jitter, max_delay)` (jitter: 0.75–1.25)
  - Basari: `delay = max(base_delay, delay * 0.75)` (tedricen azalt)
- Domain bazli durum: `DomainState(current_delay, fail_count, last_request_time)`
- Mevcut `global_cooldown` mekanizmasi `update_delay` ile degistirilir (backward compatible)

---

### Adim 5.3 — pipeline_stats.py (Bulgu J — Scrapy)

```
Tier: 1  |  Dosya: yeni — pipelines/shared/pipeline_stats.py
```

Yapilacak:
```python
class PipelineStats:
    def inc(self, key: str, count: int = 1): ...
    def max(self, key: str, value: float): ...
    def min(self, key: str, value: float): ...
    def set(self, key: str, value: Any): ...
    def dump(self) -> dict: ...   # kapanis loguna yaz

class DummyStats(PipelineStats):
    # Test ortaminda sifir maliyetli no-op
```

Her orchestrator kapanis oncesi `stats.dump()` cagirarak
`pipeline_runs.stats_json` kolonuna JSON yazar.

---

**Faz 5 Dogrulama:**
- `npm run verify` yesil
- Drive upload: async test — main loop mock upload sirasinda devam ediyor mu?
- `AdaptiveRateLimiter`: 3 arka arkaya 429 sonrasi delay artisini dogrula
- `PipelineStats`: temel inc/max/min testi

---

## FAZ 6 — Uzun Vadeli ve ADR Belgeleri

**Hedef:** Dusuk oncelikli bulgulari kucuk yardimcilar olarak ekle;
mimari kararlari ADR olarak belgele.

### Adim 6.1 — ADR: WAL Checkpoint (Bulgu D — NiFi, Bulgu R — Qdrant)

Dosya: `docs/plans/adr-wal-checkpoint.md`

Icerik:
- NiFi WAL + Qdrant segment lifecycle referanslari
- Protokol-7 SQLite WAL durumu: `PRAGMA journal_mode=WAL` zaten var
- `prefix_truncate` / `retain_closed` modeli: ne zaman uygulanir
- Karar: Mevcut SQLite WAL korunur; kapasite icin olculmemis kayit siniri kullanilmaz. WAL boyutu/latency/checkpoint olcumu sonraki kapasite kararinin onkosuludur.

### Adim 6.2 — ADR: Lineage Graph (Bulgu E — NiFi)

Dosya: `docs/plans/adr-lineage-graph.md`

Icerik:
- Mevcut document_provenance/document_occurrences/document_occurrence_runs/pipeline_run_manifests ile gap analizi; provenance_events tablosu yoktur.
- Kosullu gelecek hedef: cok adimli artifact donusum ihtiyaci kanitlanirsa provenance_nodes/provenance_edges; bu fazda migration yok.
- Onkosul: Faz 1 OffsetContext tamamlanmis olmali

### Adim 6.3 — Kucuk Yardimcilar (Birer dosya, Tier 1)

| Bulgu | Dosya | Konu |
|---|---|---|
| K — Selenium | `pipelines/shared/condition_wait.py` | `wait_until(fn, timeout, poll, ignored)` |
| O+AA — Trafilatura/Colly | `pipelines/shared/domain_rate_limiter.py` | `DomainLimitRule` + URL store |
| X — MinerU | `pipelines/shared/extraction_tier.py` | `ExtractionTier`, `select_tier(size, budget)` |
| Y — Pydantic | Mevcut orchestrator CLI'lara Pydantic BaseModel | Argparse validation guclendir |
| U — Kestra | `pipeline_runs` backfill kolonlari | `backfill_start/end/current` |
| Z — Celery | `pipelines/shared/shutdown_coordinator.py` | Bagimlilik sirali kapanma |
| P — Scrapegraph | `pipelines/shared/step_context.py` | Input expression parser |
| AD — crawl4ai | `CacheMode` enum (Bulgu F ile birlikte) | 5-mod cache |
| AF — Docling | `pipelines/shared/format_extractor.py` | Format → pipeline mapping |
| Q — Scrapegraph | `actor_telemetry.py` | Token/maliyet izleme |

---

**Faz 6 Dogrulama:**
- ADR belgeleri review edilmis ve `docs/plans/` altinda kayitli
- Her kucuk yardimci: en az 2 unit test
- `npm run verify` yesil

---

## Uygulama Sirasi Ozeti

```
FAZ 1  →  FAZ 2  →  FAZ 3
  ↓           ↓
FAZ 4  →  FAZ 5  →  FAZ 6
```

Faz 1-2 seri uygulanmali (FAZ 2 FAZ 1'e bagimli).
Faz 3, 4, 5 paralel yurutulabilir (birbirine bagimliligi yok).
Faz 6 her zaman son.

---

## Daemon Restart Penceresi

Asagidaki adimlar aktif daemon'lari yeniden baslatmayi gerektirir.
Binance asset ortasinda zorla durdurulmamali (TASKS.md kurali):

| Adim | Restart Gereken Daemon | Guvenli Zaman |
|---|---|---|
| 1.2 HeartbeatWriter entegrasyon | Tum (DOAJ, DergiPark, Aperta, HF) | Shard tamamlaninca |
| 1.4 OffsetContext entegrasyon | Tum | Shard tamamlaninca |
| 2.1 safe_http entegrasyon | DergiPark, Aperta | Rate limit penceresi |
| 4.1/4.2 ManagedService/IPC | Tum | Planli bakiim penceresi |

Her restart oncesinde:
1. `tail -f logs/<pipeline>.log` ile mevcut shard tamamlanmasini bekle
2. PID dosyasini kontrol et: `cat data/<pipeline>/runner.pid`
3. `kill -TERM <pid>` ile graceful shutdown gonder
4. Yeni kodu ile yeniden baslat

---

## Her Fazin Kabul Kriterleri (Ozet)

| Faz | Kriter |
|---|---|
| Faz 1 | Migration uygulanmis, heartbeat yaziliyor, stale tespiti calisiyor, cursor merge deterministic |
| Faz 2 | SSRF testi gecti, DergiPark 429 sonrasi retry-backoff calistirildi, TLS impersonation dry-run |
| Faz 3 | PDF save() kismi yazi yok, simhash duplikat tespit ediyor, URL dedup restart sonrasi tekrar indirmez |
| Faz 4 | SIGTERM → 60s → SIGKILL akisi calistirildi, orphan watcher test gecti, multi-condition stop test gecti |
| Faz 5 | Drive upload main loop bloklamiyor, adaptive delay 3x429 sonrasi artiyor, stats dump ciktisi var |
| Faz 6 | ADR belgeleri mevcut, kucuk yardimcilar en az 2 test ile yesildi |

Tum fazlar: `npm run verify` + `rules/failure-checklist.md` taramasi zorunlu.

## Faz 3 uygulama uyarlamalari (2026-10-06)

Kod ve izole testler tamamlandi; canli activation yapilmadi. Parser save iki dosyayi sirayla gorunur hedefe yazmak yerine, gecici dizinde tamamlayip yeni hedef dizine atomik rename ile yayinlar. Process icinde exception halinde staging temizlenir; ani process/power kaybi sonrasinda hidden staging recovery bu adimin garantisi degildir. Existing hedef ezilmez; cooperating writer'lar publish lock ile siralanir.

SimHash NFKC/word-trigram/FNV-1a64 surumuyle hesaplanir. Benzerlik sadece opsiyonel flag'dir, identity merge veya artifact drop yapmaz. Kapsam son 1000 run-local kayit, varsayilan flag kapali. Planin provenance_events tablosu mevcut repo migrationlarinda yok; fingerprint ve algoritma surumu mevcut DergiPark source ledger'a eklenir. Yeni uydurma event modeli kurulmaz. Merkezi provenance write entegrasyonu sonraki mevcut producer gecisinde ele alinacak.

HF remote_verified dosya defteri restart/skip otoritesi olarak korunur. DiskUrlDedup WAL/WITHOUT ROWID sidecar'i URL receipt tutar; receipt tek basina indirme atlatmaz, revision URL'si aynen hash'lenir. Receipt commit'i dogrulanmis durumdan sonra gelir; hata remote_verified durumunu downgraded yapmaz. Eski verified URL'ler her run basinda receipt'e alinabilir.

Dogrulama: 8 shared kalite/parser/URL testi, 24 DergiPark, 13 HF testi; verify ve diff kontrolu gecti. Siradaki Faz 4.

## Faz 4 uygulama uyarlamalari (2026-10-06)

Kod ve izole testler tamamlandi. ManagedService yalniz Popen ile sahip oldugu child'i sonlandirir; startup hatasinda child cleanup yapilir. PipelineService ortak command adapter'i bes kapsam kaynagi icindir; ayni davranisli bes bos subclass uretilmez. Readiness authenticated watcher handshake'idir, kaynak API/DB hazirligi kabul testi degildir.

MinerU dosyasi port edilmedi: Unix socketpair, inherited FD ve rastgele HMAC key ile sabit 34-byte frame protokolu kullanildi. Pickle veya harici listener yok. Parent kanalinin kapanmasi veya heartbeat eksikligi child shutdown istegi olusturur. Runtime metadata/fulltext/HF kaynaklarinda mevcut interrupt/finalization yolunu kullanir. Aperta-assets parent kaybinda mevcut dosyayi tamamlayip next-file guard'da kapanir. Unmanaged source calistirma da runtime stopper kullanir; watcher yalniz inherited kontrol ortaminda etkinlesir.

PROTOKOL_STOP_TIMEOUT_SECONDS, PROTOKOL_STOP_IDLE_SECONDS, PROTOKOL_STOP_MAX_RECORDS, PROTOKOL_STOP_MAX_ERRORS opsiyoneldir. Guard scheduling/page/file/batch sinirlarindadir; in-flight network isine hard deadline uygulamaz. DergiPark mevcut submitted batch'i drain eder, Aperta metadata page tamamlanir; count siniri bu nedenle batch/page kadar asilabilir. Dedicated monitoring stop_reason nullable kolonunu acilista ekler; canli migration yapilmadi.

25 shared hedef ve 56 kaynak testi, py_compile, verify ve diff kontrolu basarili. Parent SIGKILL, wrong HMAC, readiness failure cleanup, TERM timeout KILL/wait, signal handler restore, partial cursor stop reason, asset file-boundary closure test edildi. Uretim start yapilmadi. Faz 5 siradadir.

## Faz 5 uygulama uyarlamalari (2026-10-06)

Kod ve izole dogrulama tamamlandi. BaseDriveSync.upload_async tek worker ve dort bekleyen is ile bounded queue kullanir. Worker kendi Google transport'unu olusturur; main transport threadler arasinda paylasilmaz. Upload MD5 verification, callback/catalog commit ve local eviction sirasiyla calisir. Callback veya upload hatasi local dosyayi korur; kaynak callback'i shard failed receipt'i yazar. Kuyruk dolunca backpressure uygulanir; kapanista queue drain/join gerekir. Pending queue kalici degildir, kapali shard ve katalog kaydi restart authority'sidir.

DOAJ/Aperta metadata ve DergiPark fulltext/archive icin --async-upload default false. HF buyuk dosya verification/local disk reserve dongusu ve Aperta raw assets su an synchronous kalir. Worker drain Google transport request/retry surelerini bekler; control service grace deadline sonrasi process kill edebilir. Byte-size sinirli queue veya cloud hard deadline uygulanmis kabul edilmez.

DergiPark AdaptiveRateLimiter monotonic/domain pacing, 429/503 jitter delay artisi ve success floor uygular. Legacy cooldown API korunur. Stats thread-safe JSON snapshot'tir; stopper record/error sayaclari ve upload sonuc/miktarlari eklenir. Monitoring stats_json nullable kolonunu acilista ekler; live catalog migration'i yapilmadi. DummyStats no-op destegi vardir.

Dry-run artik local purge yapmaz; bu nedenle onceki iki dry-run silme beklentisi korunmus dosyayi dogrulayacak sekilde guncellendi. Remote checksum/id eksikse upload verified sayilmaz ve purge yapilmaz. 36 shared hedef + 56 kaynak Python ve 15 TS testi gecti. Verify/py_compile/diff kontrolu basarili. Faz 6 siradadir.

## Faz 6 uygulama uyarlamalari (2026-10-06)

Iki ADR ve on yardimci kapsam tamamlandi. CLI validation bes giris noktasinda resource construction oncesindedir; backfill nullable monitoring metadata'sidir, source cursor veya date-based fetch degistirmez. Diger yardimcilar bagimsiz API olarak sunulur; OCR/FULL/cache/LLM backend veya runtime entegrasyonu yapilmis sayilmaz. Pydantic 2.13.5 requirements-validation.txt ile sabitlendi.

22 Faz 6 testi, tum shared 153 test, 56 kaynak regresyonu ve 15 TS testi basarili. typecheck, verify, compile ve diff kontrolu gecti. Kayit: docs/walkthroughs/ilham-analizi-faz-6-walkthrough.md. Faz 1-6 kod tamamlandi; canli migration, uretici provenance gecisi ve rollout kabul kriterleri bekliyor.

Restart tablosu tarihi plan kaydidir; mevcut durumda PID beklenmez ve otomatik start yetkisi vermez. Kullanici bakim bittikten sonra birlikte restart istemistir. Yeniden baslatmadan once katalog backup/prova, ayni PROTOKOL_DAEMON_RUN_DB env'i, dependency kurulumu, source checkpoint ve korunmus shard inventory'si kontrol edilmelidir.
