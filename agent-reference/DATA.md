# DATA.md

Column-level truth for the three dataset files. **Every fact below was verified by reading the actual CSVs, not inferred from the problem statement.**

> Read this before writing any code that touches the data. Hallucinated column names are the fastest way to lose an hour in an AI-assisted build. If a column is not listed here, **it does not exist** — see §5.

---

## 1. `resolved_tickets.csv` — 300 rows, 7 columns

The precedent corpus. This is the entire memory of the system.

**Columns:** `ticket_id`, `category`, `description`, `resolution_action`, `resolution_note`, `time_to_resolve_min`, `csat`

| Column | Type | Meaning | Verified range / values |
|---|---|---|---|
| `ticket_id` | string | Primary key, `H-1000`…`H-1299` | 300 unique |
| `category` | enum | Human-assigned class | `refund_pending` (72), `missing_item` (63), `wrong_item` (62), `quality_issue` (55), `order_late` (48) |
| `description` | string | The complaint text. **Retrieval indexes this and only this.** | **Only 16 distinct strings across 300 rows** |
| `resolution_action` | enum | What the agent did. **The label we predict.** | 7 values (below) |
| `resolution_note` | string | Free-text note; maps 1:1 onto action, adds no information | 10 distinct strings |
| `time_to_resolve_min` | int | Minutes to resolve. Used *only* for the savings counter, never for the decision | 3–45, median **25** |
| `csat` | int | Customer satisfaction 1–5 | **only 3, 4, 5 present** — dist: 4×129, 5×102, 3×69 |

**`resolution_action` distribution:** `partial_refund` 92 · `redelivery` 61 · `refund_reissue` 41 · `escalation` 31 · `apology_no_action` 31 · `full_refund` 27 · `coupon` 17.

These seven are the complete closed set. The system may never output an eighth value.

**`resolution_note` → action mapping** (deterministic, verified — note carries no extra signal, so do not feed it to retrieval):

| Action | Note(s) |
|---|---|
| `apology_no_action` | `SLA breach < threshold` (31) |
| `coupon` | `issued ₹50 coupon` (17) |
| `escalation` | `sent to payments team` (31) |
| `full_refund` | `refunded order` (27) |
| `partial_refund` | `refunded difference` (28) · `refunded item` (28) · `refunded item value` (36) |
| `redelivery` | `correct item dispatched` (34) · `missing item re-sent` (27) |
| `refund_reissue` | `refund re-triggered` (41) |

### 1.1 ⚠️ Quirk — there are only 16 unique descriptions

300 rows collapse to 16 distinct complaint strings, each appearing 13–27 times. **This is the defining property of the dataset.** It means the corpus is not 300 independent precedents; it is 16 clusters. Retrieval is trivially easy and the entire difficulty sits in *choosing between conflicting precedents inside a cluster*.

### 1.2 ⚠️⚠️ Quirk — no `order_id` and no `refund_amount`

**`resolved_tickets.csv` cannot be joined to `orders_context.csv`.** There is no order key. Two hard consequences:

- You **cannot** learn context-conditioned policy (e.g. "full refund when the order is small"). Any claim that the system learned such a rule would be false. This is why Triage is context-blind in ARCHITECTURE.md §1.
- History records **no money amounts at all.** Refund sizing is 100% our own stated policy (ARCHITECTURE.md §2.3), not something derived from data. Say this plainly if a judge asks where ₹ figures come from.

### 1.3 ⚠️⚠️⚠️ Quirk — precedents disagree on *every single* description

The most important fact in this file. No description has a dominant action. Measured CSAT-weighted vote share of the top action, across all 16:

| Description | n | Top action | Share | Margin | Passes gate? |
|---|---|---|---|---|---|
| still waiting after 30 min | 16 | `apology_no_action` | 0.69 | 0.37 | ✅ |
| bread not in the bag | 17 | `partial_refund` | 0.68 | 0.35 | ✅ |
| delivery way past promised time | 18 | `apology_no_action` | 0.68 | 0.35 | ✅ |
| refund not received after 5 days | 27 | `refund_reissue` | 0.62 | 0.24 | ✅ |
| wrong brand of rice delivered | 25 | `redelivery` | 0.62 | 0.24 | ✅ |
| refund shows processed but not in bank | 26 | `refund_reissue` | 0.61 | 0.23 | ✅ |
| order took 45 minutes instead of 10 | 14 | `apology_no_action` | 0.60 | 0.19 | ⚠️ borderline (0.5989) |
| milk packet missing from my order | 13 | `partial_refund` | 0.57 | 0.15 | ❌ |
| fruits were rotten | 21 | `partial_refund` | 0.55 | 0.09 | ❌ |
| money not back for cancelled order | 19 | `escalation` | 0.54 | 0.09 | ❌ |
| eggs broken in package | 20 | `full_refund` | 0.54 | 0.08 | ❌ |
| got salted butter instead of unsalted | 17 | `redelivery` | 0.53 | 0.05 | ❌ |
| ordered 5 items got only 4 | 14 | `redelivery` | 0.52 | 0.04 | ❌ |
| 1 of 3 items missing from delivery | 19 | `redelivery` | 0.51 | 0.01 | ❌ |
| received someone else's order | 20 | `redelivery` | 0.51 | 0.01 | ❌ |
| curd delivered warm and spoiled | 14 | `partial_refund` | 0.50 | 0.00 | ❌ (exact 7–7 tie) |

Best agreement is 69%. Three descriptions are effectively coin flips. **Consequence:** any confidence score based on similarity alone would auto-resolve all 30 incoming tickets, because similarity is ~1.0 for all of them (§2.1). Confidence *must* incorporate vote margin. This is the single design fact that makes or breaks validation scenario 3.

**Note `order took 45 minutes instead of 10` sits at 0.5989 share** — just under the 0.60 threshold. It does not appear in `new_tickets.csv` so it will not affect the demo, but if you retune thresholds, expect this one to flip lanes. Do not be surprised by it.

### 1.4 Non-quirk, verified: `description` → `category` is a clean 1:1

Zero conflicts — each of the 16 descriptions always carries the same category. Useful sanity check, but **do not build a lookup table on it.** It would silently fail on the live demo box where a judge types something new. Infer category from retrieved precedents instead.

---

## 2. `new_tickets.csv` — 30 rows, 4 columns

Incoming queue.

**Columns:** `ticket_id`, `created_at`, `order_id`, `description`

| Column | Type | Meaning | Verified |
|---|---|---|---|
| `ticket_id` | string | PK, `N-000`…`N-029` | 30 unique |
| `created_at` | ISO-8601, no timezone | All `2026-08-07`, times 08:09–22:00 | Treat as IST; naive local time |
| `order_id` | string | FK → `orders_context.order_id` | **All 30 resolve. Zero orphans.** |
| `description` | string | The complaint | 13 distinct strings |

### 2.1 ⚠️⚠️ Quirk — every incoming description is a *verbatim* string from history

All 13 distinct descriptions appear character-for-character in `resolved_tickets.csv`. **TF-IDF cosine will be ≈ 1.0 for all 30 tickets.** Similarity has essentially zero discriminating power on the shipped dataset.

Two consequences you must plan for:

- Confidence cannot be similarity-driven (see §1.3).
- **Validation scenario 2 is untestable as shipped** — there is no low-similarity ticket in the file. You must inject a synthetic novel ticket to demonstrate it. See VALIDATION.md §2.

Incoming description frequencies: `delivery way past promised time` ×6; `milk packet missing` ×3; `still waiting after 30 min` ×3; `money not back for cancelled order` ×3; `curd delivered warm and spoiled` ×3; `wrong brand of rice` ×2; `got salted butter` ×2; `eggs broken` ×2; `received someone else's order` ×2; then ×1 each: `fruits were rotten`, `refund not received after 5 days`, `bread not in the bag`, `1 of 3 items missing`.

Note three of the 16 historical descriptions never appear as incoming tickets: `ordered 5 items got only 4`, `order took 45 minutes instead of 10`, `refund shows processed but not in bank`. They still live in the precedent pool.

---

## 3. `orders_context.csv` — 30 rows, 5 columns

Order facts. Read **only** at the Policy stage, as a constraint.

**Columns:** `order_id`, `items`, `value_inr`, `delivery_time_min`, `delivery_status`

| Column | Type | Meaning | Verified |
|---|---|---|---|
| `order_id` | string | PK, `ORD-9900`…`ORD-9929` | 30 unique, exactly 1:1 with `new_tickets` |
| `items` | int | Number of items in the order | 1–6 |
| `value_inr` | int | Total order value, ₹ | Only 5 values: 189, 412, 640, 999, 1450 |
| `delivery_time_min` | int | Actual delivery time, minutes | 8–55 |
| `delivery_status` | **string enum** | Order state | **`delivered` (17) · `cancelled` (13)** |

### 3.1 ✅ Answering the question directly: cancelled orders use a **status string, not a boolean flag**

`delivery_status` is a text column with exactly two observed values, `'delivered'` and `'cancelled'`. There is no `is_cancelled` flag, no null, no third state.

Guardrail G1 must therefore test `order.delivery_status === 'cancelled'` — a **string comparison**. Do not write `if (order.cancelled)`; that property does not exist and will be `undefined`, silently disabling your most important guardrail. Define the enum once as a TypeScript union and parse into it at ingest.

### 3.2 ⚠️ Quirk — 13 of 30 tickets sit on cancelled orders (43%)

Validation scenario 4 is heavily exercised by the real data, not a rare edge case:

`N-000, N-001, N-002, N-003, N-004, N-006, N-007, N-017, N-022, N-023, N-025, N-027, N-028`

Of these, **4 would otherwise have been resolved with `redelivery`** and are therefore vetoed by G1: **N-001, N-003, N-017, N-023**. N-001 and N-017 are especially good demo material — `wrong brand of rice delivered` clears the confidence gate cleanly (share 0.62, margin 0.24) and is stopped *purely* by order context. That is scenario 4 firing on unmodified data.

### 3.3 ⚠️ Quirk — cancelled orders still carry a `delivery_time_min`

Every cancelled order has a non-null delivery time (e.g. `ORD-9903`, cancelled, 53 min). It is **meaningless** for cancelled orders — an order that was cancelled did not take 53 minutes to arrive. Never compute an SLA breach from `delivery_time_min` without first checking `delivery_status`.

### 3.4 ⚠️ Quirk — the data is synthetically generated and semantically inconsistent

Ticket text and order context were generated independently. Real contradictions exist in the file:

- `N-000` "fruits were rotten" on a **cancelled** order — you cannot receive rotten fruit from an order that was cancelled.
- `N-004` "eggs broken in package" on a **cancelled** order — same problem.
- `N-008` and `N-024` "money not back for **cancelled** order" on orders whose status is **`delivered`** — the text contradicts the context outright.

**Do not attempt to detect or repair these.** Treat order context as authoritative for *constraints* (can we redeliver? how much can we refund?) and ticket text as authoritative for *intent*. If a judge points at N-000, the honest answer is: the guardrail layer still behaves correctly — it refuses redelivery on the cancelled order regardless of whether the complaint makes narrative sense. Robustness to noisy input is a strength, not a bug to apologise for.

---

## 4. Assumptions we are making (state these openly)

1. **Refund amounts are our policy, not learned.** History has no amounts (§1.2). `partial_refund = floor(value_inr / items)`, `full_refund = value_inr`, `coupon = ₹50` (the only value in history). All clamped to `value_inr`.
2. **CSAT weighting is a tiebreaker, not a strong signal.** Range is only 3–5, so its effect on vote share is real but modest. Do not over-claim it.
3. **`resolution_note` is excluded from retrieval.** It maps 1:1 onto action (§1) and would leak the label into the similarity space.
4. **Currency is INR throughout.** No conversion anywhere.
5. **`created_at` is naive local time (IST).** No timezone handling; used only for display ordering and the ticket-stream simulation.
6. **Ticket ↔ order is 1:1 in this dataset**, but the schema keeps `order_id` as a plain FK so multiple tickets per order do not break anything.
7. **`time_to_resolve_min` never influences a decision.** It feeds the savings counter only.
8. **The 300 historical rows are treated as ground truth**, including their disagreements. We surface conflict as low confidence rather than trying to clean it — a system that cleans away disagreement cannot satisfy validation scenario 3.

---

## 5. Columns that DO NOT exist — never reference these

Checked against the real headers. These are the plausible-sounding names most likely to be hallucinated:

- ❌ `resolved_tickets.order_id` — **no join key exists** (§1.2)
- ❌ `resolved_tickets.refund_amount` / `amount` / `value` — no money in history
- ❌ `resolved_tickets.created_at` / `resolved_at` — history has no timestamps
- ❌ `resolved_tickets.customer_id` — no customer identity anywhere in the dataset
- ❌ `orders_context.is_cancelled` / `cancelled` / `status` — the column is **`delivery_status`** (§3.1)
- ❌ `orders_context.item_list` / `products` — `items` is an **integer count**, not a list of names
- ❌ `orders_context.promised_time_min` / `sla_min` — only *actual* `delivery_time_min` exists, so there is no SLA target to compare against; the `apology_no_action` note `SLA breach < threshold` refers to a threshold that is **not present in the data**
- ❌ `new_tickets.category` / `priority` — incoming tickets are unlabelled; that is the point
- ❌ `new_tickets.customer_name` / `email` — no PII in this dataset

**Canonical header lines, copy from here:**

```
resolved_tickets.csv : ticket_id,category,description,resolution_action,resolution_note,time_to_resolve_min,csat
new_tickets.csv      : ticket_id,created_at,order_id,description
orders_context.csv   : order_id,items,value_inr,delivery_time_min,delivery_status
```