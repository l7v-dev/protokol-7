# UI Context

## Scope Exclusion

> [!NOTE]
> Protokol-7 is a backend engine service. UI components (Control Center dashboard) are managed in a separate frontend repository.

## Backend Observability UI Integration

- Health endpoints: `/health/live`, `/health/ready`, `/health/database`, `/health/queue`.
- Metrics endpoint: Prometheus scrape target at `/metrics`.
