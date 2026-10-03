# 12 — Donanım ve hata kurtarma
## Başlangıç profilleri, benchmark veya SLA değil
| Profil | CPU | RAM | İşletim/DB/staging disk | Kullanım |
|---|---|---|---|---|
| Dev | 4 vCPU | 8 GB | 50–100 GB SSD | küçük fixture/local |
| Tek host pilot | 8 vCPU | 16–32 GB | 250–500 GB SSD | DB/broker ve sınırlı concurrency |
| İlk production adayı | 16 vCPU | 32–64 GB | 500 GB–1 TB SSD/NVMe | gerçek pilot kapasitesine bağlı |
| Dağıtık | control node + worker pool | iş başına ölçüm | temp disk ayrı | HA ve bağımsız scale |

Disk lake kapasitesi değildir; 500 TB ayrıca logical/raw/replica tanımı ve storage bütçesi gerektirir. Tek host HA sağlamaz. Yerel LLM/GPU, model revision/context/batch gereksinimi ölçülmeden boyutlandırılmaz. İlk pilot concurrency örneği download 4, extract 1, OCR 1; bunlar öneri başlangıcı, RAM/disk admission ile azaltılır. Browser ve Trino bu host'a ölçmeden eklenmez.

Memory budget = OS+DB+broker+worker count × ölçülmüş p95 peak RSS + headroom. Staging budget = concurrency × max input × transform expansion + spool reserve; max asset tek başına archive expansion'ı sınırlamaz. Disk low watermark yeni claim'i durdurur. Network/source rate limiti global. Benchmark raporu: dataset mix, bytes/pages, parser version, CPU, RSS p95/p99, latency, throughput, temp peak, failures, cost; steady/burst/soak ayrı. Backlog growth, service latency ve error budget kapasite gate'idir.

## Acquisition hata matrisi
| Hata | Sınıf ve tepki | Kalıcı kayıt |
|---|---|---|
| DNS timeout/SERVFAIL | bounded retry+jitter; per-host breaker | resolver error category, attempt |
| NXDOMAIN | kısa retry budget sonra source review | redacted host, terminal category |
| Connect/reset/read timeout | partial tamamlanmaz; bounded retry | bytes received, stage, elapsed |
| TLS invalid cert | verify kapatılmaz; pause/review | TLS category, secret olmayan host |
| Redirect | her hedefte host/IP policy | redirect count, final redacted host |
| 429 | Retry-After; global throttle | retry_after, HTTP status |
| 5xx | retry budget/circuit breaker | status ve attempt |
| 401/403 | bounded credential refresh veya pause | connection status, auth category |
| 404/410 | kaynak sözleşmesine göre missing/tombstone | source record version |
| HTML yerine PDF | MIME + signature/parse gate | observed MIME, quarantine reason |
| Disk/storage fail | cursor ilerlemez; claim pause | partial/upload ID, bytes |
| Worker crash | lease reaper+epoch fenced retry | attempt ve recovery |
| DB commit unknown | idempotency/job readback | transaction outcome unknown |
| Broker confirm unknown | replay outbox; duplicate normal | event dispatch attempt |
| Lake commit unknown | batch ID snapshot lookup | snapshot/batch commit evidence |

## Resume ve DNS güvenliği
Resume sadece Range desteği, exact entity validator ve Content-Range/total doğrulaması ile. ETag içeriğin SHA-256'sı değildir. Validator yok/değişmişse partial discard ve yeniden indir; server 200 dönerse partial'a append etme. Offset checkpoint+partial file hash/size kaydı; secret signed URL DB/log'a yazılmaz. Expired signed URL authoritative source üzerinden yenilenir.

SSRF: URL scheme/domain/port policy; IPv4/IPv6 loopback/private/link-local/reserved targets; redirect tekrar kontrolü; DNS cevaplarının tümü değerlendirilsin, doğrulanan IP'ye connect/pinning ve doğru TLS hostname/SNI sağlansın. DNS rebinding ve proxy resolver farklılığı integration test konusu. HTTP pool politeness/cancellation uygular; limited redirect ve decompression. Parser subprocess nonroot/egress-off/RAM/CPU/time sınırları.

## Test gate
DNS transient+NXDOMAIN, midstream reset, invalid TLS, redirect private IP, rebinding, Range mismatch, disk full, broker/DB/storage outage, kill-before/after-commit, expired lease worker finalize, cancel race. Fixture/proxy fault injection ile reproducible test; gerçek provider test ayrı. Sadece retry kodu yazılması test kanıtı değildir.
