# Wiktionary Multi-Language Lexical & Etymological Extractor — Technical Specification

## 1. Architectural Overview

The `WiktionaryActor` extracts dictionary definitions, parts of speech, etymologies, phonetic pronunciations, and cross-lingual translations across all 198+ Wikimedia Wiktionary language editions via official Wikimedia REST and Action APIs.

```mermaid
graph TD
    A["Task Input (JSON/REST/MCP)"] --> B["WiktionaryActor.run()"]
    B --> C["SSRFGuard.validateUrlWithDns()"]
    C -->|Valid| D["Resolve Language, Word & Action"]
    C -->|Prohibited Destination| E["403 SSRF Prohibited"]
    D --> F{"Action Mode"}
    F -->|definition| G["REST API: /api/rest_v1/page/definition"]
    F -->|entry| H["REST API: /api/rest_v1/page/html"]
    F -->|search| I["Action API: /w/api.php?action=opensearch"]
    F -->|random| J["Action API: /w/api.php?action=query&list=random"]
    G --> K["JSON Sense & PoS Extraction"]
    H --> L["TurndownService (Clean GFM Markdown)"]
    I --> M["Word Search Metadata List"]
    J --> N["Random Word Lemma List"]
    K --> O["GFM Markdown Report Generator"]
    L --> O
    M --> O
    N --> O
    O --> P["ActorResult (200 OK)"]
```

---

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Client as REST API / MCP Client
    participant Actor as WiktionaryActor
    participant Guard as SSRFGuard
    participant Wiki as Wikimedia Wiktionary API
    participant TD as TurndownService

    Client->>Actor: execute(task)
    Actor->>Actor: resolveParameters(targetUrl, options)
    Actor->>Actor: buildApiUrl(lang, action, word)
    Actor->>Guard: validateUrlWithDns(resolvedQueryUrl)
    Guard-->>Actor: valid: true
    Actor->>Wiki: GET /api/rest_v1/page/definition/{word}
    Wiki-->>Actor: 200 OK (JSON Definition Matrix)
    Actor->>TD: cleanDefinitionHtml(def.definition)
    TD-->>Actor: Clean Markdown Definition
    Actor->>Actor: renderMarkdownReport(items)
    Actor-->>Client: 200 OK (WiktionaryActorResult)
```

---

## 3. State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> ValidatingParams : Task Received
    ValidatingParams --> SSRFCheck : Word & Lang Resolved
    SSRFCheck --> Fetching : DNS & IP Clean
    SSRFCheck --> Failed : Private/Prohibited IP
    Fetching --> Transforming : 200 OK
    Fetching --> NotFound : 404 No Entry
    Fetching --> Failed : 5xx / Network Error
    Transforming --> Completed : Markdown Built
    NotFound --> Completed : Empty Result (200)
    Completed --> [*]
    Failed --> [*]
```

---

## 4. Input & Output Contracts

### Input Schema (`POST /api/v1/wiktionary`)
```json
{
  "word": "algorithm",
  "lang": "en",
  "action": "definition",
  "extractMarkdown": true,
  "options": {
    "timeoutMs": 15000,
    "limit": 10
  }
}
```

### Output Schema (`WiktionaryActorResult`)
```json
{
  "lang": "en",
  "action": "definition",
  "items": [
    {
      "word": "algorithm",
      "url": "https://en.wiktionary.org/wiki/algorithm",
      "lang": "en",
      "partsOfSpeech": [
        {
          "partOfSpeech": "Noun",
          "language": "English",
          "definitions": [
            {
              "definition": "A collection of ordered steps that solve a mathematical problem."
            }
          ]
        }
      ],
      "fullMarkdown": "# Wiktionary: algorithm (en)\n\n## English — Noun\n\n1. A collection of ordered steps that solve a mathematical problem."
    }
  ],
  "queryUrl": "https://en.wiktionary.org/api/rest_v1/page/definition/algorithm",
  "markdown": "# Wiktionary: algorithm (en)\n\n## English — Noun\n\n1. A collection of ordered steps that solve a mathematical problem."
}
```
