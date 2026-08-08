# ARCHITECTURE.md

**Zepto Support Ticket Manager** — DigiPlus IT Agentic AI Hackathon (Q4), 6-hour build.

> Read this file first, every session. It is the contract. If code and this file disagree, one of them is a bug — decide which, then fix it. Do not re-derive the design from scratch.

---

## 0. One-paragraph summary

A new support ticket comes in. We retrieve the most similar **resolved** tickets from history, take a CSAT-weighted vote among them to pick an action, score how confident that vote is, run the proposed action through hard business guardrails using the order's real context, and then either execute it automatically or drop it into a human lane with the precedents attached. Either way the customer gets a drafted reply. Every decision — auto or escalated — is written to an immutable audit log with its full reasoning.

The pipeline is **four stages**, and only one of them calls an LLM.

```
                    ┌──────────────────────────────────────────────┐
  new ticket ──────▶│ 1. TRIAGE      retrieve + vote               │
                    │    (deterministic)                           │
                    └──────────────────┬───────────────────────────┘
                                       │ Candidate
                    ┌──────────────────▼───────────────────────────┐
                    │ 2. POLICY      guardrails + threshold        │
                    │    (deterministic)  ◀── THE DECISION LIVES   │
                    └──────────────────┬───────────────────────────┘
                                       │ Decision
                    ┌──────────────────▼───────────────────────────┐
                    │ 3. REPLY-WRITER  draft customer message      │
                    │    (LLM, with template fallback)             │
                    └──────────────────┬───────────────────────────┘
                                       │ Decision + reply
                    ┌──────────────────▼───────────────────────────┐
                    │ 4. AUDIT       persist + execute + log       │
                    │    (deterministic)                           │
                    └──────────────────┬───────────────────────────┘
                                       │
                   auto-resolved lane ◀┴▶ needs-human lane
```

**Why only one LLM call:** Triage, Policy and Audit are pure functions. They are unit-testable, instantaneous, free, reproducible in front of judges, and they cannot hallucinate a refund amount. The model writes prose; it does not decide whether to move money. If a judge asks "what stops the AI from refunding ₹50,000?", the answer is "the AI never picks the number — `clampRefund()` in `lib/policy/guardrails.ts` does, and here is the line."

---

## 1. Stage 1 — Triage

**Job:** given a ticket, produce a ranked list of precedents and a proposed action. Nothing more.

**Reads**
- `new_tickets.csv` row (or a live-submitted ticket): `ticket_id`, `description`, `order_id`, `created_at`
- the resolved-ticket index (300 rows from `resolved_tickets.csv`, plus any human-approved decisions appended later — see §7)

**Writes**
- a `Candidate` object; persists nothing on its own

**Does not read:** `orders_context.csv`. Triage is deliberately context-blind. Retrieval is about *text similarity to past tickets*, and history has no order data attached to it (see DATA.md §1 — `resolved_tickets.csv` has no `order_id` column, so context-conditioned precedent is impossible). Mixing order facts into retrieval would invent a signal the data cannot support. Order context enters at Stage 2, as a constraint, not as a feature.

### 1.1 Retrieval — hybrid, TF-IDF first

Behind one interface:

```ts
interface Retriever {
  search(text: string, k: number): Promise<ScoredPrecedent[]>
}
```

Two implementations, fused:

| | `TfIdfRetriever` | `QdrantRetriever` |
|---|---|---|
| Method | TF-IDF over word unigrams + bigrams, cosine similarity | dense embeddings, cosine, Qdrant collection `resolved_tickets` |
| Built at | process start, in memory (300 docs — milliseconds) | ingest script, one-time |
| Strength | exact/near-exact matches; **explainable** — you can highlight the overlapping terms in the UI | paraphrase and synonym ("dahi" ≈ "curd", "didn't arrive" ≈ "missing") |
| Weakness | zero overlap on paraphrase → false escalation | opaque; needs a network call; cold start |
| Availability | always | optional |

`HybridRetriever` runs both and fuses with **Reciprocal Rank Fusion** (`score = Σ 1/(60 + rank_i)`), which needs no score normalisation between the two very differently-scaled systems.

**Build order is not negotiable:** TF-IDF end-to-end first, entire product working. Qdrant second, behind `RETRIEVER=tfidf|hybrid`. If Qdrant is unreachable at request time, `HybridRetriever` catches, logs a degraded-mode warning, and returns TF-IDF results. **The demo must never depend on a network hop to a vector DB.**

> **Why hybrid at all, given the brief says "TF-IDF is fine"?** On the shipped `new_tickets.csv`, TF-IDF is genuinely sufficient — all 30 incoming descriptions appear *verbatim* in history, so cosine ≈ 1.0 and embeddings would retrieve the same neighbours. The hybrid exists for the live demo input box, where a judge types a paraphrase TF-IDF cannot match. It also satisfies the Bonus row. It is an upgrade, never a dependency.

### 1.2 Precedent vote

Vote over **every precedent scoring ≥ `MIN_SIMILARITY`**, capped at `K = 50`. Not the top 10 — see the warning below.

```
weight(p) = similarity(p) × csat(p)
voteWeight(action) = Σ weight(p) for p where p.resolution_action == action
share  = voteWeight(top) / Σ all voteWeight
margin = share − share(runner-up)
```

CSAT weighting means resolutions the customer actually rated well count more. CSAT in this dataset only spans 3–5 (see DATA.md §1), so it is a **tiebreaker, not a dominant term** — do not over-claim its effect to judges.

> ⚠️ **Why the whole cluster votes, not the top 10.** Every row in a cluster shares the *identical* description, so all of them score similarity 1.0. A `k = 10` cut would take an arbitrary 10 of a 13–27 row cluster, and the vote share would depend on database row order. Measured over 3,000 random draws, "bread not in the bag" swings between share 0.51 and 1.00 and auto-resolves in only **72%** of draws — the 11/19 board would not be reproducible and cards would move lanes on refresh. Voting over everything above the similarity floor makes shares match DATA.md §1.3 exactly and makes the result deterministic. Ties are broken by `csat` DESC then `ticket_id` ASC. The UI still shows only the top 3.

**Output — `Candidate`:**

```ts
type Candidate = {
  ticketId: string
  precedents: ScoredPrecedent[]   // all above the similarity floor; top 3 surface in the UI
  proposedAction: ResolutionAction
  topSimilarity: number           // similarity of rank-1 precedent
  voteShare: number               // 0..1
  voteMargin: number              // 0..1
  inferredCategory: TicketCategory // majority category among precedents
  runnerUpAction: ResolutionAction | null
}
```

`ResolutionAction` is a closed union — exactly the seven values in `resolved_tickets.csv`, no others, ever:
`redelivery | partial_refund | full_refund | refund_reissue | coupon | escalation | apology_no_action`

---

## 2. Stage 2 — Policy  ← **the confidence threshold and all guardrails live here**

`lib/policy/` is the most important directory in the repo. It is the answer to every judging question about safety.

**Reads:** the `Candidate` from Stage 1, plus the `orders_context.csv` row for `ticket.order_id`
**Writes:** a `Decision` object; persists nothing (Stage 4 persists)

Policy runs in a fixed order: **compute confidence → apply guardrails → apply the gate.** Guardrails run *before* the gate so that a guardrail veto is recorded even on a ticket that would have been escalated anyway — that is what populates the "why" panel.

### 2.1 Confidence — `lib/policy/confidence.ts`

```ts
confidence = topSimilarity × voteShare
```

Both factors are necessary and neither is sufficient:

- **similarity alone is useless here** — every shipped ticket matches history verbatim, so similarity ≈ 1.0 for all 30. Gate on similarity alone and 100% auto-resolves, which fails validation scenarios 2 and 3 on live data.
- **vote share alone ignores** whether the precedents are actually about this ticket. Needed for the paraphrase / novel case.

### 2.2 The gate — `lib/policy/thresholds.ts`, single source of truth

```ts
export const THRESHOLDS = {
  MIN_SIMILARITY: 0.45,   // below this the ticket is "novel"
  MIN_VOTE_SHARE: 0.60,   // precedents must actually agree
  MIN_VOTE_MARGIN: 0.15,  // and must beat the runner-up clearly
  K: 50,                  // cap; the real cut is the MIN_SIMILARITY floor
} as const
```

Auto-resolve **only if all three hold** *and* no guardrail vetoed:

```
topSimilarity ≥ 0.45  AND  voteShare ≥ 0.60  AND  voteMargin ≥ 0.15
```

`MIN_VOTE_MARGIN` is what satisfies **validation scenario 3** ("when top precedents disagree, queue, don't guess") *structurally* rather than by luck. A 50/50 split has margin 0.00 and can never pass, whatever the similarity.

**These three numbers are the only tunable constants in the system.** They are exported from one file, referenced everywhere, and are the values the threshold slider (§7) manipulates. Never hardcode a threshold anywhere else.

**Calibration on the real data.** These values were chosen by measuring the actual CSAT-weighted vote shares across all 16 distinct descriptions (see DATA.md §1.3). They produce **11 auto-resolved / 19 needs-human** across the 30 shipped tickets — a genuinely populated board on both sides, which is exactly what the two-lane UI needs to look convincing. See VALIDATION.md §5 for the full expected table.

### 2.3 Guardrails — `lib/policy/guardrails.ts`

Each guardrail is a pure function `(action, order, candidate) => GuardrailResult`. Each returns `pass`, `veto` (force human lane), or `mutate` (change the action/amount and continue). Every non-pass result is recorded on the `Decision` with its rule ID and a human-readable reason, and rendered in the UI. **A guardrail firing is a feature to show off, not an error to hide.**

| ID | Rule | Effect | Why |
|---|---|---|---|
| **G1** | `order.delivery_status == 'cancelled'` ⇒ `redelivery` is forbidden | **veto** → human lane | Validation scenario 4, verbatim. You cannot re-deliver an order that was never delivered. Fires on 4 real tickets: N-001, N-003, N-017, N-023. |
| **G2** | refund amount ≤ `order.value_inr` | **mutate** (clamp) | Validation scenario 1: "a refund no larger than the order value". Hard cap; also the answer to "what stops a runaway refund". |
| **G3** | `partial_refund` amount = `floor(value_inr / items)` | **mutate** (set amount) | History records *no* refund amounts (DATA.md §1.2) — the per-item average is our stated, documented assumption, not a learned value. |
| **G4** | `escalation` may never auto-execute | **veto** → human lane | Escalation means "a human must look". Auto-escalating is a contradiction. |
| **G5** | `candidate.topSimilarity < MIN_SIMILARITY` ⇒ no action is proposed as final | **veto** → human lane | Validation scenario 2: "never acts on weak evidence". **Test `topSimilarity`, not `confidence`** — since `confidence = topSimilarity × voteShare`, a strongly-matched but split ticket (sim 0.90 × share 0.50 = 0.45) would trip a confidence-based check and be mislabelled "weak evidence" when it is really a *disagreement* case (scenario 3). |

Amount rules, stated once so nothing else invents them:

| Action | Amount |
|---|---|
| `full_refund` | `order.value_inr` |
| `partial_refund` | `floor(order.value_inr / order.items)`, clamped to `value_inr` |
| `coupon` | ₹50 flat (the only value that appears in history: note `issued ₹50 coupon`) |
| `redelivery`, `refund_reissue`, `escalation`, `apology_no_action` | `null` — no money moves |

**Output — `Decision`:**

```ts
type Decision = {
  ticketId: string
  lane: 'auto' | 'human'
  action: ResolutionAction
  amountInr: number | null
  confidence: number
  voteShare: number
  voteMargin: number
  topSimilarity: number
  precedentIds: string[]          // ordered, all voters
  guardrails: GuardrailResult[]   // every rule evaluated, pass or not
  vetoedBy: string | null         // e.g. 'G1'
  reasoning: string               // deterministic, template-built — NOT LLM
}
```

`reasoning` is assembled from the numbers by a template. It is what powers "why this action?" and it must be identical on every replay of the same ticket.

---

## 3. Stage 3 — Reply-writer

**Reads:** `Decision`, the ticket text, the order row, the top-3 precedents
**Writes:** a `draftReply` string onto the decision record
**The only stage that calls a model.**

Runs for **both lanes** — the brief is explicit: *"The customer gets a drafted reply either way."* In the human lane the reply is a *draft awaiting approval* and the UI must label it as such.

The prompt is given the action, the amount, and the precedents, and is told to write a short, warm, specific customer message. It is explicitly instructed **not** to invent amounts, timelines, or commitments beyond what it was handed.

**Mandatory template fallback.** If the model call fails, times out (>5s), or the key is missing, a deterministic per-action template renders instead and the decision is marked `replySource: 'template'`. A dead API key must not be able to break the demo. Build the template path *first* and the LLM path second.

Model: Claude Haiku (fast, cheap, sufficient). One call per ticket, cached by `ticket_id` so a page refresh does not re-bill or re-generate.

---

## 4. Stage 4 — Audit

**Reads:** the completed `Decision` + reply
**Writes:** Supabase — `decisions`, `actions`, `audit_log`

1. **Persist the decision** with every score, precedent ID and guardrail result.
2. **Simulate the action.** No real money moves. `executeAction()` writes an `actions` row (`type`, `amount_inr`, `status: 'simulated'`) — auto lane only. Human-lane actions are written as `status: 'pending_approval'`.
3. **Append to the audit log** — append-only, never updated or deleted. An override does not edit history; it writes a *new* entry.
4. **Idempotency.** Every action carries a key `{ticket_id}:{action}:{attempt}`, unique-constrained. Re-running the pipeline over the same ticket cannot double-refund. Cheap to add, and it is a question a good judge will ask.

---

## 5. Data model (Supabase / Postgres)

```
resolved_tickets   ticket_id PK, category, description, resolution_action,
                   resolution_note, time_to_resolve_min, csat,
                   source ('seed' | 'human_approved'), embedding vector(384) NULL

orders             order_id PK, items int, value_inr int,
                   delivery_time_min int, delivery_status text

tickets            ticket_id PK, created_at timestamptz, order_id FK, description

decisions          id PK, ticket_id FK, lane, action, amount_inr,
                   confidence, vote_share, vote_margin, top_similarity,
                   precedent_ids text[], guardrails jsonb, vetoed_by,
                   reasoning, draft_reply, reply_source, created_at,
                   top_precedents jsonb   -- [{ticketId,similarity,action,csat}]
                                          -- top-3, so the board shows precedent
                                          -- similarity without re-inference
                                          -- (migration 0002)

actions            id PK, decision_id FK, type, amount_inr,
                   status, idempotency_key UNIQUE, created_at

audit_log          id PK, ticket_id, event_type, actor ('system'|'human'),
                   payload jsonb, created_at        -- APPEND ONLY
```

Qdrant holds only vectors + `{ticket_id, action, csat}` payload. **Postgres is the source of truth.** Qdrant is a disposable index and must be rebuildable from Postgres with one script.

---

## 6. Surface / routes

**Backend — Next.js App Router route handlers.** No separate service. TF-IDF over 300 documents is ~40 lines of TypeScript; adding a Python service to call scikit-learn would cost more time than writing the maths.

| Route | Purpose |
|---|---|
| `POST /api/ingest` | load the three CSVs into Supabase; build the Qdrant collection |
| `POST /api/tickets/process` | run the full pipeline over all pending tickets |
| `POST /api/tickets` | submit one ad-hoc ticket (the live demo box) |
| `GET  /api/board` | both lanes with decisions, precedents, replies |
| `POST /api/decisions/:id/override` | human approve/override + reason |
| `GET  /api/replay?share=&margin=&sim=` | re-partition the board at different thresholds — **no re-inference** |

`/api/replay` is pure recomputation over stored scores. That is only possible because scoring is deterministic — a concrete payoff of the "LLM in one stage only" decision.

**Frontend — two-lane board.** Each card: description, order context chip (value / items / **status, red if cancelled**), chosen action + amount, confidence bar, top-3 precedents with their similarity and past action, fired guardrails, drafted reply, and Approve / Override.

---

## 7. Roadmap — core first, strictly

The brief is unambiguous: *"Build the core completely before touching anything in the Bonus row. A small finished system beats a large broken one."*

**Core (must be 100% done first)**
1. Ingest all three CSVs → Supabase
2. TF-IDF retriever + vote → `Candidate`
3. Policy: confidence + G1–G5 → `Decision`
4. Template replies (no LLM yet)
5. Two-lane board rendering top-3 precedents, action, confidence
6. Simulated actions + audit log
7. **Deploy to a public URL.** Do this at ~60% done, not at the end. A working deployed 80% beats a perfect localhost 100%.
8. Swap template → LLM replies

**Then, in this order**
9. **Threshold slider / what-if replay** — drag the three thresholds, board re-partitions live. Cheapest high-impact demo moment you have; it proves the threshold is a real mechanism rather than decoration. Reads `/api/replay`.
10. **Savings counter** — `auto_resolved_count × median(time_to_resolve_min)` from history (median is **25 min**) = agent-minutes saved. One query, gives judges a number they will repeat back.
11. **Approve/override writes back to precedents** — an approved human decision is appended to `resolved_tickets` with `source='human_approved'`, so the next similar ticket votes on it. This literally closes the "learns from history" loop in the problem statement. ⚠️ Gate behind a flag and **turn it off during judging** — a mid-demo write-back changes vote shares and would make your validation table wrong on stage.
12. **Live ticket stream** — drip tickets in over time via Supabase Realtime. Presentation value only; last.
13. **Qdrant hybrid retrieval** — Bonus row, behind `RETRIEVER=hybrid`.

---

## 8. Invariants — do not violate these without editing this file

1. **Triage never reads order context.** Context constrains at Policy; it is not a retrieval feature.
2. **Only Stage 3 calls an LLM.** Every decision is reproducible without a model.
3. **All thresholds come from `lib/policy/thresholds.ts`.** No magic numbers elsewhere.
4. **No refund may exceed `order.value_inr`.** G2 is the last line of defence and is unit-tested.
5. **No redelivery on a cancelled order.** Ever. G1.
6. **`escalation` never auto-executes.** G4.
7. **The audit log is append-only.** Overrides append; they do not edit.
8. **Actions are simulated.** Nothing touches a real payment system.
9. **`ResolutionAction` is a closed union of the seven historical values.** The system may not invent an eighth.
10. **The demo must survive a dead LLM key and an unreachable Qdrant.** Both degrade; neither breaks.