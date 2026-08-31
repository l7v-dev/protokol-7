# Project Overview: Protokol-7

## Product Definition

**Protokol-7** is an enterprise-grade web scraping, extraction, and dataset platform. It provides deterministic HTTP fetching, Playwright-based browser execution, proxy selection & rotation, reliability management, rule-based & AI extraction, dataset versioning, OpenTelemetry observability, cost intelligence, and multi-tenant security control.

## Core Architectural Principle

**HTTP-First, Browser-When-Needed:**
Statix HTTP worker is preferred by default. Playwright Chromium browser worker is initiated only when JavaScript rendering, session interactivity, or network interception is strictly required.

## Key Subsystems & Capabilities

- **API & Control Plane:** Fastify REST endpoints for projects, targets, schemas, jobs, datasets, and resources.
- **Orchestration:** BullMQ & Redis task queue, state transitions, idempotency guards, and DLQ recovery.
- **Execution Engines:** HTTP worker & Browser (Playwright) worker.
- **Proxy Intelligence:** Multi-provider capabilities, health scoring, sticky sessions, lease management, and rotation.
- **Extraction Engine:** CSS, XPath, JSONPath, HTML cleaning, transform normalization, and controlled AI extraction.
- **Schema Engine:** Versioning, type safety, field quality scoring, and publish thresholds.
- **Dataset Platform:** Lineage tracking, deduplication, JSON/CSV/Parquet export adapters, and retention governance.
- **Observability & FinOps:** OpenTelemetry traces, Prometheus metrics, structured logs, cost allocation per job, and budget alerts.
