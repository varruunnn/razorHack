# LedgerLens

LedgerLens is an AI-assisted financial reconciliation and exception investigation platform.

## High-Level Architecture

The monorepo uses Bun as its package manager and runtime, orchestrated by Turborepo. It features a Next.js dashboard that connects to a Fastify API, which interfaces with a core pure TypeScript reconciliation engine. The database layer uses Prisma.

Architectural Dependency Direction:
apps/dashboard -> apps/api -> packages/reconciliation-engine -> packages/shared

The database and synthetic-data packages function as infrastructure or distinct tools.

## Repository Structure

```
ledgerlens/
├── apps/
│   ├── api/ (Fastify API)
│   └── dashboard/ (Next.js App)
│
├── packages/
│   ├── shared/ (Domain types and contracts)
│   ├── database/ (Prisma ORM and migrations)
│   ├── reconciliation-engine/ (Core logic)
│   ├── synthetic-data/ (Dataset generation)
│   └── ingestion/ (Raw record validation and normalization)
```

## Prerequisites

- Bun

## Installation

```sh
bun install
```

## Development

To start the development servers:

```sh
bun run dev
```

## Typechecking

To typecheck the entire workspace:

```sh
bun run typecheck
```

## Building

To build all apps and packages:

```sh
bun run build
```

## Synthetic Financial Universe

The `synthetic-data` package generates realistic financial flows. 

- **Visible dataset vs Hidden ground truth**: The generator outputs `dataset` containing visible records (Orders, Payments, Settlements) and `groundTruth` containing the true relationships and scenarios.
- **Supported scenarios**: Generates CLEAN, PARTIAL_REFUND, DELAYED_SETTLEMENT, MISSING_BANK_ENTRY, SPLIT_SETTLEMENT, DUPLICATE_REFERENCE, ADJUSTMENT, UNRESOLVED cases.
- **Deterministic generation**: Outputs identical datasets when provided the same seed.
- **Money representation**: All monetary values are integer minor units (e.g., `10050` means `100.50`).

To run the synthetic data tests:
```sh
cd packages/synthetic-data
bun test
```

## Ingestion & Normalization

The `ingestion` package validates untrusted raw financial inputs and normalizes them into canonical domain records (`FinancialRecord`).

- **Batch processing**: Evaluates each raw record individually and returns `{ records, rejected }`.
- **Field alias mapping**: Normalizes `transaction_id`, `created_at`, `transaction_amount`, `fee`, etc.
- **Money normalization**: Safely parses major and minor decimal strings/numbers into integer minor units without floating-point arithmetic.
- **Timestamp normalization**: Supports ISO strings, Unix seconds, and Unix milliseconds.

To run the ingestion tests:
```sh
cd packages/ingestion
bun test
```

## Reconciliation Engine: Candidate Discovery (Phase 3A)

The `reconciliation-engine` package provides deterministic candidate discovery across canonical `FinancialRecord` arrays.

- **Purpose**: Generates potential relationship candidate pairs without making final match decisions.
- **Supported directional pairs**:
  - `ORDER -> PAYMENT`
  - `PAYMENT -> SETTLEMENT`
  - `PAYMENT -> REFUND`
  - `PAYMENT -> ADJUSTMENT`
  - `SETTLEMENT -> BANK_ENTRY`
- **Compatibility prerequisites**:
  - Exact currency match (`CURRENCY_COMPATIBLE`).
  - Valid timestamp ordering within 7 days / $604,800,000\text{ ms}$ (`TIME_WINDOW_COMPATIBLE`).
  - Pair-specific amount rules (`AMOUNT_COMPATIBLE`):
    - `ORDER -> PAYMENT`: Exact equality (`source.amount === target.amount`).
    - `PAYMENT -> SETTLEMENT`: Subset / equal (`target.amount <= source.amount`).
    - `PAYMENT -> REFUND`: Subset / equal (`target.amount <= source.amount`).
    - `PAYMENT -> ADJUSTMENT`: Absolute value bounded (`Math.abs(target.amount) <= source.amount`).
    - `SETTLEMENT -> BANK_ENTRY`: Exact equality (`source.amount === target.amount`).
- **Reference evidence**: Exact string match adds `EXACT_REFERENCE` (deterministic reason order: `EXACT_REFERENCE`, `CURRENCY_COMPATIBLE`, `AMOUNT_COMPATIBLE`, `TIME_WINDOW_COMPATIBLE`).
- **Ambiguity preservation**: Multiple candidates per source record are preserved without scoring or premature resolution.

To run the reconciliation engine tests:
```sh
cd packages/reconciliation-engine
bun test
```
