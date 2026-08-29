# LedgerLens

LedgerLens is a financial reconciliation and exception investigation platform that ingests records from disparate financial systems, normalizes heterogeneous schemas, discovers candidate transaction relationships, deterministically resolves matches, flags ambiguous and unmatched exceptions, and provides an explanatory investigation layer for finance and operations analysts.

## Problem

Modern organizations process financial events across fragmented systems, including commerce platforms, payment gateways, merchant processors, ERP ledgers, and bank clearing networks. Orders, payments, settlements, refunds, fee adjustments, and bank statement lines often reside in isolated data stores with differing timestamps, schema conventions, currency formatting, and reference identifiers. 

Connecting and reconciling these records reliably is critical for closing financial books and detecting revenue leakage. As transaction volumes grow, manual reconciliation becomes error-prone and costly. LedgerLens addresses this challenge by automatically resolving high-confidence transaction pairs through deterministic evidence scoring while isolating exceptions and surfacing actionable investigation context. LedgerLens functions as an analytical reconciliation pipeline and does not replace core transactional databases.

## Solution

LedgerLens implements a multi-stage reconciliation workflow:

```
Raw Financial Records
        ↓
Ingestion & Normalization
        ↓
Candidate Discovery
        ↓
Evidence Scoring
        ↓
Deterministic Resolution (RESOLVED / AMBIGUOUS / UNMATCHED)
        ↓
Investigation & Analyst Action Layer
        ↓
Operations Dashboard
```

The system strictly decouples **deterministic reconciliation** from the **investigation layer**:
- **Deterministic Core**: Pure TypeScript engine evaluating explicit compatibility rules, temporal windows, and evidence point thresholds. It holds sole authority over match decisions.
- **Investigation Layer**: Downstream analytical copilot powered by Gemini (with a deterministic rule fallback) that consumes finalized reconciliation results to assess operational risk, assign attention priorities, and generate concrete analyst action items.

## Key Features

- **Synthetic Financial Universe**: Deterministic generation of multi-leg financial lifecycles with isolated ground truth.
- **8 Reconciliation Scenarios**: Standard flows, partial refunds, delayed settlements, missing bank entries, split settlements, duplicate references, fee adjustments, and unresolved discrepancies.
- **Strict Ingestion Validation**: Ingestion boundary isolating invalid payloads while allowing valid batch items to proceed.
- **Integer Minor-Unit Money Handling**: Decimal-safe conversion avoiding IEEE-754 floating-point arithmetic.
- **Timestamp Normalization**: Multi-format parsing for ISO-8601 strings, Unix seconds, and Unix milliseconds.
- **Duplicate Detection**: Batch-level duplicate record ID identification.
- **Typed Rejection Reasons**: Diagnostic rejection codes (`MISSING_ID`, `INVALID_TYPE`, `INVALID_AMOUNT`, `NEGATIVE_AMOUNT`, `INVALID_TIMESTAMP`, `DUPLICATE_ID`, `NEGATIVE_FEE`, `INVALID_CURRENCY`).
- **Deterministic Candidate Discovery**: Directional pairing across supported transaction types within configurable temporal windows.
- **Evidence-Based Scoring**: Additive point system evaluating reference equality, amount boundaries, currency matching, and temporal proximity.
- **Explicit Match Categorization**: Distinct `RESOLVED`, `AMBIGUOUS`, and `UNMATCHED` outcomes.
- **Fastify API**: High-throughput HTTP backend with batch boundaries and schema validation.
- **Next.js Dashboard**: Dark operations console with KPI metrics, filterable results, and candidate visualizer.
- **Rejected-Record Inspector**: Dedicated interface for reviewing schema validation failures.
- **Analyst Action Engine**: Structured case investigation with risk classifications (`LOW`, `MEDIUM`, `HIGH`) and attention levels (`REVIEW_REQUIRED`, `MONITOR`, `NO_ACTION`).
- **Gemini Integration**: Automated natural-language case briefs, executive summaries, and conversational Q&A.
- **Deterministic Fallback**: Comprehensive rule-grounded investigation reports when external providers are unconfigured.
- **Full Test Coverage**: 122 automated unit and integration tests across the workspace.

## Architecture

```mermaid
flowchart TD
    A[Company Financial Systems] --> B[Raw Financial Records]
    B --> C[Ingestion & Normalization]
    C --> D[Canonical Financial Records]
    D --> E[Candidate Discovery]
    E --> F[Evidence Scoring]
    F --> G[Reconciliation Decision]
    G --> H[Fastify API & Dashboard]
    G --> I[Investigation & Copilot Layer]
    I --> H
    H --> J[Finance / Operations Analyst]
```

The architecture consists of modular TypeScript packages organized in a monorepo:
1. **Normalization Layer (`@ledgerlens/ingestion`)**: Translates messy incoming payloads into immutable domain records (`FinancialRecord`).
2. **Reconciliation Core (`@ledgerlens/reconciliation-engine`)**: Pure mathematical pairing and scoring engine containing zero external runtime dependencies.
3. **Investigation Package (`@ledgerlens/ai-investigator`)**: Downstream explanation engine that consumes structured decisions from the core engine to generate analyst recommendations.
4. **API Application (`apps/api`)**: Fastify server exposing ingestion, reconciliation, and investigation endpoints.
5. **Dashboard Application (`apps/dashboard`)**: Next.js single-page application for operational review.

## Reconciliation Pipeline

### 1. Ingestion and Normalization
The ingestion engine receives raw objects (`RawRecord`) containing heterogeneous alias names (such as `transaction_id`, `created_at`, `transaction_amount`, or `fee`). It executes:
- **Alias Resolution**: Normalizes fields to canonical keys (`id`, `type`, `amount`, `currency`, `timestamp`, `reference`).
- **Money Conversion**: Parses strings and numbers into integer minor units (e.g., `$100.50` or `"100.50"` becomes `10050`). Decimal precision beyond two places or non-numeric tokens are rejected.
- **Timestamp Parsing**: Converts ISO-8601 strings, Unix second numbers, and Unix millisecond timestamps into canonical JavaScript `Date` instances.
- **Batch Resiliency**: Invalid entries are appended to a typed `rejected` array with specific failure codes, while valid entries continue to candidate discovery.

### 2. Candidate Discovery
The engine evaluates potential relationships across canonical records based on directional domain rules:
- `ORDER -> PAYMENT`
- `PAYMENT -> SETTLEMENT`
- `PAYMENT -> REFUND`
- `PAYMENT -> ADJUSTMENT`
- `SETTLEMENT -> BANK_ENTRY`

A pair is accepted as a candidate match only if it satisfies four baseline constraints:
1. **Currency Compatibility**: Currencies must be identical (`source.currency === target.currency`).
2. **Chronological Ordering**: Target timestamp must occur at or after source timestamp (`target.timestamp >= source.timestamp`).
3. **Temporal Window**: Target must occur within 7 days ($604,800,000\text{ ms}$) of the source. This temporal threshold is a configurable operational assumption for the pipeline.
4. **Relationship Amount Compatibility**:
   - `ORDER -> PAYMENT`: Exact equality (`source.amount === target.amount`).
   - `PAYMENT -> SETTLEMENT`: Subset or equality (`target.amount <= source.amount`).
   - `PAYMENT -> REFUND`: Subset or equality (`target.amount <= source.amount`).
   - `PAYMENT -> ADJUSTMENT`: Absolute value bound (`Math.abs(target.amount) <= source.amount`).
   - `SETTLEMENT -> BANK_ENTRY`: Exact equality (`source.amount === target.amount`).

### 3. Evidence Scoring
Discovered candidate pairs receive deterministic evidence points:

| Evidence Criterion | Points | Rule Condition |
| :--- | :--- | :--- |
| `EXACT_REFERENCE` | 100 | Source and target share non-empty, identical reference strings |
| `AMOUNT_COMPATIBLE` | 20 | Amounts satisfy relationship-specific directional bounds |
| `CURRENCY_COMPATIBLE` | 10 | Exact currency code match |
| `TIME_WINDOW_COMPATIBLE` | 10 | Chronological order satisfied within 7-day temporal window |

The maximum possible evidence score is **140**. This score represents deterministic rule weight, not an artificial confidence estimate.

### 4. Resolution
Source records (`ORDER`, `PAYMENT`, `SETTLEMENT`) receive one of three mutually exclusive outcomes:
- **`RESOLVED`**: Exactly one candidate holds the strictly highest evidence score. The winning candidate ID is recorded in `matchedRecordIds`.
- **`AMBIGUOUS`**: Two or more candidates tie for the highest evidence score (e.g., duplicate references or identical amounts within the same window). Competing candidate IDs are captured in `candidateRecordIds`, and `matchedRecordIds` remains empty. The engine refuses to guess without differentiating evidence.
- **`UNMATCHED`**: Zero candidates satisfied the discovery rules.

## Financial Scenarios

The synthetic data package (`@ledgerlens/synthetic-data`) deterministically generates realistic transaction lifecycles covering 8 distinct scenarios:

- **`CLEAN`**: Standard end-to-end lifecycle (`ORDER -> PAYMENT -> SETTLEMENT -> BANK_ENTRY`) with matching references and amounts.
- **`PARTIAL_REFUND`**: Successful order and payment followed by a customer refund for a subset of the original amount.
- **`DELAYED_SETTLEMENT`**: Settlement generated past the standard temporal boundary, testing window compatibility.
- **`MISSING_BANK_ENTRY`**: Flow where processor settlement occurs but corresponding bank clearing line is omitted.
- **`SPLIT_SETTLEMENT`**: Single payment cleared across multiple smaller settlement records whose sum equals the principal.
- **`DUPLICATE_REFERENCE`**: Distinct transactions sharing the same merchant reference code, creating genuine ambiguity.
- **`ADJUSTMENT`**: Payment associated with processor fee corrections or disputed charge adjustments.
- **`UNRESOLVED`**: Discrepancies intentionally missing target records to test exception surfacing.

### Role of Ground Truth
Synthetic datasets generate two components: a visible `dataset` containing raw financial records and a separate `groundTruth` object mapping true lifecycle relationships. Visible records contain no hidden foreign keys or relationship indicators. Ground truth is used exclusively by automated tests to verify engine precision.

## AI Investigation Layer

The AI investigation layer (`@ledgerlens/ai-investigator`) functions as a post-reconciliation copilot. It never participates in match discovery or score calculation.

Key design principles:
- **Downstream Operation**: Invoked only after deterministic reconciliation completes.
- **Immutable Results**: Cannot alter statuses, match arrays, candidate rankings, or evidence scores.
- **Zero Ground-Truth Access**: Operates solely on visible record fields (`id`, `amount`, `currency`, `timestamp`, `reference`) and candidate rule reasons.
- **Analyst Action Classification**:
  - **Risk Levels**: `LOW` (clean resolved matches), `MEDIUM` (unmatched items or partial evidence), `HIGH` (ambiguous candidate ties or large unlinked amounts).
  - **Attention Levels**: `NO_ACTION` (high-scoring resolved records), `MONITOR` (lower-score matches requiring review), `REVIEW_REQUIRED` (all ambiguous and unmatched records).
- **Structured Schema**: Validates all provider output against typed contracts (`InvestigationReport`, `ExecutiveSummaryReport`, `AskInvestigationResponse`).
- **Deterministic Fallback**: Automatically activates rule-based narrative generation when no API key is provided or when network timeouts occur.

## API

The backend Fastify server (`apps/api`) runs on port 3001 and enforces a 1000-record batch limit on ingestion payloads.

### `GET /health`
Returns service operational status.
```json
{
  "status": "ok",
  "service": "ledgerlens-api"
}
```

### `POST /ingestions`
Normalizes raw input records and reports schema validation rejections.
- **Request**: `{ "records": [ ...rawObjects ] }`
- **Response**: `{ "records": [ ...normalized ], "rejected": [ ...rejections ], "acceptedCount": 10, "rejectedCount": 0 }`

### `POST /reconcile`
Executes full ingestion, candidate discovery, and deterministic resolution.
- **Request**: `{ "records": [ ...rawObjects ] }`
- **Response**:
```json
{
  "summary": {
    "totalInputRecords": 100,
    "acceptedRecords": 98,
    "rejectedRecords": 2,
    "resolved": 80,
    "ambiguous": 10,
    "unmatched": 8,
    "candidateCount": 95
  },
  "records": [ ...normalizedRecords ],
  "rejected": [ ...rejectedRecords ],
  "candidates": [ ...discoveredCandidates ],
  "results": [ ...resolutionResults ]
}
```

### `GET /investigate/info`
Returns the active AI provider status.
```json
{
  "provider": "gemini",
  "isAiConfigured": true
}
```

### `POST /investigate`
Generates a structured investigation report for a specific source record.
- **Request**: `{ "record": { ... }, "result": { ... }, "candidates": [ ... ] }`
- **Response**:
```json
{
  "summary": "PAYMENT pay_100 was uniquely resolved to SETTLEMENT stl_100 with evidence score 140/140.",
  "whyThisStatus": "Candidate stl_100 attained the strictly highest evidence score without tie.",
  "explanation": "A unique candidate achieved the highest evidence score of 140/140 based on exact matching criteria.",
  "keyEvidence": ["Exact Reference Match (+100 pts)", "Amount Compatibility (+20 pts)"],
  "riskLevel": "LOW",
  "attentionLevel": "NO_ACTION",
  "recommendedAction": "Proceed with automated ledger posting and batch settlement closure.",
  "recommendedActions": [
    "Proceed with automated ledger posting and batch settlement closure.",
    "Verify standard clearing house confirmation in next scheduled cycle."
  ],
  "questionsToInvestigate": ["Confirm final bank ledger posting status with clearing network."],
  "provider": "gemini"
}
```

### `POST /investigate/summary`
Generates an executive management brief from batch reconciliation counts.
- **Request**: `{ "summary": { ...reconciliationSummary } }`
- **Response**: `{ "overview": "...", "keyFindings": [ ... ], "attentionRequired": [ ... ], "recommendedNextSteps": [ ... ], "provider": "gemini" }`

### `POST /investigate/ask`
Answers contextual case questions from operations analysts.
- **Request**: `{ "question": "Why is this ambiguous?", "context": { "record": { ... }, "result": { ... }, "candidates": [ ... ] } }`
- **Response**: `{ "answer": "...", "provider": "gemini" }`

## Dashboard

The Next.js dashboard (`apps/dashboard`) provides an interactive interface for financial operations:
- **Data Ingestion Controls**: Load synthetic demo flows or submit custom transaction batches.
- **Reconciliation Trigger**: Dispatches batch to `POST /reconcile` and updates client state.
- **KPI Summary Cards**: Real-time counters for Total Records, Ingested, Resolved, Ambiguous, Unmatched, and Ingestion Rejections.
- **Executive AI Brief**: High-level batch analysis detailing key findings and required operational follow-ups.
- **Filterable Results Table**: Search and filter by status (`ALL`, `RESOLVED`, `AMBIGUOUS`, `UNMATCHED`, `REJECTED`), record ID, or reference.
- **Analyst Action Panel**: Dedicated case inspector displaying Risk Level (`LOW`, `MEDIUM`, `HIGH`), Attention Level (`REVIEW_REQUIRED`, `MONITOR`, `NO_ACTION`), narrative justification, and numbered next steps.
- **Evidence Breakdown**: Visual point score allocation (`+100`, `+20`, `+10`, `+10`).
- **Interactive Copilot**: Natural-language Q&A chat for real-time case inquiry.
- **Rejected Record Inspector**: Raw JSON and error reason inspection for schema failures.

## Project Structure

```
ledgerlens/
├── apps/
│   ├── api/                       # Fastify HTTP backend
│   └── dashboard/                 # Next.js React frontend
├── packages/
│   ├── shared/                    # TypeScript interfaces, domain types, and schemas
│   ├── ingestion/                 # Raw record validation and money/timestamp normalizer
│   ├── reconciliation-engine/     # Candidate discovery and evidence resolution engine
│   ├── synthetic-data/            # Synthetic flow generator with ground-truth isolation
│   ├── ai-investigator/           # Gemini integration and deterministic fallback provider
│   └── database/                  # Prisma schema definitions
├── package.json                   # Turborepo workspace configuration
├── tsconfig.json                  # Root TypeScript configuration
└── README.md                      # Project documentation
```

### Package Responsibilities
- **`@ledgerlens/shared`**: Common contracts shared across all packages.
- **`@ledgerlens/ingestion`**: Untrusted data cleaning and schema normalization.
- **`@ledgerlens/reconciliation-engine`**: Deterministic candidate discovery and resolution.
- **`@ledgerlens/synthetic-data`**: Scenario generation and validation testing.
- **`@ledgerlens/ai-investigator`**: Natural-language explanation and risk classification.
- **`apps/api`**: REST API exposing the reconciliation pipeline.
- **`apps/dashboard`**: Web interface for financial analysts.

## Running Locally

### Prerequisites
- [Bun](https://bun.sh/) (v1.1+)

### 1. Install Dependencies
```sh
bun install
```

### 2. Configure Environment (Optional)
Create a `.env` file in the root directory to enable Gemini AI investigation:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

If no `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) is set, LedgerLens runs in **Deterministic Fallback Mode** with zero external network dependencies.

### 3. Start Development Servers
```sh
bun run dev
```

- **Dashboard**: `http://localhost:3000`
- **Fastify API**: `http://localhost:3001`

## Testing

Run the automated test suite across all workspace packages:
```sh
bun test
```

Verified test coverage:
- `packages/ai-investigator/index.test.ts`: 9 tests
- `packages/ingestion/index.test.ts`: 32 tests
- `packages/reconciliation-engine/index.test.ts`: 31 tests
- `packages/synthetic-data/index.test.ts`: 17 tests
- `apps/api/src/index.test.ts`: 33 tests
- **Total**: 122 passing tests across 5 test suites.

Run workspace typechecking:
```sh
bun run typecheck
```

Build the dashboard for production:
```sh
cd apps/dashboard
bun run build
```

## Demo Walkthrough

1. Start the application using `bun run dev`.
2. Open `http://localhost:3000` in your web browser.
3. Click **Load Demo Data** to generate synthetic financial flows in memory.
4. Click **Run Reconciliation** to send records through the Fastify API.
5. Review the **KPI Overview** and the **AI Executive Brief** card.
6. Select a **`RESOLVED`** row to inspect the single winning candidate, 140-point score breakdown, and `NO_ACTION` classification.
7. Select an **`AMBIGUOUS`** row to view candidate ties, duplicate reference evidence, and `REVIEW_REQUIRED` analyst guidance.
8. Select an **`UNMATCHED`** row to review missing counterpart diagnosis.
9. Filter by **`REJECTED`** to inspect records that failed ingestion normalization.
10. In the **Ask LedgerLens Copilot** box, enter questions such as *"Why is this ambiguous?"* or *"What action should I take?"* to receive contextual explanations.

## Design Decisions

- **Integer Minor-Unit Money Representation**: All amounts are represented as integer minor units (e.g. cents, paise) to eliminate floating-point rounding inaccuracies.
- **Deterministic Core Authority**: Financial matching logic is entirely deterministic, transparent, and auditable.
- **Explicit Evidence Weights**: Candidate compatibility is calculated via explicit point assignments rather than black-box probabilistic heuristics.
- **Surfaced Ambiguity**: When multiple candidates share identical evidence, the system marks the transaction `AMBIGUOUS` rather than guessing.
- **Isolated Ground Truth**: Hidden relationship links are segregated in test suites and never supplied to the reconciliation engine.
- **Ingestion Failure Isolation**: Ingestion validation failures are separated from reconciliation results, preventing malformed records from interrupting valid batches.
- **Downstream AI Role**: AI is restricted to explaining verified decisions and recommending operational actions.
- **In-Memory Runtime**: All pipeline stages operate in memory for rapid local testing and clean containerized execution.

## Limitations / Production Evolution

- **Runtime Persistence**: In this demo implementation, transaction batches are processed in memory. A production deployment would attach persistent event logs and PostgreSQL storage via `@ledgerlens/database`.
- **Direct System Connectors**: Financial records are currently submitted via JSON API batches. Production deployment would add polling connectors for Stripe, Adyen, Plaid, and core banking feeds.
- **Configurable Reconciliation Rules**: The 7-day matching window and evidence point thresholds are currently configured at the package level; an enterprise deployment would allow per-merchant and per-corridor custom rule definitions.

## Tech Stack

- **Runtime & Package Manager**: Bun v1.4.0
- **Monorepo Tooling**: Turborepo
- **Language**: TypeScript (Strict Mode)
- **Backend Framework**: Fastify
- **Frontend Framework**: Next.js (App Router)
- **UI Library**: React, Tailwind CSS v4
- **Icons**: Lucide React
- **AI Integration**: Google Gemini API (`gemini-1.5-flash`)

## Final Notes

LedgerLens combines deterministic financial reconciliation with an investigation layer that helps analysts understand and act on exceptions.
