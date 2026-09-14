# Architecture Context

## 1. System Structure and Layers

protokol-7 is structured as a decoupled 3-tier microservice architecture:

```
[ External Consumers (Agent-Smith / CLI) ]
                     │  HTTP / JSON (REST)
                     ▼
┌────────────────────────────────────────────────────────┐
│  src/server.ts (Native HTTP Request Router)           │
│  - Endpoint Dispatching & JSON Payload Parsing         │
│  - Neuro-Ergonomic Error Serialization                │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  src/ Actor Registry & Execution Controllers          │
│  - ActorRegistry: Lifecycle & Actor Registry           │
│  - InteractiveBrowserController: Multi-turn Sessions   │
│  - CrawlerActor: BFS Graph Traversal                   │
└──────────────┬───────────────────────────┬─────────────┘
               │                           │
               ▼                           ▼
┌───────────────────────────────┐ ┌──────────────────────┐
│  Static Scraping Subsystem    │ │ Browser Subsystem    │
│  - CheerioScraperActor        │ │ - BrowserPool        │
│  - ApiExtractorActor          │ │ - PlaywrightActor    │
│  - ReadabilityExtractor       │ │ - StealthManager     │
│  - StructuredExtractor        │ │ - DomIndexer         │
│  - RobotsParser               │ │ - Route Interceptors │
└───────────────────────────────┘ └──────────────────────┘
```

---

## 2. Resource Lifecycle & Browser Pool

- **Warm Pool Lifecycle**: The Chromium browser instance is lazily launched upon the first request requiring a browser context.
- **Session Isolation**: Each caller or session receives a discrete `BrowserContext`. Cookies, local storage, and cached assets remain isolated per session ID.
- **Idle Teardown**: An internal timer tracks active contexts (`activeContexts`). When `activeContexts === 0` for 60 consecutive seconds, `BrowserPool` closes the root Chromium instance to release operating system memory.
- **Clean Context Acquisition**: Counter increment occurs strictly after `browser.newContext()` resolves successfully, preventing counter inflation upon initialization failures.

---

## 3. Invariants (Architectural Constraints)

### Invariant 1: Process and Memory Isolation
- protokol-7 runs in a dedicated operating system process. Heavy Node.js modules (`playwright`, `cheerio`, `jsdom`) and Chromium binary instances never share heap space or event loops with consumer applications.

### Invariant 2: Idle Resource Reclamation
- Headless browser processes must not run indefinitely without active traffic. The 60-second idle shutdown mechanism guarantees zero orphan Chromium background processes.

### Invariant 3: Network Resource Filtering
- All Playwright browser contexts must register route handlers to block heavy network requests (`image`, `media`, `font`, tracking scripts) unless explicitly requested by caller options.

### Invariant 4: Protocol and Error Determinism
- Responses must return valid `ScrapedPageResult`, `BrowserActionResult`, or structured error JSON. Failures must return descriptive, non-panicky error codes and messages without exposing raw runtime stack traces.

### Invariant 5: Zero Platform Bleed
- protokol-7 types and modules must not import or depend on agent runtime, database ORM, or chat domain types from consumer codebases.
