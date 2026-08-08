# CLAUDE.md

Zepto Support Ticket Manager — DigiPlus IT Agentic AI Hackathon (Q4). **6-hour build.**

Auto-resolve routine support tickets by matching them against 300 historically resolved tickets; queue the rest for humans with precedents attached. Every ticket gets a drafted reply either way.

---

## Read these before writing code - These files are in the agent reference folder

| File | When |
|---|---|
| `ARCHITECTURE.md` | Before touching pipeline, policy, or schema. It is the design contract. |
| `DATA.md` | Before touching **any** CSV column name. Non-negotiable. |
| `VALIDATION.md` | Before calling anything done. It is the test spec and the judging rubric. |

Do not re-derive the design. If code and `ARCHITECTURE.md` disagree, one is a bug — decide which, fix it, and update the doc in the same commit.

**Stack:** Next.js (App Router, TypeScript) · Supabase/Postgres · Qdrant (optional, bonus) · Claude Haiku (replies only) · deploy to Vercel.

---

## The four data facts that break naive code

Verified against the real CSVs. Getting these wrong is the main way this build loses hours.

1. **`resolved_tickets.csv` has NO `order_id`.** History cannot be joined to orders. You cannot learn context-conditioned policy. Do not write that join.
2. **`resolved_tickets.csv` has NO refund amounts.** All ₹ figures are our policy, defined in `ARCHITECTURE.md` §2.3. Nothing is learned from data.
3. **Cancelled orders are a STRING, not a flag:** `delivery_status === 'cancelled'`. There is no `is_cancelled`, no `cancelled`, no `status`. Writing `if (order.cancelled)` yields `undefined` and silently disables the most important guardrail.
4. **All 30 incoming tickets are verbatim matches to history**, so similarity ≈ 1.0 for every one of them. **Confidence must never be similarity alone** — gate on vote margin or 100% auto-resolves and validation scenarios 2 and 3 fail live.

**Canonical headers — copy from here, never from memory:**

```
resolved_tickets.csv : ticket_id,category,description,resolution_action,resolution_note,time_to_resolve_min,csat
new_tickets.csv      : ticket_id,created_at,order_id,description
orders_context.csv   : order_id,items,value_inr,delivery_time_min,delivery_status
```

`resolution_action` is a **closed union of exactly seven values**. Never invent an eighth:
`redelivery | partial_refund | full_refund | refund_reissue | coupon | escalation | apology_no_action`

---

## Hard rules

1. **Only the reply-writer calls an LLM.** Triage, Policy and Audit are pure deterministic functions. Every decision must be reproducible with the model offline.
2. **All thresholds live in `lib/policy/thresholds.ts`.** No magic numbers anywhere else. Ever.
3. **No refund may exceed `order.value_inr`.** Guardrail G2, unit-tested.
4. **No redelivery on a cancelled order.** Guardrail G1, unit-tested.
5. **`escalation` never auto-executes.** Guardrail G4.
6. **Triage never reads order context.** Context constrains at Policy; it is not a retrieval feature.
7. **Audit log is append-only.** Overrides append a new row; they never edit history.
8. **All actions are simulated.** `status: 'simulated'`. Nothing touches a payment system.
9. **Actions carry an idempotency key** `{ticket_id}:{action}:{attempt}`, unique-constrained.
10. **The demo must survive a dead LLM key and an unreachable Qdrant.** Both degrade to a fallback; neither 500s.

---

## Layout

```
app/
  api/ingest/          load CSVs → Supabase, build Qdrant collection
  api/tickets/         POST one ad-hoc ticket (live demo box)
  api/tickets/process/ run the pipeline over pending tickets
  api/board/           both lanes + decisions + precedents
  api/decisions/[id]/override/
  api/replay/          re-partition at different thresholds, NO re-inference
lib/
  retrieval/  tfidf.ts · qdrant.ts · hybrid.ts   (one Retriever interface)
  triage/     vote.ts                            → Candidate
  policy/     thresholds.ts · confidence.ts · guardrails.ts  → Decision
  reply/      llm.ts · templates.ts              (template is the fallback path)
  audit/      persist.ts · execute.ts
data/         the three CSVs, unmodified
```

Types `Candidate`, `Decision`, `GuardrailResult`, `ResolutionAction` are defined in `ARCHITECTURE.md` — match them exactly.

---

## Commands

```bash
pnpm dev                  # localhost:3000
pnpm test                 # guardrails + confidence unit tests — must stay green
pnpm tsx scripts/ingest.ts    # CSVs → Supabase
pnpm tsx scripts/reindex.ts   # rebuild Qdrant from Postgres (disposable index)
pnpm tsx scripts/validate.ts  # assert the 11/19 board split from VALIDATION.md §5
```

`RETRIEVER=tfidf` (default) · `RETRIEVER=hybrid` (Qdrant).

---

## Build order — core completely, then bonus

The brief is explicit: *"A small finished system beats a large broken one."*

**Core:** ingest → TF-IDF retriever + vote → policy + guardrails → **template** replies → two-lane board → simulated actions + audit log → **deploy publicly at ~60% done, not at the end** → swap templates for LLM replies.

**Then, in order:** threshold slider → savings counter → approve/override write-back → live ticket stream → Qdrant hybrid.

Do not start a bonus item while any core item is incomplete.

---

## Anti-patterns

- ❌ Adding a Python service for TF-IDF. It's ~40 lines of TypeScript over 300 documents.
- ❌ Putting an LLM in the decision path "to make it more agentic." It makes it slower, unreproducible, and unsafe on stage.
- ❌ Gating on similarity alone. See data fact 4.
- ❌ Building a `description → category` lookup. It works on the 16 known strings and fails silently on the live demo box.
- ❌ Feeding `resolution_note` to retrieval. It maps 1:1 onto the action and leaks the label.
- ❌ Hiding guardrail vetoes. A fired guardrail is the best thing on the board — render it prominently.
- ❌ Cleaning away precedent disagreement. Conflict must surface as low confidence; that IS validation scenario 3.
- ❌ Deploying last.

---

## Done means

Every box in `VALIDATION.md` ticked **against the deployed public URL**, not localhost. Board reads **11 auto / 19 needs-human** (exact per-ticket table in `VALIDATION.md` §5).

Two demo-day traps, both easy to walk into:

- **Scenario 2 has no test ticket in the dataset.** No incoming ticket has low similarity. The live-submit box is load-bearing for a quarter of the rubric — build it early.
- **Turn write-back to precedents OFF during judging.** It mutates vote shares mid-demo and invalidates the expected results table.