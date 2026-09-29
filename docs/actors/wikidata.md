# Wikidata Structured Knowledge Graph Harvester — Technical Specification

## 1. Architectural Overview

The `WikidataActor` extracts structured knowledge graph entities, Q-IDs, P-IDs, statements, claims, and semantic triples from official Wikimedia Wikidata APIs (`wbgetentities`, `wbsearchentities`, and `query.wikidata.org` SPARQL endpoint).

```mermaid
graph TD
    A["Task Input (JSON/REST/MCP)"] --> B["WikidataActor.run()"]
    B --> C["SSRFGuard.validateUrlWithDns()"]
    C -->|Valid| D["Resolve Entity ID, Query or SPARQL"]
    C -->|Prohibited IP/Rebinding| E["403 Prohibited Destination"]
    D --> F{"Action Mode"}
    F -->|entity/claims| G["Action API: wbgetentities (www.wikidata.org)"]
    F -->|search| H["Action API: wbsearchentities (www.wikidata.org)"]
    F -->|sparql| I["SPARQL Query Endpoint (query.wikidata.org)"]
    G --> J["Claims & Entity Normalizer"]
    H --> K["Entity Search Parser"]
    I --> L["SPARQL JSON Table Formatter"]
    J --> M["GFM Markdown Report Generator"]
    K --> M
    L --> M
    M --> N["ActorResult (200 OK)"]
```

---

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Client as REST API / MCP Client
    participant Actor as WikidataActor
    participant Guard as SSRFGuard
    participant Wiki as Wikidata API / SPARQL Endpoint

    Client->>Actor: execute(task)
    Actor->>Actor: resolveParameters(targetUrl, options)
    Actor->>Actor: buildApiUrl(action, entityId, query, sparql)
    Actor->>Guard: validateUrlWithDns(resolvedQueryUrl)
    Guard-->>Actor: valid: true
    Actor->>Wiki: GET /w/api.php?action=wbgetentities&ids={id}
    Wiki-->>Actor: 200 OK (Entities JSON)
    Actor->>Actor: parseEntityClaims(rawJson)
    Actor->>Actor: renderMarkdownReport(items)
    Actor-->>Client: 200 OK (WikidataActorResult)
```

---

## 3. State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> ValidatingParams : Task Received
    ValidatingParams --> SSRFCheck : Entity/Query/SPARQL Resolved
    SSRFCheck --> Fetching : Safe IP Verified
    SSRFCheck --> Failed : Private/Cloud IP Blocked
    Fetching --> ParsingJSON : 200 OK Response
    Fetching --> Failed : 4xx / 5xx Unrecoverable
    ParsingJSON --> RenderingReport : Claims/Bindings Formatted
    RenderingReport --> Completed : Data Contract Sealed
    Completed --> [*]
    Failed --> [*]
```

---

## 4. Input & Output Contract

### 4.1 Input Specification
```typescript
export interface WikidataActorTaskOptions {
  action?: "entity" | "search" | "sparql" | "claims"; // Default: entity
  entityId?: string;        // Entity or property identifier (e.g. 'Q42', 'P31')
  entityIds?: string[];     // Multiple entity IDs
  query?: string;           // Search expression for wbsearchentities
  sparql?: string;          // SPARQL query string
  propertyId?: string;      // Filter claims to specific property (e.g. 'P31')
  lang?: string;            // Language code for labels (default: 'en')
  limit?: number;           // Results limit (default: 10)
  timeoutMs?: number;       // Request timeout in milliseconds (default: 30000)
}
```

### 4.2 Output Specification
```typescript
export interface WikidataActorResult {
  action: "entity" | "search" | "sparql" | "claims";
  queryUrl: string;
  items?: WikidataEntityItem[];
  sparqlResults?: {
    head: { vars: string[] };
    results: { bindings: WikidataSparqlBinding[] };
  };
  markdown?: string;
}
```

---

## 5. Security & Invariants

1. **SSRF Guard Protection:** DNS resolution checking through `SSRFGuard.validateUrlWithDns` prior to network dispatch.
2. **Deterministic Timeouts:** Maximum 30,000 ms timeout per upstream call with `AbortController`.
3. **Structured Entity Representation:** Normalizes complex Wikibase datavalues and snaks into strongly-typed property-value claim records.
