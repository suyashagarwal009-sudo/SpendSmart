# SmartSpend Intelligence — Design Document

**Status:** Proposal — not yet implemented.
**Depends on:** Phases 3 (expense data in JS), 4 (API), 5 (MongoDB).
**Implements:** Phases 7a/7b (intelligence endpoints + AI narrative).
**Last updated:** 31 Oct 2026

---

## 1. Feature Definition

SmartSpend Intelligence analyses a student's recorded expense history and produces:

1. **Month-over-month comparison** — current vs previous month, per category, with absolute and percentage change.
2. **End-of-month prediction** — a transparent statistical estimate of total current-month spending.
3. **Overspending alerts** — early warnings, with data-backed reasons, when projected spending is likely to exceed the monthly budget.
4. **AI-generated narrative** — plain-language explanation of *why* spending patterns changed and *what* the student can do, produced by an LLM API called from the backend.

### Differentiation (framing for the faculty submission)

Other apps offer single-month dashboards or static budget alerts. SpendSmart's value is the **combination** of:

- student-oriented expense tracking,
- historical month-over-month comparison,
- transparent statistical end-of-month prediction,
- early overspending detection with data-backed reasons,
- personalized AI explanations and budgeting recommendations.

We are not claiming this is a novel invention; the contribution is the working, integrated system with a defined, verifiable prediction method and a strict AI-only-interpretation boundary (Section 4.5).

---

## 2. Data Requirements

The intelligence feature needs **only what the Expense model already stores plus the month context**. No new user fields are required.

### 2.1 Minimum required per-expense fields

| Field | Type | Used for |
|---|---|---|
| amount | decimal (₹) | All calculations |
| category | enum (6 values) | Category-wise aggregation |
| date | ISO date | Month bucketing, days-elapsed |
| title | string | Cited in alert reasons ("₹1,400 on Shopping — 'New headphones'") |
| paymentMethod | enum | Optional secondary slice |

### 2.2 Data needed for each module

| Module | Data required |
|---|---|
| Month comparison | Expenses in month **M** and **M−1**; budget for **M** |
| Prediction | Expenses in month **M** (with dates), monthly totals for **M−1, M−2, M−3**, current budget, days elapsed in **M** |
| Alerts | All of the above + user's budget for **M** |
| AI narrative | The *results* of the three calculations above (never raw full history unless compactly summarized) |

### 2.3 Data quality rules the backend must enforce

- Expenses belong to a single user (per-student dataset).
- Amounts ≥ 0, dates valid and not in the future.
- A month with zero expenses is treated as **missing data**, not as ₹0, for prediction weighting.
- Timezone: store dates as UTC; bucket by calendar month in UTC. (Note: a future option is to store a `user_tz` field on the user profile; out of scope now.)

### 2.4 Data sufficiency thresholds

| Situation | Behavior |
|---|---|
| 0 prior months of data | Prediction = naive linear (days-elapsed only). Label: "Based on this month's spending so far." |
| 1 prior month | Blend naive + prior-month average, weighted 70/30. Label: "Adjusted with last month's pattern." |
| 2+ prior months | Full weighted blend (Section 4.2). |
| < 5 expenses in the current month so far | Prediction is still shown but flagged low-confidence ("Only a few expenses recorded this month"). |
| No budget set | Alerts 2/3 disabled with a "Set a monthly budget to enable budget alerts" notice. |

---

## 3. Database Structure & Backend APIs

### 3.1 Mongoose models (Phase 5)

**Expense**
```js
{
  user:      { type: ObjectId, ref: 'User', required: true, index: true },
  title:     { type: String, required: true, trim: true, maxlength: 80 },
  amount:    { type: Number, required: true, min: 0 },
  category:  { type: String, enum: ['Food','Transport','Shopping','Education','Entertainment','Other'], required: true },
  date:      { type: Date, required: true },
  paymentMethod: { type: String, enum: ['Cash','Card','UPI','Wallet'], default: 'Cash' },
  createdAt: Date, updatedAt: Date
}
// compound index: { user: 1, date: -1 }  ← supports the intelligence queries
```

**Budget**
```js
{
  user:   { type: ObjectId, ref: 'User', required: true },
  month:  { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/, required: true }, // "YYYY-MM"
  amount: { type: Number, required: true, min: 0 },
  // unique index on { user, month }
}
```
Storing budget **per month** (not a single rolling value) is what makes month-over-month budget-aware alerts possible.

### 3.2 REST API (Phase 4, plus intelligence endpoints in Phase 7a)

| Method & Path | Purpose | Phase |
|---|---|---|
| `POST /api/expenses` | Create expense | 4 |
| `GET /api/expenses?from=&to=&category=` | List/filter | 4 |
| `PUT /api/expenses/:id` | Edit | 4 |
| `DELETE /api/expenses/:id` | Delete | 4 |
| `GET /api/budget` / `POST /api/budget` | Current month budget get/set | 4 |
| `GET /api/summary/:month` | Totals per category, budget, remaining | 4 |
| **`GET /api/intelligence/compare`** | Month-over-month comparison | 7a |
| **`GET /api/intelligence/predict`** | End-of-month prediction | 7a |
| **`GET /api/intelligence/alerts`** | Active alerts with reasons | 7a |
| **`POST /api/intelligence/insight`** | AI narrative (server-side AI call) | 7b |

The three `GET /intelligence/*` endpoints contain **zero AI calls** — they are pure computation and are individually testable without any API key. `POST /insight` is the only endpoint that touches the AI API, and only after the calculations exist.

### 3.3 Example response shape (`GET /intelligence/compare`)

```json
{
  "month": "2026-10", "previousMonth": "2026-09",
  "totalCurrent": 4350, "totalPrevious": 3200,
  "totalChange": { "absolute": 1150, "percent": 35.9 },
  "categories": [
    { "category": "Food", "current": 3200, "previous": 2000,
      "absolute": 1200, "percent": 60.0, "trend": "up", "rank": 1 },
    { "category": "Transport", "current": 500, "previous": 500,
      "absolute": 0, "percent": 0, "trend": "flat" }
  ],
  "dataSufficient": true
}
```

---

## 4. Prediction Methodology & AI Usage

### 4.1 Method A — Naive days-elapsed projection (always available)

```
daysElapsed   = today's day-of-month (UTC)
totalSoFar    = sum of this month's expenses
naiveForecast = totalSoFar × (daysInMonth / daysElapsed)
```

Transparent, explainable, works from day 1. Honest limitation: students do not spend uniformly (month-end is usually heavier — rent, subscriptions, exam-season shopping), so we blend:

### 4.2 Method B — History-blended prediction (improves with data)

```
histForecast  = weighted average of total spend in the last 3 completed months
                (newest month weighted 2×, older months 1×)
weight        = min(1, priorCompletedMonths / 2)     // 0 → 1 as data grows
forecast      = (1 − weight) × naiveForecast + weight × histForecast
```

With 0 prior months, weight = 0 → pure Method A. With 2+ prior months, weight = 1 → history dominates, but `naiveForecast` still anchors it so a suddenly quiet start of month doesn't produce a wildly low forecast.

**Confidence note shown to the user:** the UI displays both numbers — "Spent so far: ₹X by day D of M" and "Predicted month-end: ₹Y (estimate, ±15% typical)". The ±15% comes from a simple validation of the method against completed months in the user's own data: for each completed month, recompute the forecast at day 25 and measure error; the displayed band is the observed max error, capped at 30%.

### 4.3 Alert rules (all computed in backend, deterministic)

| # | Rule | Fires when | Reason text cites |
|---|---|---|---|
| 1 | Category surge | Category spend so far this month > 1.25 × that category's completed-month average (needs ≥1 prior month) | top expenses in that category this month |
| 2 | Budget projection | `forecast > budget` | projected total vs budget, days remaining |
| 3 | Budget already breached | `totalSoFar > budget` | the specific large items that pushed it over |
| 4 | Fast burn rate | `totalSoFar / daysElapsed > budget / daysInMonth` by > 30% | pace vs budget |

Alerts are ordered by severity (3 > 4 > 2 > 1) and deduplicated (a category with rule 1 and a month with rule 2 both fire; they are separate messages, not one).

### 4.4 AI usage boundary — the strict rule

The AI API is called **once**, from `POST /api/intelligence/insight`, with a compact, pre-computed payload:

```json
{
  "user": { "budget": 5000, "month": "2026-10", "daysElapsed": 12 },
  "totals": { "soFar": 2800, "forecast": 6100 },
  "compare": { "biggestRiser": { "category": "Food", "current": 3200, "previous": 2000, "percent": 60 },
               "topExpenseItems": [ {"title": "New headphones", "amount": 999, "category": "Shopping"} ] },
  "activeAlerts": ["rule-1-Food", "rule-2-budget"]
}
```

The system prompt tells the model: *You are given verified spending figures. Do not invent expenses, amounts, or categories. Use only the figures provided. Write a short, plain-language summary for a student: why spending is up, and 2–4 concrete, practical suggestions. If data is insufficient, say so.*

### 4.5 Why this design matters (academic angle)

- **Numbers are deterministic and unit-testable.** Every rupee shown came from backend code, not the LLM.
- **The LLM adds interpretation only.** If the AI call fails or times out, the dashboard still shows full comparison charts, prediction, and alerts — the narrative panel shows "AI summary unavailable right now" and the numbers are never blank.
- **Response validation:** the AI reply is parsed; if it contains a number not present in the input payload (regex check on ₹ amounts), the response is rejected and the fallback message is shown. This is the "AI must not invent figures" guard, implemented as a concrete testable check.
- **Key security:** the Anthropic API key lives in `server/.env`, loaded by `dotenv`, never sent to the browser, and `.env` is git-ignored.

### 4.6 Model & cost note (to confirm in Phase 7b)

Default: `claude-sonnet`-class model (cheap, fast, sufficient for 200–400-word narratives). The call is user-initiated ("Get AI insights" button) and rate-limited to one per minute per user, so demo costs are negligible. Exact model choice is a Phase 7b decision.

---

## 5. Dashboard Integration (no design changes)

All four modules live inside the **existing `#insights` section** ("Spending Charts & AI Insights"). That section is already a dashed-border card — it becomes a 2×2 grid of four sub-panels (stacking to 1 column on mobile via the existing `prefers` breakpoints and the same CSS variables):

```
┌───────────────────────────── #insights ─────────────────────────────┐
│ 1. Month Comparison     │ 2. This Month's Forecast                  │
│    bar pairs per cat    │    spent-so_far vs predicted vs budget    │
│    (this month vs prev) │    + progress bar against budget          │
│                         │                                           │
│ 3. Smart Alerts         │ 4. AI Insights (narrative panel)         │
│    list of rule alerts   │    "Get AI insights" button → loading →  │
│    each with a why-line  │    200-word summary + suggestions        │
└──────────────────────────────────────────────────────────────────────┘
```

- **Charts:** rendered in Phase 6 with the chart library chosen then (Recharts for React — it pairs with Vite/React cleanly and ships no backend dependency). Phase 3 pre-emptively uses the *same data shape* (plain arrays of `{category, current, previous}`) so the migration is drop-in.
- **Styling:** new panels reuse existing CSS variables (`--color-primary`, `--color-danger`, card radius/shadow) — no new design language. Alert colors: amber for surge, red for breach.
- **The rest of the dashboard is untouched.** Header, summary cards, forms, table stay as-is.

---

## 6. Roadmap Integration

| Phase | Work | Status |
|---|---|---|
| 3 | Expense add/edit/delete via localStorage + budget + filters + summary cards | Next |
| 4 | Express CRUD API + `/summary` + `/budget` | Planned |
| 5 | MongoDB + Mongoose (Expense/Budget models as in §3.1) | Planned |
| 6 | React (Vite) rebuild; charts via Recharts | Planned |
| **7a** | **Intelligence engine**: `compare`, `predict`, `alerts` endpoints + server-side prediction module (pure functions, fully unit-testable with Jest — **no AI key needed to build or demo this**) | New |
| **7b** | **AI narrative**: `POST /insight` with validated prompt, key in `.env`, graceful fallback | New |
| 8 | Tests (including the eval suite in §7), CI, deployment | Planned |

Key property: **7a is demoable without any AI API** — the whole quantitative intelligence (comparison, prediction, alerts) works on deterministic code. 7b layers the narrative on top.

---

## 7. Evaluation Plan — Measurable Test Cases

### 7.1 Unit tests: prediction accuracy (Jest, deterministic fixtures)

For each of 12 synthetic 3-month histories, compute the forecast at day 25, compare to the actual month-end total:

| Metric | Target |
|---|---|
| Mean Absolute Percentage Error (MAPE) vs actual month-end | < 20% |
| Worst-case error | < 40% |
| Naive-only baseline MAPE (to prove blending helps) | measured; blended must beat it on ≥ 10/12 scenarios |

Scenario coverage: flat spender, month-end spender, category shift, new student (no history), mid-month gap month.

### 7.2 Integration tests: alerts

- Rule 1 fires iff category spend > 125% of prior-month average (fixture: 2 categories up, 4 down → exactly 1 alert, correct category).
- Rule 3 fires iff `totalSoFar > budget` and names at least one real expense title from the dataset.
- No budget set → no budget alerts, UI shows the "set a budget" notice (assert the endpoint's response field `budgetSet: false`).

### 7.3 AI-response validation tests

- Feed the insight endpoint a mocked AI reply containing a fabricated amount (₹777 not in payload) → response rejected, fallback shown. (Deterministic test, no real key.)
- Mocked API 500/timeout → `aiStatus: "unavailable"`, all quantitative data still returned.
- All three tests run in CI without an API key.

### 7.4 Utility evaluation (run before the faculty demo, documented in README)

- Seed 3 synthetic student datasets with known "stories" (student A quietly rising in Food; student B over-budget on Entertainment; student C under budget).
- Verify each dataset produces (a) the correct biggest-riser, (b) the correct alert set, (c) an AI narrative that mentions the intended story with no invented figures.
- A 5-point rubric (relevance, accuracy, actionability, tone, no-hallucinated-numbers) scored by two group members on 10 real-narrative samples; target ≥ 4/5 average. This rubric goes in the submission as the feature's evaluation evidence.

---

## 8. Open Questions (to confirm before Phase 7)

1. **AI provider**: Anthropic Claude (default, matches the course title) — confirm; key comes from the group's account.
2. **Per-user data**: Phase 5 — single demo user (simplest, faculty-friendly) or full auth? Recommend single user + student-id picker for demo.
3. **Currency**: fixed ₹ for now (confirmed by existing UI) — i18n not needed.
4. **Prediction horizon band (±15% default)**: confirm the displayed "estimate" label wording with faculty — it must be explicit that figures are predictions, not commitments.
