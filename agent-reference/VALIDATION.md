# VALIDATION.md

The four scenarios from the problem statement, restated as a checklist with concrete ticket IDs and expected outcomes.

> **Point Claude Code at this file before calling anything "done."** This is the test spec, and it maps directly onto what is being judged. Nothing ships until every box below is ticked against the live deployed URL — not localhost.

---

## Scenario 1 — Strong precedents → auto-resolve, capped refund, cited reply

> *"A clear missing-item ticket with strong precedents is auto-resolved with the same action, a refund no larger than the order value, and a reply citing its top-3 precedents."*

**Test ticket: `N-015` — "bread not in the bag" on `ORD-9915`** (delivered, ₹412, 5 items)

This is the only clean missing-item ticket in the dataset that clears the confidence gate: share **0.68**, margin **0.35**. Every other missing-item description sits below threshold and correctly escalates.

- [ ] `N-015` lands in the **auto-resolved** lane
- [ ] Action is `partial_refund` — the same action history took most often for this description
- [ ] Refund amount is **₹82** (`floor(412 / 5)`), not an invented figure
- [ ] Refund amount is **≤ ₹412** (order value) — G2 holds
- [ ] Card shows exactly **3 precedents**, each with its ticket ID, past action, and similarity score
- [ ] All 3 precedents are genuinely "bread not in the bag" rows, not a mixed bag
- [ ] Drafted reply exists, names the action and the ₹ amount, and **references the precedents**
- [ ] Confidence value shown on the card matches `topSimilarity × voteShare`
- [ ] An `actions` row was written with `status: 'simulated'` — no real payment call
- [ ] Re-running the pipeline on `N-015` does **not** create a second action row (idempotency key holds)

**Refund-cap stress test (do this explicitly, judges ask):**

- [ ] Temporarily force a `full_refund` on a cheapest-tier order (`ORD-9913`, ₹189, delivered — ticket `N-013`) and confirm the amount clamps to ₹189
- [ ] Unit test: `clampRefund(99999, order)` returns `order.value_inr`, never more

---

## Scenario 2 — Novel ticket, low similarity → human lane, no action

> *"A novel ticket with low similarity goes to the human lane — the system never acts on weak evidence."*

### ⚠️ You must inject a ticket for this. It cannot be tested as shipped.

All 30 incoming descriptions are **verbatim** strings from history (DATA.md §2.1), so similarity is ≈1.0 across the board. There is no low-similarity ticket in `new_tickets.csv`. **Do not discover this during judging.** Wire the live-submit box early and keep these test strings ready.

**Inject via `POST /api/tickets` (the demo box):**

| Test string | Expected |
|---|---|
| `"delivery person was rude and threw the bag at my door"` | no precedent cluster exists → similarity below 0.45 → human lane |
| `"app crashed and charged me twice for the same order"` | novel domain (billing/app bug) → human lane |
| `"I want to close my account permanently"` | entirely out of domain → human lane |

- [ ] Each novel ticket lands in the **needs-human** lane
- [ ] `topSimilarity` is visibly **below `MIN_SIMILARITY` (0.45)** on the card
- [ ] **No action is executed** — `actions` row is `pending_approval`, never `simulated`
- [ ] `vetoedBy` is `G5` and the UI states *why* ("evidence too weak")
- [ ] A **drafted reply is still produced** — the brief requires a reply either way — and is clearly labelled *awaiting human approval*
- [ ] The card still shows whatever precedents were retrieved, with their low scores visible, so the human can judge for themselves
- [ ] No refund, redelivery, coupon or escalation is auto-triggered

**Paraphrase robustness (this is what the Qdrant hybrid is for):**

- [ ] `"my dahi came warm and had gone off"` — with `RETRIEVER=tfidf` this scores near zero and escalates; with `RETRIEVER=hybrid` it should retrieve the "curd delivered warm and spoiled" cluster. Either outcome is *safe*; demonstrate the difference deliberately rather than being caught out by it.

---

## Scenario 3 — Precedents disagree → queue, do not guess

> *"When top precedents disagree on the action, the ticket is queued, not guessed."*

**Test ticket: `N-011` / `N-016` / `N-021` — "curd delivered warm and spoiled"**

The perfect case: history splits **exactly 7–7** between `partial_refund` and `full_refund`. Vote share 0.50, margin **0.00**. High similarity, zero agreement.

- [ ] All three curd tickets land in the **needs-human** lane
- [ ] They land there **despite similarity ≈ 1.0** — proving similarity alone is not driving the decision
- [ ] The card displays the **split** (e.g. "7 precedents say partial_refund, 7 say full_refund")
- [ ] `voteMargin` is shown and is ~0.00
- [ ] A **suggested action** is still attached for the human, per the brief's reference flow ("a suggested action attached") — suggested, never executed
- [ ] No action executes

**Additional disagreement cases that must also queue:**

- [ ] `N-018`, `N-026` — "received someone else's order" (share 0.51, margin 0.01)
- [ ] `N-009` — "eggs broken in package" (share 0.54, margin 0.08)
- [ ] `N-008`, `N-024` — "money not back for cancelled order" (share 0.54, margin 0.09)
- [ ] `N-005`, `N-019` — "milk packet missing" (share 0.57, **margin 0.15**) — sits right on the margin boundary; confirm which side it falls and that the behaviour is stable, not flapping between runs

**Structural check — this is the important one:**

- [ ] Unit test: a candidate with `similarity = 1.0` and `voteShare = 0.50` **can never** return `lane: 'auto'`, regardless of any other field. Scenario 3 must be satisfied by the gate's structure, not by luck in the data.

---

## Scenario 4 — Cancelled order never triggers redelivery

> *"A ticket on a cancelled order never triggers redelivery — order context constrains actions."*

**Test tickets: `N-001` and `N-017` — "wrong brand of rice delivered"** on `ORD-9901` and `ORD-9917`, **both cancelled**.

These are the strongest demo cards you have. This description clears the confidence gate cleanly (share **0.62**, margin **0.24**) and proposes `redelivery`. It is stopped *purely* by order context — the guardrail is the only thing standing between the system and a wrong action.

- [ ] `N-001` and `N-017` land in the **needs-human** lane
- [ ] The proposed action was `redelivery` and the card **says so**, then shows it was blocked
- [ ] `vetoedBy` is `G1` with a readable reason: *"cannot redeliver a cancelled order"*
- [ ] The order-context chip renders `cancelled` in **red** — visible at a glance from across a room
- [ ] **No redelivery action row is written** for either ticket
- [ ] These tickets would have auto-resolved on confidence alone — verify by checking their confidence score is above threshold. This is what proves the guardrail is doing real work rather than agreeing with a decision the gate had already made.

**Also blocked by G1 (lower confidence, but must still show the veto):**

- [ ] `N-003` — "got salted butter instead of unsalted" on cancelled `ORD-9903`
- [ ] `N-023` — "1 of 3 items missing from delivery" on cancelled `ORD-9923`

**Full cancelled-order sweep** — 13 of 30 tickets sit on cancelled orders (DATA.md §3.2):

- [ ] Across `N-000, N-001, N-002, N-003, N-004, N-006, N-007, N-017, N-022, N-023, N-025, N-027, N-028`, **zero** redelivery actions exist in the `actions` table
- [ ] SQL assertion passes: `SELECT count(*) FROM actions a JOIN ... WHERE o.delivery_status='cancelled' AND a.type='redelivery'` returns **0**
- [ ] Guardrail G1 is covered by a unit test independent of the dataset
- [ ] G1 tests `delivery_status === 'cancelled'` as a **string** — not a boolean flag, which does not exist (DATA.md §3.1)

---

## 5. Expected full-board state

Computed from the real data with `MIN_SIMILARITY 0.45 / MIN_VOTE_SHARE 0.60 / MIN_VOTE_MARGIN 0.15` and guardrails G1–G5.

**Expect 11 auto-resolved · 19 needs-human.**

Screenshot this table before the demo. If your board disagrees with it, something regressed.

### Auto-resolved lane (11)

| Ticket | Description | Order status | Action | Share / margin |
|---|---|---|---|---|
| N-006 | still waiting after 30 min | cancelled | `apology_no_action` | 0.69 / 0.37 |
| N-025 | still waiting after 30 min | cancelled | `apology_no_action` | 0.69 / 0.37 |
| N-027 | still waiting after 30 min | cancelled | `apology_no_action` | 0.69 / 0.37 |
| N-007 | delivery way past promised time | cancelled | `apology_no_action` | 0.68 / 0.35 |
| N-010 | delivery way past promised time | delivered | `apology_no_action` | 0.68 / 0.35 |
| N-012 | delivery way past promised time | delivered | `apology_no_action` | 0.68 / 0.35 |
| N-014 | delivery way past promised time | delivered | `apology_no_action` | 0.68 / 0.35 |
| N-020 | delivery way past promised time | delivered | `apology_no_action` | 0.68 / 0.35 |
| N-022 | delivery way past promised time | cancelled | `apology_no_action` | 0.68 / 0.35 |
| N-015 | bread not in the bag | delivered | `partial_refund` ₹82 | 0.68 / 0.35 |
| N-013 | refund not received after 5 days | delivered | `refund_reissue` | 0.62 / 0.24 |

**Note:** the auto lane is dominated by `apology_no_action` — the cheapest possible action, where a wrong call costs nothing. The only auto-resolved ticket that moves money is N-015 (₹82). That is a good story, not a weakness: *the system auto-resolves aggressively where the downside is an apology, and defers wherever real money is at stake.* Say this out loud during the demo.

### Needs-human lane (19)

| Ticket | Description | Why queued |
|---|---|---|
| N-001 | wrong brand of rice delivered | **G1 veto** — redelivery on cancelled order |
| N-017 | wrong brand of rice delivered | **G1 veto** — redelivery on cancelled order |
| N-003 | got salted butter instead of unsalted | **G1 veto** + low margin (0.05) |
| N-023 | 1 of 3 items missing from delivery | **G1 veto** + low margin (0.01) |
| N-011, N-016, N-021 | curd delivered warm and spoiled | margin 0.00 — exact tie |
| N-018, N-026 | received someone else's order | margin 0.01 |
| N-029 | got salted butter instead of unsalted | margin 0.05 |
| N-004, N-009 | eggs broken in package | margin 0.08 |
| N-008, N-024, N-028 | money not back for cancelled order | margin 0.09 |
| N-000 | fruits were rotten | margin 0.09 |
| N-002, N-005, N-019 | milk packet missing from my order | share 0.57 — below 0.60 |

---

## 6. Pre-demo checklist

Ticked against the **deployed public URL**, on a phone hotspot, with your laptop's dev server stopped.

- [ ] Public URL loads and shows a populated board — no empty state, no spinner of death
- [ ] Public GitHub repo is up, README links the live URL, no secrets committed
- [ ] Auto and human lanes both have cards (11 / 19 — an empty lane looks broken)
- [ ] Every card shows: action, amount, confidence, **top-3 precedents**, drafted reply
- [ ] "Why this action?" is answerable from the UI alone, without you narrating
- [ ] **Kill the LLM API key and reload** — template replies render, nothing 500s
- [ ] **Set `RETRIEVER=hybrid` with Qdrant unreachable** — degrades to TF-IDF, nothing 500s
- [ ] Live submit box works with a novel string (scenario 2 depends on this)
- [ ] Approve/override writes to the audit log and the log is visible
- [ ] Write-back to precedents is **switched OFF** during judging — it mutates vote shares and would invalidate the table in §5 mid-demo
- [ ] Threshold slider re-partitions the board without re-running inference
- [ ] Savings counter matches `auto_count × 25 min` (median `time_to_resolve_min`) = **11 × 25 = 275 agent-minutes**
- [ ] Cold-load the deployed URL in a private window — no cached-state illusions

**Have these four cards bookmarked, one per scenario:** `N-015` (auto + capped refund) · injected novel ticket (weak evidence) · `N-011` (7–7 tie) · `N-001` (cancelled-order veto). That is the whole judging rubric in four clicks.