# LedgerLens

LedgerLens is a high-performance financial reconciliation engine and AI-powered exception investigation copilot.

## High-Level Architecture

The monorepo uses Bun as its package manager and runtime, orchestrated by Turborepo. It features a Next.js dashboard that connects to a Fastify API, which interfaces with a core pure TypeScript reconciliation engine and an AI investigation copilot package.

```
Raw Financial Data
        ↓
Deterministic Ingestion (@ledgerlens/ingestion)
        ↓
Deterministic Candidate Discovery (@ledgerlens/reconciliation-engine)
        ↓
Deterministic Candidate Resolution (@ledgerlens/reconciliation-engine)
        ↓
Structured Reconciliation Result (RESOLVED / AMBIGUOUS / UNMATCHED)
        ↓
AI Investigation Layer (@ledgerlens/ai-investigator)
        ↓
Executive Briefs, Risk Classifications, and Interactive Copilot Q&A
```

## Repository Structure

```
ledgerlens/
├── apps/
│   ├── api/ (Fastify API with /reconcile and /investigate endpoints)
│   └── dashboard/ (Next.js Financial Operations Dashboard)
│
├── packages/
│   ├── shared/ (Domain contracts, result types, AI schemas)
│   ├── ingestion/ (Raw record validation and normalization)
│   ├── reconciliation-engine/ (Deterministic candidate discovery and resolution)
│   ├── ai-investigator/ (Gemini, OpenAI, and deterministic fallback copilot)
│   ├── synthetic-data/ (Deterministic financial flow generator)
│   └── database/ (Prisma schema)
```

## Prerequisites

- [Bun](https://bun.sh/) (v1.1+)

## Quick Start

### 1. Install Dependencies
```sh
bun install
```

### 2. Configure Environment Variables (Optional for AI Copilot)
Create a `.env` file in the root directory (or set in your shell):

```env
# Optional: Google Gemini API Key for LLM-powered audit reports
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: OpenAI API Key (alternative provider)
# OPENAI_API_KEY=your_openai_api_key_here

# Optional: Override API port
PORT=3001
```

> **Note**: If no API key is provided, LedgerLens automatically runs in **Deterministic Fallback Mode**, generating rule-grounded investigation reports and answers with zero external dependencies.

### 3. Run Development Servers
```sh
bun run dev
```
- **Dashboard**: `http://localhost:3000`
- **Fastify API**: `http://localhost:3001`

### 4. Run Automated Tests
```sh
bun test
```

### 5. Run Workspace Typecheck
```sh
bun run typecheck
```

### 6. Build Production Bundles
```sh
bun run build
```

## Deterministic Reconciliation Pipeline

1. **Ingestion & Normalization (`POST /ingestions`)**:
   - Safely parses major and minor decimal strings/numbers into integer minor units without floating-point errors.
   - Normalizes field aliases (`transaction_id`, `created_at`, `fee`, etc.).
   - Rejection boundary isolates malformed records without halting valid batch processing.

2. **Candidate Discovery (`discoverCandidates`)**:
   - Directional pairing: `ORDER -> PAYMENT`, `PAYMENT -> SETTLEMENT`, `PAYMENT -> REFUND`, `PAYMENT -> ADJUSTMENT`, `SETTLEMENT -> BANK_ENTRY`.
   - Prerequisites: currency match, chronological order within a 7-day temporal window, and pair-specific amount bounds.

3. **Candidate Resolution (`resolveCandidates`)**:
   - Evaluates multi-evidence scoring weights:
     - `EXACT_REFERENCE`: 100 pts
     - `AMOUNT_COMPATIBLE`: 20 pts
     - `CURRENCY_COMPATIBLE`: 10 pts
     - `TIME_WINDOW_COMPATIBLE`: 10 pts
   - Status assignment:
     - `RESOLVED`: Exactly one candidate holds the strictly highest score.
     - `AMBIGUOUS`: Competing candidates tie for the highest score (flagged for review; never guessed).
     - `UNMATCHED`: No valid candidate found.

## AI Investigation Layer (`@ledgerlens/ai-investigator`)

The AI layer acts strictly as an **Explainer** and **Investigation Copilot** on top of the deterministic results:

- **Audit Investigation Reports (`POST /investigate`)**:
  - Structured case finding, rule justification, key evidence breakdown, operational risk level (`LOW` | `MEDIUM` | `HIGH`), recommended actions, and investigative questions.
- **Executive Reconciliation Summary (`POST /investigate/summary`)**:
  - Generates high-level management briefs, key findings, exception highlights, and next steps strictly grounded in real summary metrics.
- **Interactive Copilot Q&A (`POST /investigate/ask`)**:
  - Allows operations analysts to ask contextual questions (*"Why was this verdict chosen?"*, *"What action should I take?"*, *"What is the operational risk?"*).
- **Multi-Provider & Fallback Safety**:
  - Supports Google Gemini and OpenAI with graceful timeout and automatic fallback to local deterministic analysis if keys are missing or network calls fail.
  - Zero hallucination of record IDs or ground truth.
