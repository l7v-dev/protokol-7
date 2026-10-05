# Local OTel collector

The monitoring profile is opt-in; it is separate from the application Compose file.
Only host loopback port 4318 is published. The OTLP HTTP logs pipeline uses bounded memory,
batching and a basic debug exporter. This configuration does not export dataset content,
persist logs or add a monitoring backend. Registry metadata logs are exported by the separate checkpointed SQL-to-OTLP worker. No collector is started by application startup. The collector was manually activated on 2026-10-05.

Validate with the pinned image before activation:

```sh
docker compose -f infra/monitoring/compose.yaml --profile monitoring run --rm otel-collector validate --config=/etc/otelcol/config.yaml
```

Start manually when needed:

```sh
docker compose -f infra/monitoring/compose.yaml --profile monitoring up -d
```

[Collector configuration](https://opentelemetry.io/docs/collector/configuration/) and
[Docker installation](https://opentelemetry.io/docs/collector/install/docker/) define the
configuration structure and pinned release used here. Validate the binary and configure a
metadata-only OTLP sender before calling this an active observability export path.

## Metadata export worker

```sh
node_modules/.bin/tsx scripts/export-otel-logs.ts data/catalog.sqlite data/monitoring/otel-cursor.json watch
```

The catalog is opened read-only; batches contain at most 100 validated metadata events. HTTP targets only 127.0.0.1:4318/v1/logs, with a 2-second timeout and a 64 KiB decompressed acknowledgement cap. The SQL emitter remains independent of collector availability. Accepted batches advance a fsync/rename checkpoint. Delivery is at least once: a crash between acknowledgement and checkpoint can duplicate accepted events. Retryable 429/502/503/504 or network errors retain the checkpoint and stop the worker; restart after collector recovery.

Partial or nonretryable acknowledgements create a durable `.blocked` file and prevent automatic replay. Resolve the recorded event range manually before resuming; do not delete this marker merely to retry a partial batch. The exclusive `.lock` file records the worker PID. After an unclean exit, verify that PID is no longer the exporter before removing a stale lock. Database restoration/replacement requires a separately reviewed checkpoint reset.

The collector and worker were activated; a synthetic event in an isolated temporary catalog received a successful acknowledgement and collector log-record count of one. This is not evidence that Python stdout logs are exported. The live SQL log table was initially empty.

Protocol: [OTLP HTTP responses](https://opentelemetry.io/docs/specs/otlp/#otlphttp-response).
