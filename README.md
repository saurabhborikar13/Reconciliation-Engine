# KoinX — Transaction Reconciliation Engine
### Complete Project Report & Documentation

> **Assignment:** Backend Intern Take-Home — KoinX  
> **Stack:** Node.js · Express · MongoDB (Mongoose) · Multer · csv-parser  
> **UI:** Vanilla HTML / CSS / JavaScript (no build step)  
> **Author:** Saurabh Borikar · B.Tech CSE, VNIT Nagpur (2023–27)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Live Architecture](#2-live-architecture)
3. [File & Folder Structure](#3-file--folder-structure)
4. [Setup & Running Locally](#4-setup--running-locally)
5. [Environment Variables](#5-environment-variables)
6. [Core Modules — Deep Dive](#6-core-modules--deep-dive)
   - 6.1 [Data Ingestion & Validation](#61-data-ingestion--validation)
   - 6.2 [Matching Engine](#62-matching-engine)
   - 6.3 [Reconciliation Report](#63-reconciliation-report)
7. [Database Schema](#7-database-schema)
8. [REST API Reference](#8-rest-api-reference)
9. [Web Dashboard — UI Guide](#9-web-dashboard--ui-guide)
10. [Configuration System](#10-configuration-system)
11. [How to Use — Step-by-Step Walkthrough](#11-how-to-use--step-by-step-walkthrough)
12. [CSV File Format](#12-csv-file-format)
13. [Error Handling & Data Quality](#13-error-handling--data-quality)
14. [Key Design Decisions](#14-key-design-decisions)

15. [Known Limitations & Future Improvements](#16-known-limitations--future-improvements)

---

## 1. Project Overview

The **KoinX Reconciliation Engine** solves a real problem in crypto accounting: when a user's own transaction records don't match what the exchange reports. Both datasets describe the same on-chain activity, but differ in timestamps (exchange latency), quantity precision (rounding), and even field semantics (a `TRANSFER_OUT` from the user's perspective is a `TRANSFER_IN` from the exchange's perspective).

This engine ingests both CSVs, validates every row, pairs matching transactions using a configurable tolerance algorithm, and produces a structured four-category report:

| Category | Meaning |
|---|---|
| **Matched** | Transactions successfully paired across both sources |
| **Conflicting** | Paired by time proximity but quantity differs beyond tolerance |
| **Unmatched (User only)** | Present in user file, no counterpart found in exchange file |
| **Unmatched (Exchange only)** | Present in exchange file, no counterpart found in user file |

All results are stored in MongoDB, accessible via REST API, and visualised in a full web dashboard that ships with the project.

---

## 2. Live Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (UI)                         │
│  public/index.html + style.css + app.js                     │
│  • Drag-and-drop CSV upload                                 │
│  • Tolerance sliders                                        │
│  • Tabbed report viewer with search + pagination            │
│  • CSV / JSON download                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │  HTTP (multipart/form-data + JSON)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Express Server                          │
│  server.js                                                  │
│  ├── CORS middleware (allow all origins)                    │
│  ├── Static file serving  →  public/                       │
│  └── /api  →  routes/reconcileRoutes.js                    │
│       ├── POST /reconcile   (Multer file upload)           │
│       ├── GET  /report/:id                                  │
│       ├── GET  /report/:id/summary                          │
│       └── GET  /report/:id/unmatched                       │
└──────┬───────────────┬───────────────────────────────────┬──┘
       │               │                                   │
       ▼               ▼                                   ▼
 csvParser.js     matcher.js                        validator.js
 (stream parse)   (tolerance matching)              (row validation)
       │               │
       ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                      MongoDB Atlas                          │
│  ├── Collection: transactions   (raw ingested rows)        │
│  ├── Collection: reconciliationruns  (run metadata)        │
│  └── Collection: reportentries  (output pairs + reasons)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. File & Folder Structure

```
koinx-reconciliation/
│
├── public/                        ←  Web Dashboard (served as static files)
│   ├── index.html                 ←  Single-page app shell
│   ├── style.css                  ←  All styles (dark theme, responsive)
│   └── app.js                     ←  All frontend JS logic
│
├── config/
│   └── database.js                ←  Mongoose connection + diagnostics
│
├── controllers/
│   └── reconcileController.js     ←  Handler logic for all 4 API endpoints
│
├── models/
│   ├── ReconciliationRun.js       ←  Run metadata schema
│   ├── Transaction.js             ←  Ingested row schema
│   └── ReportEntry.js             ←  Output entry schema
│
├── routes/
│   └── reconcileRoutes.js         ←  Express router + Multer config
│
├── utils/
│   ├── csvParser.js               ←  Streams CSV → validates → returns array
│   ├── matcher.js                 ←  Core matching algorithm
│   └── validator.js               ←  Per-row validation rules
│
├── uploads/                       ←  Temporary Multer storage (auto-generated)
│
├── .env                           ←  Local secrets (never commit to Git)
├── .gitignore
├── package.json
├── package-lock.json
├── server.js                      ←  Entry point
└── README.md
```

---

## 4. Setup & Running Locally

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9+
- A **MongoDB Atlas** account (free M0 tier is enough) — or a local MongoDB instance

### Steps

```bash
# 1. Clone your repo
git clone https://github.com/<your-username>/koinx-reconciliation.git
cd koinx-reconciliation

# 2. Install dependencies
npm install

# 3. Create your .env file (copy from .env.example or create fresh)
cp .env.example .env
# Then edit .env and fill in your MONGO_URI (see Section 5)

# 4. Start the server
npm start          # production
npm run dev        # development (auto-reload with nodemon)

# 5. Open the dashboard
# Visit http://localhost:3000 in your browser
```

The dashboard UI, API, and static files are all served from the **same process on the same port**. No separate frontend server is needed.

---

## 5. Environment Variables

All configuration lives in `.env`. **Never commit this file to GitHub.**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `MONGO_URI` | *(required)* | Full MongoDB connection string from Atlas |
| `TIMESTAMP_TOLERANCE_SECONDS` | `300` | Default max time delta (seconds) for matching |
| `QUANTITY_TOLERANCE_PCT` | `0.01` | Default max quantity deviation (%) for matching |

### Example `.env`

```env
PORT=3000
MONGO_URI=mongodb+srv://youruser:yourpassword@cluster0.mongodb.net/koinx?retryWrites=true&w=majority
TIMESTAMP_TOLERANCE_SECONDS=300
QUANTITY_TOLERANCE_PCT=0.01
```

### Configuration Priority

When running a reconciliation, tolerances are resolved in this order (highest wins):

```
Request body params  >  .env variables  >  Built-in defaults
```

This means you can override tolerances per-run without touching the environment.

---

## 6. Core Modules — Deep Dive

### 6.1 Data Ingestion & Validation

**Files:** `utils/csvParser.js` · `utils/validator.js`

The ingestion pipeline streams the uploaded CSV file row-by-row using `csv-parser`. For each row, `validateTransaction()` is called synchronously before the row is accepted.

#### Validation Rules

| Field | Rule |
|---|---|
| `transaction_id` | Must be present and non-empty |
| `asset` | Must be present and non-empty |
| `type` | Must be present and non-empty |
| `timestamp` | Must be present, parseable as a `Date`, and not end with `T` (truncated ISO strings) |
| `quantity` | Must be a valid number greater than zero |

Rows that fail **any** rule are:
- **Not silently dropped** — they still enter the database as `isValid: false`
- Flagged in the report under the appropriate "Unmatched" category with a `reason` beginning `"Data Quality Flag: …"` that lists every specific error

#### Normalisation on Ingest

- Quantity is parsed to `Number`
- Timestamp is stored both as the raw string (`timestamp`) and as a parsed `Date` (`parsedTimestamp`) for fast arithmetic in the matcher
- `type` is uppercased
- `fee` defaults to `0` if absent or non-numeric
- `price_usd` is `null` if absent or non-numeric

---

### 6.2 Matching Engine

**File:** `utils/matcher.js`

The core of the project. Implements a **two-pass greedy nearest-neighbour** algorithm.

#### Pass 1 — Filter invalid rows

Invalid rows from both sources are immediately routed to the report as Unmatched with their validation errors. Only valid rows proceed to the matching pool.

#### Pass 2 — Match each user transaction

For every valid user transaction, the engine finds candidate exchange transactions by applying **hard filters** (must all pass) and then a **soft sort** (pick best):

```
Hard Filters (eliminate non-candidates):
  1. Exchange row not already claimed by a previous match
  2. Asset must match (case-insensitive, with alias normalisation)
  3. Type must be compatible (exact OR perspective-flipped — see below)
  4. |Δtime| ≤ TIMESTAMP_TOLERANCE_SECONDS

Soft Sort (among remaining candidates):
  → Sort by |Δtime| ascending  →  pick [0] (closest in time)

Tolerance Check (on best candidate):
  → Δqty% = |user.qty - exch.qty| / user.qty × 100
  → If Δqty% ≤ QUANTITY_TOLERANCE_PCT  →  Matched
  → If Δqty% >  QUANTITY_TOLERANCE_PCT  →  Conflicting
```

If **no candidates** remain after the hard filters, the user transaction is reported as `Unmatched (User only)`.

#### Pass 3 — Remaining exchange rows

Any exchange transaction not claimed during Pass 2 is reported as `Unmatched (Exchange only)`.

#### Asset Normalisation

```
bitcoin  →  btc
BITCOIN  →  btc
BTC      →  btc
ETH      →  eth
(all others lowercased)
```

#### Type Compatibility

| User Type | Exchange Type | Compatible? |
|---|---|---|
| `BUY` | `BUY` | ✅ Yes |
| `SELL` | `SELL` | ✅ Yes |
| `TRANSFER_OUT` | `TRANSFER_IN` | ✅ Yes (perspective flip) |
| `TRANSFER_IN` | `TRANSFER_OUT` | ✅ Yes (perspective flip) |
| `BUY` | `SELL` | ❌ No |
| anything else mismatched | — | ❌ No |

The perspective flip is the key insight: when a user sends crypto out, their record says `TRANSFER_OUT`; the exchange records it as `TRANSFER_IN` from the receiving side. These are the same transaction and must be matched.

---

### 6.3 Reconciliation Report

**File:** `controllers/reconcileController.js`

After the matching engine runs, every result is stored as a `ReportEntry` document in MongoDB. Each entry contains:

- `category` — one of the four result types
- `reason` — human-readable explanation (includes numeric deltas for matched/conflicting)
- `userTransaction` — embedded snapshot of the user-side row (or `null`)
- `exchangeTransaction` — embedded snapshot of the exchange-side row (or `null`)

The report can be retrieved as **JSON** or **CSV**. The CSV format interleaves both transaction sides side-by-side with `user_` and `exchange_` column prefixes.

---

## 7. Database Schema

### `ReconciliationRun`

Tracks metadata about each run.

```js
{
  status:  "processing" | "completed" | "failed",
  config: {
    timestampToleranceSeconds: Number,
    quantityTolerancePct:      Number
  },
  summary: {
    matched:          Number,
    conflicting:      Number,
    unmatchedUser:    Number,
    unmatchedExchange: Number
  },
  error:      String,   // populated if status === "failed"
  createdAt:  Date,
  updatedAt:  Date
}
```

---

### `Transaction`

One document per CSV row from either source. Linked to a run.

```js
{
  runId:            ObjectId,       // ref: ReconciliationRun
  source:           "user" | "exchange",
  transaction_id:   String,
  timestamp:        String,         // raw string from CSV
  parsedTimestamp:  Date,           // parsed for fast arithmetic
  type:             String,         // uppercased
  asset:            String,
  quantity:         Number,
  price_usd:        Number | null,
  fee:              Number,
  note:             String,
  isValid:          Boolean,
  validationErrors: [String]        // empty if valid
}
// Indexes: { runId, source, isValid }
```

---

### `ReportEntry`

One document per output row. Linked to a run.

```js
{
  runId:               ObjectId,    // ref: ReconciliationRun
  category:            String,      // one of 4 category strings
  reason:              String,
  userTransaction:     Mixed | null,
  exchangeTransaction: Mixed | null
}
// Indexes: { runId, category }
```

The `Mixed` type stores a snapshot of the full transaction object at match time — this means even if transactions are deleted, report entries remain self-contained and queryable.

---

## 8. REST API Reference

Base URL: `http://localhost:3000/api`

---

### `POST /api/reconcile`

Trigger a new reconciliation run.

**Request** — `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `user_file` | File (.csv) | ✅ | User transactions CSV |
| `exchange_file` | File (.csv) | ✅ | Exchange transactions CSV |
| `TIMESTAMP_TOLERANCE_SECONDS` | Number | ❌ | Override env default |
| `QUANTITY_TOLERANCE_PCT` | Number | ❌ | Override env default |

**Response `201`**

```json
{
  "runId": "664abc123def456789012345",
  "config": {
    "timestampToleranceSeconds": 300,
    "quantityTolerancePct": 0.01
  },
  "summary": {
    "matched": 42,
    "conflicting": 3,
    "unmatchedUser": 5,
    "unmatchedExchange": 2
  }
}
```

**Response `400`** — missing files  
**Response `500`** — processing error (run saved with `status: "failed"`)

---

### `GET /api/report/:runId`

Fetch the full reconciliation report.

| Query Param | Values | Effect |
|---|---|---|
| `format` | `csv` | Returns CSV file download instead of JSON |

**Response `200` (JSON)**

```json
{
  "runId": "...",
  "summary": { ... },
  "report": [
    {
      "category": "Matched",
      "reason": "Reconciliation verified. Delta time: 12s, Delta quantity: 0.0000%",
      "userTransaction": { "transaction_id": "U001", "asset": "BTC", ... },
      "exchangeTransaction": { "transaction_id": "E001", "asset": "btc", ... }
    },
    ...
  ]
}
```

---

### `GET /api/report/:runId/summary`

Fetch only the counts.

**Response `200`**

```json
{
  "runId": "...",
  "status": "completed",
  "summary": {
    "matched": 42,
    "conflicting": 3,
    "unmatchedUser": 5,
    "unmatchedExchange": 2
  }
}
```

---

### `GET /api/report/:runId/unmatched`

Fetch only unmatched rows (both user-only and exchange-only) with reasons.

**Response `200`**

```json
{
  "runId": "...",
  "count": 7,
  "unmatched": [
    {
      "category": "Unmatched (User only)",
      "reason": "No counterpart transaction discovered within time window tolerance boundaries.",
      "userTransaction": { ... },
      "exchangeTransaction": null
    },
    ...
  ]
}
```

---

## 9. Web Dashboard — UI Guide

The dashboard is available at `http://localhost:3000` once the server is running. It's a single-page app with no build step or external framework — just HTML, CSS, and vanilla JS served as static files by Express.

### Layout Overview

```
┌─────────────────────────────────────────────┐
│  ⬡ KoinX   Reconciliation Engine   ● API   │  ← Header / status dot
├─────────────────────────────────────────────┤
│  Transaction                                │
│  Reconciliation          ← Hero section     │
├─────────────────────────────────────────────┤
│  New Reconciliation Run         [POST /api] │
│  ┌──────────────┐  ⇄  ┌──────────────────┐ │
│  │ User CSV     │     │ Exchange CSV     │ │  ← Drag-and-drop zones
│  └──────────────┘     └──────────────────┘ │
│  TIMESTAMP_TOLERANCE_SECONDS  [300] ───●──  │  ← Slider + input
│  QUANTITY_TOLERANCE_PCT       [0.01] ──●─   │
│  API Base URL  [http://localhost:3000]       │
│                         [Run Reconciliation] │
├─────────────────────────────────────────────┤
│  ┌──────────┐┌──────────┐┌────────┐┌──────┐ │
│  │ 42       ││  3       ││   5    ││  2   │ │  ← Summary cards (clickable)
│  │ Matched  ││Conflicting││U.Only ││E.Only│ │
│  └──────────┘└──────────┘└────────┘└──────┘ │
│  [Matched][Conflicting][Unmatched..][Quality]│  ← Tabs
│  🔍 Search…                [↓CSV] [↓JSON]   │
│  ┌─────────────────────────────────────────┐ │
│  │ Category │ Reason │ User·ID │ Exch·ID…  │ │  ← Table with all fields
│  │ ...      │ ...    │ ...     │ ...       │ │
│  └─────────────────────────────────────────┘ │
│  ← 1  2  3  →   (52 entries)                 │  ← Pagination
├─────────────────────────────────────────────┤
│  Lookup Previous Run        [GET /api/report]│
│  [Paste a Run ID…]          [Fetch Report]   │
└─────────────────────────────────────────────┘
```

---

### Feature-by-Feature

#### API Status Dot (top-right of header)
- Probes `GET /` every 15 seconds
- 🟢 Green = server reachable · 🔴 Red = server unreachable

#### File Upload Zones
- Click to open a file picker, or **drag and drop** a CSV directly onto the zone
- Zone border turns green and the filename appears when a file is selected
- Both `user_file` and `exchange_file` are required before submission

#### Tolerance Controls
- Each tolerance has a **number input** and a **range slider** — they stay in sync
- Timestamp: 0–3600 seconds range, step 10
- Quantity: 0–5%, step 0.001

#### API Base URL
- Defaults to `http://localhost:3000`
- Change this to your deployed URL (e.g. `https://koinx.onrender.com`) before running

#### Run Button
- Sends `multipart/form-data` to `POST /api/reconcile`
- Shows animated progress bar with stage labels (uploading → ingesting → matching → fetching report)
- Button disables and shows spinner while running

#### Summary Cards
- Display `matched / conflicting / unmatchedUser / unmatchedExchange` counts
- **Clicking a card switches to that tab** (same as clicking the tab button)
- Active card has a coloured bottom border matching the category colour

#### Tabs
| Tab | Shows |
|---|---|
| Matched | Successfully paired rows |
| Conflicting | Paired but quantity out of tolerance |
| Unmatched (User) | User rows with no exchange counterpart |
| Unmatched (Exchange) | Exchange rows with no user counterpart |
| Data Quality | Rows flagged during validation (from either source) |

#### Search
- Filters across all fields in the active tab's entries (full JSON search)
- Resets pagination to page 1 on each keystroke

#### Table
- Columns: `Category · Reason · User.{id, timestamp, type, asset, quantity, price_usd, fee} · Exch.{same}`
- Category shown as a colour-coded pill: 🟢 Matched · 🟠 Conflicting · 🟡 User Only · 🔵 Exch Only
- Long text truncated with tooltip on hover
- Horizontally scrollable for wide datasets

#### Pagination
- 20 rows per page
- Smart page range (first + last + ±2 around current, with ellipsis)

#### Download CSV
- Hits `GET /api/report/:runId?format=csv` → browser triggers file download
- Includes all categories, both transaction sides, as a flat CSV

#### Download JSON
- Exports the **currently filtered tab** as JSON to your local machine (no server round-trip)

#### Lookup Previous Run
- Enter any MongoDB ObjectId from a previous run
- Fetches summary + full report and renders it exactly as a fresh run would

---

## 10. Configuration System

Tolerances can be set at three levels:

### Level 1 — Per-run (highest priority)
Pass as form fields in `POST /api/reconcile`:
```
TIMESTAMP_TOLERANCE_SECONDS=60
QUANTITY_TOLERANCE_PCT=0.5
```
The UI's slider controls do exactly this.

### Level 2 — Environment defaults
Set in `.env` or as system environment variables:
```
TIMESTAMP_TOLERANCE_SECONDS=300
QUANTITY_TOLERANCE_PCT=0.01
```

### Level 3 — Hard-coded defaults (lowest priority)
If neither of the above is set, the engine uses `300s` and `0.01%`.

### Resolution logic (from `reconcileController.js`)

```js
const tsTol = parseInt(req.body.TIMESTAMP_TOLERANCE_SECONDS)
           || parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS)
           || 300;

const qtyTol = parseFloat(req.body.QUANTITY_TOLERANCE_PCT)
            || parseFloat(process.env.QUANTITY_TOLERANCE_PCT)
            || 0.01;
```

---

## 11. How to Use — Step-by-Step Walkthrough

### First-time setup

```
1. Clone repo → npm install → edit .env → npm start
2. Open http://localhost:3000
```

### Running a reconciliation

```
Step 1 — Upload files
  Drag user_transactions.csv onto the left zone
  Drag exchange_transactions.csv onto the right zone
  Both zones should turn green with filenames shown

Step 2 — Set tolerances (optional)
  Drag timestamp slider or type a value (default: 300 seconds)
  Drag quantity slider or type a value (default: 0.01%)

Step 3 — Click "Run Reconciliation"
  Progress bar appears: uploading → ingesting → matching → fetching
  Takes 1–5 seconds for typical datasets

Step 4 — Read the summary cards
  Matched      = ✅ pairs found (these are good)
  Conflicting  = ⚠️ pairs found but quantity differs (needs review)
  User Only    = ❌ no exchange counterpart (possible missing data)
  Exch Only    = ❌ no user counterpart (possible missing data)

Step 5 — Browse the tabs
  Click each tab or click the summary cards to switch
  Use the search box to filter by asset, ID, date, etc.

Step 6 — Download the report
  "↓ Download CSV" → full report as spreadsheet
  "↓ Download JSON" → current tab as JSON
```

### Re-fetching an old run

```
  Copy the Run ID shown in the meta bar (or from a previous response)
  Scroll to "Lookup Previous Run" panel at the bottom
  Paste the ID → click "Fetch Report"
  Full report loads exactly as before
```

### Using the API directly (cURL)

```bash
# Run reconciliation
curl -X POST http://localhost:3000/api/reconcile \
  -F "user_file=@user_transactions.csv" \
  -F "exchange_file=@exchange_transactions.csv" \
  -F "TIMESTAMP_TOLERANCE_SECONDS=120" \
  -F "QUANTITY_TOLERANCE_PCT=0.5"

# Get full report (JSON)
curl http://localhost:3000/api/report/<runId>

# Get full report (CSV download)
curl http://localhost:3000/api/report/<runId>?format=csv -o report.csv

# Get summary only
curl http://localhost:3000/api/report/<runId>/summary

# Get unmatched rows only
curl http://localhost:3000/api/report/<runId>/unmatched
```

---

## 12. CSV File Format

Both input files must have the following columns (header row required):

| Column | Type | Notes |
|---|---|---|
| `transaction_id` | String | Unique identifier for the transaction |
| `timestamp` | String | ISO 8601 recommended (e.g. `2024-01-15T10:30:00Z`) |
| `type` | String | `BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT` |
| `asset` | String | e.g. `BTC`, `ETH`, `Bitcoin` — case-insensitive |
| `quantity` | Number | Must be positive |
| `price_usd` | Number | Optional — ignored in matching |
| `fee` | Number | Optional — defaults to 0 if absent |
| `note` | String | Optional free-text |

### Example rows

```csv
transaction_id,timestamp,type,asset,quantity,price_usd,fee,note
U001,2024-01-15T10:30:00Z,BUY,BTC,0.5,42000.00,10.50,Market buy
U002,2024-01-15T11:00:00Z,TRANSFER_OUT,ETH,2.0,2500.00,0.50,Cold wallet
U003,2024-01-16T09:15:00Z,SELL,BTC,0.25,43500.00,8.75,Profit taking
```

### Intentionally messy data the engine handles

The input data is intentionally noisy. The engine handles:

| Issue | Handling |
|---|---|
| Mixed case assets (`Bitcoin`, `bitcoin`, `BTC`) | Normalised to lowercase |
| `TRANSFER_OUT` vs `TRANSFER_IN` perspective flip | Mapped as compatible types |
| Timestamps with minor offsets (exchange latency) | Configurable window tolerance |
| Quantity rounding differences | Configurable % tolerance |
| Missing or blank fields | Flagged with specific validation error, not dropped |
| Malformed timestamps (e.g. truncated `…T`) | Caught and flagged |
| Negative or zero quantity | Caught and flagged |
| Non-numeric quantity or price | Caught and flagged |

---

## 13. Error Handling & Data Quality

### Validation errors — never silently dropped

Every invalid row appears in the report. The `reason` field always starts with `"Data Quality Flag:"` followed by a pipe-separated list of all errors for that row.

Examples:
```
Data Quality Flag: Missing transaction_id | Invalid numeric quantity structure: abc
Data Quality Flag: Malformed timestamp detected: "2024-01-15T"
Data Quality Flag: Negative or zero quantity violation: -0.5
```

### API-level errors

| Scenario | HTTP Status | Error Response |
|---|---|---|
| Missing one or both CSV files | `400` | `{ "error": "Multipart attachment fields user_file and exchange_file required." }` |
| Invalid run ID format | `500` | `{ "error": "Fetch failed.", "details": "..." }` |
| Run ID not found | `404` | `{ "error": "Record execution tracking tag missing." }` |
| MongoDB connection failure | Server exits with diagnostic | See `config/database.js` |
| Any unhandled processing error | `500` | Run saved as `failed` with `error` field |

### Database connection diagnostics

`config/database.js` detects and logs the root cause of connection failures:

- `ENOTFOUND` → DNS resolution failure / IP not whitelisted in Atlas
- `auth failed` → Bad username or password in connection string
- Other → Malformed connection string

---

## 14. Key Design Decisions

### Why greedy nearest-neighbour matching?

A simpler alternative (strict ID matching) would miss most real-world pairs since IDs differ between user and exchange records. The greedy nearest-neighbour approach processes each user transaction once, finds the best available exchange counterpart within the time window, and claims it. This is O(n × m) where n = user rows and m = exchange rows, which is acceptable for the typical dataset sizes in crypto reconciliation (thousands, not millions, of rows per run).

### Why embed transaction snapshots in ReportEntry?

The `userTransaction` and `exchangeTransaction` fields in `ReportEntry` store a full copy of the transaction data at match time, not just a reference ID. This makes the report self-contained — it can be queried and rendered without joining across collections — and ensures report entries remain valid even if the `Transaction` collection is pruned.

### Why not use a transaction ID join?

Exchange and user exports often assign different internal IDs to the same real-world event. Relying on ID matching would fail for the majority of cross-source pairs. Temporal + asset + type proximity is a more robust signal for this domain.

### Why store raw timestamp string alongside parsed Date?

Raw string is preserved for display and CSV export fidelity. Parsed `Date` is stored for fast millisecond arithmetic in the matcher without re-parsing on every comparison.

### Why serve the UI from Express instead of a separate frontend server?

For an assignment/demo, a single process on a single port is far easier to deploy and configure. The `public/` folder is served as static files by Express — no separate Vite dev server, no build step, no port coordination. Everything runs on `http://localhost:3000`.

### Why vanilla JS for the UI (no React/Vue)?

Zero build tooling needed. The dashboard is a single `.html` file + `.css` file + `.js` file. Anyone who clones the repo and runs `npm start` immediately gets the full UI — no `npm run build`, no node version mismatch in the frontend toolchain, no bundler config.

---



## 15. Known Limitations & Future Improvements

### Current Limitations

| Limitation | Notes |
|---|---|
| No auth on API endpoints | Any user with the URL can trigger runs and read reports |
| Multer stores uploads as temp files | Files are not cleaned up automatically after processing |
| Greedy matching can be suboptimal | If two user transactions compete for the same exchange match, the one processed first wins |
| No pagination on API responses | `/report/:runId` returns all entries at once; large runs could be slow |
| `TRANSFER_IN` / `TRANSFER_OUT` is the only mapped type pair | Other platform-specific synonyms (`DEPOSIT` / `WITHDRAWAL`) are not handled |

### Possible Improvements

- **Optimal bipartite matching** (Hungarian algorithm) instead of greedy, for better pair quality
- **Fuzzy asset matching** using an external coin registry (e.g. CoinGecko IDs)
- **Bulk pagination** on `GET /report` with cursor-based pagination for large datasets
- **Async processing** — move reconciliation to a background job (BullMQ + Redis) and poll for completion instead of blocking the HTTP request
- **Run history UI** — list all previous runs in the dashboard with timestamps and summaries
- **Auth** — JWT or API key protection on all endpoints
- **Automatic upload cleanup** — delete temp files from `uploads/` after ingestion
- **More type mappings** — `DEPOSIT` ↔ `TRANSFER_IN`, `WITHDRAWAL` ↔ `TRANSFER_OUT`, etc.

---

*End of report.*

---


> All code is original and written specifically for this submission.
