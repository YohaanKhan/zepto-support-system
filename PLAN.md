# BUILD PLAN — Zepto Support Ticket Manager

**6-hour hackathon build** | DigiPlus IT Agentic AI Hackathon (Q4)

> Living document. Check off tasks as completed. Do not proceed past STOP-GATE 1 until core (Sprints 1–8) is 100% done.

---

## TIME BUDGET REALITY CHECK

**Total available:** 360 minutes (6 hours)

**Core (Sprints 1–8):** 275 minutes (4h 35m) — 45+40+50+20+60+25+10+25  
**Bonus sprints:** You have **85 minutes** remaining after core, NOT 135. That is enough for 2–3 bonus sprints maximum.

**Bonus priority order (pick 2–3):**
1. Sprint 9 (Threshold slider) — 30 min — highest demo impact per minute
2. Sprint 10 (Savings counter) — 15 min — cheapest win
3. Sprint 13 (Qdrant hybrid) — 40 min — satisfies Bonus row, but skip if time is tight
4. Sprint 11 (Write-back) — 30 min — closes the loop, but not essential
5. Sprint 12 (Live stream Realtime) — 20 min — presentation polish only, cut first

**Do NOT attempt all 5 bonus sprints.** The original plan totaled 420 minutes (7 hours), which does not fit. Decide now based on your actual remaining time.

---

## Sprint 1 — Ingest all three CSVs → Supabase + skeleton deploy

**Clock window:** [Fill in: e.g. 10:00–10:45] (45 min: 35 ingest + 10 deploy)

**Objective:** All three CSVs loaded into Supabase tables; schema matches ARCHITECTURE.md §5 exactly; `POST /api/ingest` route working; skeleton deployed to Vercel (per ARCHITECTURE.md §7: "deploy at ~60% done, not at the end").

**Tasks:**
- [ ] Initialize Next.js project with TypeScript, App Router
- [ ] Set up Supabase project, get connection string
- [ ] Create schema migration for all 6 tables from ARCHITECTURE.md §5:
  - [ ] `resolved_tickets` — columns: `ticket_id` PK, `category`, `description`, `resolution_action`, `resolution_note`, `time_to_resolve_min`, `csat`, `source` (default `'seed'`), `embedding` vector(384) NULL
  - [ ] `orders` — columns: `order_id` PK, `items` int, `value_inr` int, `delivery_time_min` int, `delivery_status` text
  - [ ] `tickets` — columns: `ticket_id` PK, `created_at` timestamptz, `order_id` FK, `description`
  - [ ] `decisions` — columns: `id` PK, `ticket_id` FK, `lane`, `action`, `amount_inr`, `confidence`, `vote_share`, `vote_margin`, `top_similarity`, `precedent_ids` text[], `guardrails` jsonb, `vetoed_by`, `reasoning`, `draft_reply`, `reply_source`, `created_at`
  - [ ] `actions` — columns: `id` PK, `decision_id` FK, `type`, `amount_inr`, `status`, `idempotency_key` UNIQUE, `created_at`
  - [ ] `audit_log` — columns: `id` PK, `ticket_id`, `event_type`, `actor`, `payload` jsonb, `created_at`
- [ ] Place the three CSV files in `/data` directory: `resolved_tickets.csv`, `new_tickets.csv`, `orders_context.csv`
- [ ] Create `app/api/ingest/route.ts` — POST handler
- [ ] Parse and validate CSV headers match DATA.md §5 canonical headers exactly
- [ ] Insert `resolved_tickets.csv` → `resolved_tickets` table (300 rows, `source='seed'`)
- [ ] Insert `orders_context.csv` → `orders` table (30 rows)
- [ ] Insert `new_tickets.csv` → `tickets` table (30 rows)
- [ ] Verify row counts: 300, 30, 30
- [ ] Test: `curl -X POST http://localhost:3000/api/ingest` returns success
- [ ] **Deploy skeleton to Vercel now (early deploy per ARCHITECTURE.md §7):**
  - [ ] Create GitHub repo, push code
  - [ ] Connect to Vercel, set env vars from `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
    - ⚠️ Supabase retired `anon`/`service_role` naming — use publishable/secret. `DATABASE_URL` is NOT needed (supabase-js only).
    - ⚠️ Vercel does not read `.env.local`. Set every var for BOTH Production and Preview.
  - [ ] Deploy, verify `/api/ingest` works on public URL
  - [ ] Update README.md with live URL

**Depends on:** None (foundation sprint)

**Definition of done:** No VALIDATION.md items complete yet (pure setup). DoD = successful POST returns counts, database has 360 rows total, public URL is live with working ingest endpoint.


**Invariant checkpoints:**
- Invariant #9: `ResolutionAction` must be a closed union of exactly 7 values from DATA.md §1 (define TypeScript type now, reference everywhere)
- Invariant #3: Define `THRESHOLDS` in `lib/policy/thresholds.ts` now, even though not used until Sprint 3

**Risk / fallback:** CSV parsing edge cases (encoding, line endings on Windows). Fallback: use a battle-tested CSV library (papaparse), don't hand-roll a parser. Deploy risk: test `npm run build` locally first to catch TypeScript errors before pushing to Vercel.

---

## Sprint 2 — TF-IDF retriever + vote → Candidate

**Clock window:** [Fill in: e.g. 10:45–11:25] (40 min)

**Objective:** `lib/triage/` directory exists with working TF-IDF retriever and precedent voting; returns a valid `Candidate` object for any ticket description.

**Tasks:**
- [ ] Create `lib/types.ts` — define all TypeScript types from ARCHITECTURE.md:
  - [ ] `ResolutionAction` union (7 values exactly)
  - [ ] `TicketCategory` union (5 values from DATA.md §1)
  - [ ] `ScoredPrecedent` type
  - [ ] `Candidate` type (from ARCHITECTURE.md §1.2)
  - [ ] `Decision` type (from ARCHITECTURE.md §2.3)
  - [ ] `GuardrailResult` type
- [ ] Create `lib/policy/thresholds.ts` — export `THRESHOLDS` object with `MIN_SIMILARITY: 0.45`, `MIN_VOTE_SHARE: 0.60`, `MIN_VOTE_MARGIN: 0.15`, `K: 50`
- [ ] Create `lib/triage/retriever.ts`:
  - [ ] Define `Retriever` interface with `search(text: string, k: number): Promise<ScoredPrecedent[]>`
  - [ ] Implement `TfIdfRetriever` class:
    - [ ] Build TF-IDF index from `resolved_tickets` descriptions (unigrams + bigrams)
    - [ ] Compute cosine similarity
    - [ ] Return top-k precedents with similarity scores
    - [ ] **Deterministic tie-break:** identical descriptions score identically. Sort ties by `csat` DESC, then `ticket_id` ASC. Without this, results vary between runs.
  - [ ] Load resolved_tickets from Supabase on initialization
- [ ] Create `lib/triage/vote.ts`:
  - [ ] Implement `computeVote(precedents: ScoredPrecedent[]): VoteResult`
  - [ ] Formula: `weight(p) = similarity(p) × csat(p)`
  - [ ] Group by action, sum weights, compute share and margin
  - [ ] Return `proposedAction`, `voteShare`, `voteMargin`, `runnerUpAction`
- [ ] Create `lib/triage/index.ts`:
  - [ ] Export `triage(description: string): Promise<Candidate>`
  - [ ] Call retriever.search() with `THRESHOLDS.K` (= 50)
  - [ ] **Vote over every precedent with `similarity >= MIN_SIMILARITY`, not just the top 10** — see the ⚠️ note below
  - [ ] Call computeVote()
  - [ ] Infer category from majority of precedents
  - [ ] Return complete `Candidate` object
- [ ] Unit test: "bread not in the bag" returns similarity ≈ 1.0, action `partial_refund`, **share 0.68, margin 0.35**
- [ ] Unit test: run triage on the same ticket 5× — identical share and margin every time (no flapping)

> ### ⚠️ Why K=50 and a similarity floor, not K=10
>
> Every member of a cluster has the **identical description**, so all of them score similarity 1.0. With `K=10` the "top 10" is an **arbitrary subset** of a 13–27 row cluster, and the vote share depends on which rows the database happened to return.
>
> Measured over 3,000 random draws of 10:
>
> | Description | Cluster | Full-cluster share (DATA.md) | K=10 share range | Auto-resolves in |
> |---|---|---|---|---|
> | bread not in the bag | 17 | 0.68 | **0.51 – 1.00** | 72% of draws |
> | wrong brand of rice delivered | 25 | 0.62 | **0.50 – 1.00** | 68% of draws |
> | refund not received after 5 days | 27 | 0.62 | **0.50 – 1.00** | 61% of draws |
>
> With K=10 the 11/19 board split is **not reproducible** — cards would move between lanes on refresh and the VALIDATION.md expected table would be wrong about a third of the time. On stage that reads as a broken system.
>
> **Fix:** vote over all precedents scoring ≥ `MIN_SIMILARITY` (cap K at 50). The whole cluster votes, shares match DATA.md §1.3 exactly, and the result is deterministic. Still display only the top 3.

**Depends on:** Sprint 1 (needs database with resolved_tickets)


**Definition of done:** No VALIDATION.md items complete yet. DoD = triage() returns valid Candidate with correct top-3 precedents for a known ticket description.

**Invariant checkpoints:**
- Invariant #1: Triage never reads order context (do not JOIN to orders table)
- Invariant #3: Use `THRESHOLDS.K` for top-k, never hardcode a number
- Invariant #9: Only output one of the 7 ResolutionAction values

**Risk / fallback:** TF-IDF implementation bugs. Fallback: validate against known case ("bread not in the bag" should match verbatim with cosine ≈ 1.0). If stuck >20 min, use a minimal tokenizer (split on whitespace + punctuation) rather than perfecting ngrams. Redeploy after this sprint.

---

## Sprint 3 — Policy: confidence + G1–G5 → Decision

**Clock window:** [Fill in: e.g. 11:25–12:15] (50 min)

**Objective:** `lib/policy/` is the complete guardrail layer; every Decision has confidence score, lane assignment, and all 5 guardrails evaluated.

**Tasks:**
- [ ] Create `lib/policy/confidence.ts`:
  - [ ] Export `computeConfidence(candidate: Candidate): number`
  - [ ] Formula: `topSimilarity × voteShare`
- [ ] Create `lib/policy/guardrails.ts`:
  - [ ] Define `GuardrailResult` type: `{ id: string, status: 'pass' | 'veto' | 'mutate', reason: string, mutatedAction?: ResolutionAction, mutatedAmount?: number }`
  - [ ] Implement **G1** — `checkCancelledRedelivery(action, order)`: if `order.delivery_status === 'cancelled'` AND action is `redelivery` → veto with reason "cannot redeliver a cancelled order"
  - [ ] Implement **G2** — `clampRefund(amount, order)`: if amount > `order.value_inr` → mutate, clamp to `order.value_inr`
  - [ ] Implement **G3** — `computePartialRefund(order)`: return `Math.floor(order.value_inr / order.items)` clamped to `order.value_inr`
  - [ ] Implement **G4** — `checkEscalation(action)`: if action is `escalation` → veto with reason "escalation requires human review"
  - [ ] Implement **G5** — `checkWeakEvidence(candidate)`: if `candidate.topSimilarity < MIN_SIMILARITY` → veto with reason "evidence too weak"
    - ⚠️ **Test `topSimilarity`, NOT `confidence`.** Since `confidence = topSimilarity × voteShare`, a ticket with similarity 0.90 and share 0.50 has confidence 0.45 and would trip a confidence-based G5 — but that is a *disagreement* case (Scenario 3), not *weak evidence* (Scenario 2). Conflating them prints "evidence too weak" on a strongly-matched card, which is visibly wrong. VALIDATION.md §2 checks `topSimilarity < 0.45`.
  - [ ] Export `applyGuardrails(candidate, order): { action, amountInr, guardrailResults, vetoedBy }`
- [ ] Create `lib/policy/amounts.ts`:
  - [ ] Export `computeAmount(action, order): number | null`
  - [ ] Map from ARCHITECTURE.md §2.3 table: `full_refund` → `order.value_inr`, `partial_refund` → G3 formula, `coupon` → 50, others → null
- [ ] Create `lib/policy/gate.ts`:
  - [ ] Export `applyGate(candidate, guardrails): 'auto' | 'human'`
  - [ ] Auto-resolve IFF: `topSimilarity >= MIN_SIMILARITY` AND `voteShare >= MIN_VOTE_SHARE` AND `voteMargin >= MIN_VOTE_MARGIN` AND no guardrail vetoed
  - [ ] Otherwise → human lane

- [ ] Create `lib/policy/reasoning.ts`:
  - [ ] Export `buildReasoning(decision): string`
  - [ ] Template-based, deterministic: "Based on {n} precedents (top similarity {sim}, vote share {share}, margin {margin}), proposed action is {action}. Confidence: {conf}. [Guardrails: ...]"
- [ ] Create `lib/policy/index.ts`:
  - [ ] Export `makeDecision(candidate, order): Decision`
  - [ ] Call computeConfidence()
  - [ ] Call applyGuardrails()
  - [ ] Call applyGate()
  - [ ] Call computeAmount()
  - [ ] Call buildReasoning()
  - [ ] Return complete Decision object
- [ ] Unit test G1: ticket `N-001` (wrong rice, cancelled order) → veto, lane=human, vetoedBy='G1'
- [ ] Unit test G2: `clampRefund(99999, {value_inr: 189})` returns 189
- [ ] Unit test: "curd delivered warm and spoiled" (margin 0.00) → lane=human regardless of similarity

**Depends on:** Sprint 2 (needs Candidate)

**Definition of done:**
- VALIDATION.md §4: "These tickets would have auto-resolved on confidence alone — verify by checking their confidence score is above threshold" — N-001 confidence check implemented
- VALIDATION.md §3 structural check: "Unit test: a candidate with similarity = 1.0 and voteShare = 0.50 can never return lane: 'auto'" — test passing

**Invariant checkpoints:**
- Invariant #2: Only Stage 3 calls an LLM (not this sprint — no LLM yet)
- Invariant #3: All threshold checks reference `THRESHOLDS` from `lib/policy/thresholds.ts`, no magic numbers
- Invariant #4: G2 is the refund cap, unit tested
- Invariant #5: G1 prevents redelivery on cancelled orders
- Invariant #6: G4 prevents auto-escalation
- Invariant #8: Actions are simulated (mark as `status: 'simulated'` or `'pending_approval'`)

**Risk / fallback:** Guardrail logic bugs. Fallback: test G1 and G2 first (validation scenarios 4 and 1); if time runs short, G3/G4/G5 are simpler and can be completed quickly. Redeploy after this sprint.

---

## Sprint 4 — Template replies (no LLM yet)

**Clock window:** [Fill in: e.g. 12:15–12:35] (20 min)

**Objective:** Every Decision gets a drafted reply from deterministic templates; no LLM dependency yet.

**Tasks:**
- [ ] Create `lib/reply/templates.ts`:
  - [ ] Export `generateTemplateReply(decision, ticket, order): string`
  - [ ] One template per ResolutionAction:
    - [ ] `redelivery`: "We apologize for the inconvenience. We're arranging redelivery of your order #{order_id}."
    - [ ] `partial_refund`: "We're processing a refund of ₹{amount} for the affected item(s). You should see it in 3-5 business days."
    - [ ] `full_refund`: "We're processing a full refund of ₹{amount}. You should see it in 3-5 business days."
    - [ ] `refund_reissue`: "We're re-triggering your refund. Please allow 3-5 business days."
    - [ ] `coupon`: "We've issued a ₹50 coupon to your account as a goodwill gesture."
    - [ ] `escalation`: "We've escalated your case to our specialist team. They'll reach out within 24 hours."
    - [ ] `apology_no_action`: "We sincerely apologize for the delay. We're working to improve our delivery times."

  - [ ] Substitute `{amount}`, `{order_id}`, `{ticket_id}` from context
  - [ ] For human-lane tickets, prepend: "[DRAFT — AWAITING APPROVAL] "
- [ ] Create `lib/reply/index.ts`:
  - [ ] Export `generateReply(decision, ticket, order): Promise<{reply: string, source: 'template' | 'llm'}>`
  - [ ] For now, always call generateTemplateReply() and return `{reply, source: 'template'}`
  - [ ] (LLM path will be added in Sprint 8)
- [ ] Update `lib/policy/index.ts` to call generateReply() and attach `draft_reply` and `reply_source` to Decision

**Depends on:** Sprint 3 (needs Decision)

**Definition of done:**
- VALIDATION.md §2: "A drafted reply is still produced — the brief requires a reply either way — and is clearly labelled *awaiting human approval*" — template reply with [DRAFT] prefix for human lane implemented
- VALIDATION.md §3: "A suggested action is still attached for the human" — reply references the suggested action

**Invariant checkpoints:**
- Invariant #10: Demo must survive a dead LLM key — this sprint IS the fallback; test by never setting an API key

**Risk / fallback:** None. This is the simplest sprint. If it takes >20 min, something is wrong upstream. Redeploy after this sprint.

---

## Sprint 5 — Two-lane board rendering top-3 precedents, action, confidence

**Clock window:** [Fill in: e.g. 12:35–13:35] (60 min)

**Objective:** Frontend shows a working two-lane board with all decision data visible; no API routes yet (can mock data initially).

**Tasks:**
- [ ] Create `app/page.tsx` — board layout:
  - [ ] Two-column layout: "Auto-Resolved" (left) and "Needs Human Review" (right)
  - [ ] Each column is a scrollable list of ticket cards
- [ ] Create `components/TicketCard.tsx`:
  - [ ] Display ticket description (truncated if long)
  - [ ] Order context chip: "₹{value} • {items} items • {status}" — render `cancelled` in RED
  - [ ] Chosen action + amount (if any): e.g. "partial_refund ₹82"
  - [ ] Confidence bar: visual bar scaled 0–1, with numeric value
  - [ ] Top-3 precedents section:
    - [ ] Each precedent: ticket ID, similarity score, past action
    - [ ] Limit to 3 (not all 10)
  - [ ] Fired guardrails section (if any):
    - [ ] Show guardrail ID (e.g. "G1"), status (veto/mutate/pass), reason
    - [ ] Highlight vetoes in orange/red
  - [ ] Drafted reply: expandable text area or collapsible section
  - [ ] "Why this action?" button/section showing `reasoning` text
  - [ ] Approve / Override buttons (non-functional for now, Sprint 6 wires them)
- [ ] Create `app/api/board/route.ts` — GET handler:
  - [ ] Fetch all tickets from `tickets` table
  - [ ] For each ticket, fetch its decision from `decisions` table (if exists)
  - [ ] Fetch order context from `orders` table
  - [ ] Fetch top-3 precedents from `resolved_tickets` using `precedent_ids` array
  - [ ] Return JSON: `{ autoResolved: Decision[], needsHuman: Decision[] }`

- [ ] Wire `page.tsx` to call `/api/board` on mount and render cards
- [ ] Test: load `http://localhost:3000`, see empty board (no decisions yet)

**Depends on:** Sprint 3 (needs Decision type), Sprint 4 (needs reply)

> 💡 **Consider swapping Sprints 5 and 6.** As written, you spend 60 minutes building the board and can only test it against an empty state, because `decisions` rows are not created until Sprint 6. Doing Sprint 6 first (25 min) means the board renders real data the moment you build it — you debug the UI once instead of twice. The only cost is writing `/api/board` in Sprint 6 instead of Sprint 5.

**Definition of done:**
- VALIDATION.md §1: "Card shows exactly 3 precedents, each with its ticket ID, past action, and similarity score" — card UI implemented
- VALIDATION.md §1: "Confidence value shown on the card matches topSimilarity × voteShare" — confidence displayed
- VALIDATION.md §4: "The order-context chip renders `cancelled` in red — visible at a glance from across a room" — styling implemented
- VALIDATION.md §6 pre-demo: "Every card shows: action, amount, confidence, top-3 precedents, drafted reply" — all fields rendering

**Invariant checkpoints:**
- None at risk (UI layer)

**Risk / fallback:** UI polish eats time. Fallback: bare-bones card with all required fields as plain text; no animations, no fancy styling. A working ugly board beats a broken pretty one. Defer polish to bonus time. Redeploy after this sprint.

---

## Sprint 6 — Simulated actions + audit log

**Clock window:** [Fill in: e.g. 13:35–14:00] (25 min)

**Objective:** Actions are persisted to `actions` table; audit log is append-only; idempotency works.

**Tasks:**
- [ ] Create `lib/audit/actions.ts`:
  - [ ] Export `executeAction(decision): Promise<void>`
  - [ ] If `decision.lane === 'auto'`:
    - [ ] Compute idempotency key: `${decision.ticketId}:${decision.action}:1`
    - [ ] Insert into `actions` table: `decision_id`, `type` (action), `amount_inr`, `status: 'simulated'`, `idempotency_key`, `created_at`
    - [ ] ON CONFLICT (idempotency_key) DO NOTHING — prevents double-refund
  - [ ] If `decision.lane === 'human'`:
    - [ ] Insert with `status: 'pending_approval'`
- [ ] Create `lib/audit/log.ts`:
  - [ ] Export `appendAuditLog(ticketId, eventType, actor, payload): Promise<void>`
  - [ ] Insert into `audit_log` table: `ticket_id`, `event_type`, `actor` ('system' | 'human'), `payload` (jsonb), `created_at`
  - [ ] Never UPDATE or DELETE — append only
- [ ] Create `lib/pipeline.ts`:
  - [ ] Export `processTicket(ticketId): Promise<Decision>`
  - [ ] Fetch ticket + order from database
  - [ ] Call `triage(ticket.description)` → Candidate
  - [ ] Call `makeDecision(candidate, order)` → Decision
  - [ ] Call `generateReply(decision, ticket, order)` → attach reply
  - [ ] Insert Decision into `decisions` table
  - [ ] Call `executeAction(decision)`
  - [ ] Call `appendAuditLog(ticketId, 'decision_made', 'system', {decision})`
  - [ ] Return Decision
- [ ] Create `app/api/tickets/process/route.ts` — POST handler:
  - [ ] Fetch all tickets from `tickets` table WHERE NOT EXISTS in `decisions`
  - [ ] For each ticket, call `processTicket(ticket.ticket_id)`
  - [ ] Return count of processed tickets

- [ ] Test: POST to `/api/tickets/process`, verify **30 rows in `decisions`**, **30 rows in `actions`** (11 `status='simulated'` + 19 `status='pending_approval'`), 30 rows in `audit_log`

**Depends on:** Sprint 5 (needs API structure), Sprint 4 (needs reply), Sprint 3 (needs Decision)

**Definition of done:**
- VALIDATION.md §1: "An `actions` row was written with `status: 'simulated'` — no real payment call" — implemented
- VALIDATION.md §1: "Re-running the pipeline on N-015 does not create a second action row (idempotency key holds)" — test passing
- VALIDATION.md §4: "No redelivery action row is written for either ticket" (N-001, N-017) — can verify with SQL query

**Invariant checkpoints:**
- Invariant #7: Audit log is append-only (no UPDATE or DELETE in code)
- Invariant #8: Actions are simulated (status field set correctly)

**Risk / fallback:** Idempotency key conflicts. Fallback: if ON CONFLICT doesn't work as expected, add a unique index manually and catch exceptions. Redeploy after this sprint.

---

## Sprint 7 — Live ticket submit endpoint (CRITICAL for Scenario 2)

**Clock window:** [Fill in: e.g. 14:00–14:10] (10 min)

**Objective:** `POST /api/tickets` endpoint works — the ONLY way to test Scenario 2 (novel ticket → human lane). Without this, you cannot demonstrate weak-evidence handling at all.

**Tasks:**
- [ ] Create `app/api/tickets/route.ts` — POST handler:
  - [ ] Parse body: `{ description: string, orderId?: string }`
  - [ ] If no orderId provided, **UPSERT** a single shared demo order `ORD-DEMO` (items=2, value_inr=500, delivery_status='delivered') — plain INSERT means the second novel ticket you submit dies on a primary-key collision, mid-demo
  - [ ] Insert the ticket with a **unique** id: `N-DEMO-${Date.now()}` — never a fixed `N-DEMO-001`
  - [ ] Call `processTicket(ticket.ticket_id)` from `lib/pipeline.ts`
  - [ ] Return the complete decision JSON
- [ ] Add a simple submit form to `page.tsx`:
  - [ ] Text input for description
  - [ ] Submit button → POST to `/api/tickets`
  - [ ] On success, show success message (manual refresh to see it on board)
- [ ] Test with novel strings from VALIDATION.md §2:
  - [ ] "delivery person was rude and threw the bag at my door"
  - [ ] "app crashed and charged me twice for the same order"
  - [ ] Verify both land in needs-human lane with topSimilarity < 0.45, vetoedBy='G5'
- [ ] Redeploy

**Depends on:** Sprint 6 (needs processTicket pipeline)

**Definition of done:**
- VALIDATION.md §2: "Inject via POST /api/tickets (the demo box)" — endpoint works
- VALIDATION.md §2: "Each novel ticket lands in the needs-human lane" — verified with test strings
- VALIDATION.md §6 pre-demo: "Live submit box works with a novel string (scenario 2 depends on this)" — critical path complete

**Invariant checkpoints:**
- None at risk (simple CRUD endpoint)

**Risk / fallback:** None. This is 10 minutes of work. Do NOT skip. Without this, Scenario 2 is undemonstrable and Stop-Gate 2 cannot be satisfied.

---

## Sprint 8 — Swap template → LLM replies

**Clock window:** [Fill in: e.g. 14:10–14:35] (25 min)

**Objective:** An LLM generates customer replies; template is the fallback for failures.

**Tasks:**
- [ ] Install an OpenAI-compatible client: `npm install openai` (covers Groq and Gemini alike — do NOT install a provider-specific SDK; swapping providers must stay an env change)
- [ ] Set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (default: Groq free tier, no credit card)
- [ ] Create `lib/reply/llm.ts`:
  - [ ] Export `generateLLMReply(decision, ticket, order, precedents): Promise<string>`
  - [ ] Construct prompt:
    - [ ] "You are drafting a customer support reply. Action: {action}, Amount: {amount}. Based on these similar past cases: [list top-3 precedents]. Write a short, warm, specific message. Do not invent amounts or timelines beyond what you were given."
  - [ ] Call the model with a 5s timeout (`LLM_TIMEOUT_MS`)
  - [ ] **Throttle to `LLM_MAX_CONCURRENCY` (3).** Groq's free tier caps at 6,000 tokens/min; 30 tickets × ~700 tokens ≈ 21k and will 429 if fired at once. Cache by `ticket_id` — it is a one-time ~4 min batch.
  - [ ] Treat HTTP 429 exactly like a timeout → fall back to template, never crash
  - [ ] Return reply text
  - [ ] On error or timeout: throw (caller will catch and fall back to template)
- [ ] Update `lib/reply/index.ts`:
  - [ ] Try `generateLLMReply()` first
  - [ ] On success, return `{reply, source: 'llm'}`
  - [ ] On failure (error, timeout, missing key), log warning, call `generateTemplateReply()`, return `{reply, source: 'template'}`
- [ ] Update `decisions` table to store `reply_source` field
- [ ] Test: kill the API key, verify templates still work
- [ ] Test: force a 429 (raise concurrency), verify graceful template fallback
- [ ] Test: restore API key, verify LLM replies generate
- [ ] Redeploy to production

**Depends on:** Sprint 4 (extends reply generation), Sprint 7 (needs deployment)

**Definition of done:**
- VALIDATION.md §1: "Drafted reply exists, names the action and the ₹ amount, and references the precedents" — LLM prompt instructs this
- VALIDATION.md §6 pre-demo: "Kill the LLM API key and reload — template replies render, nothing 500s" — test passing

**Invariant checkpoints:**
- Invariant #2: Only Stage 3 calls an LLM (this is Stage 3)
- Invariant #10: Demo must survive a dead LLM key — fallback path tested

**Risk / fallback:** LLM is slow or costs balloon. Fallback: cache replies by `ticket_id` in the database (check `decisions.draft_reply` before calling LLM). If costs are an issue, keep template as primary and gate LLM behind a flag. Redeploy after this sprint.

---

## 🛑 STOP-GATE 1 — Core Complete Checkpoint

**DO NOT PROCEED to Sprint 9 until ALL of the following are verified:**

- [ ] All 8 core sprints marked complete above
- [ ] `POST /api/ingest` successfully loads 360 rows total (on public URL)
- [ ] `POST /api/tickets/process` creates 30 decisions, 11 actions (status='simulated'), 30 audit log entries
- [ ] `GET /api/board` returns 11 auto-resolved, 19 needs-human *(count the 30 seeded tickets only — Sprint 7 demo tickets add to these totals)*
- [ ] Public URL is live and board loads with populated lanes
- [ ] All 5 guardrails (G1–G5) are implemented and unit tested
- [ ] Template fallback works (tested with missing LLM key)
- [ ] TF-IDF retrieval returns correct top-3 precedents for "bread not in the bag"
- [ ] **Scenario 1 (N-015):** lane='auto', action='partial_refund', amount=82
- [ ] **Scenario 2 (novel ticket):** POST to `/api/tickets` with "delivery person was rude" → lane='human', topSimilarity < 0.45, vetoedBy='G5'
- [ ] **Scenario 3 (N-011):** "curd delivered warm and spoiled" → lane='human', voteMargin ≈ 0.00
- [ ] **Scenario 4 (N-001):** "wrong brand of rice" on cancelled order → lane='human', vetoedBy='G1'
- [ ] Confidence formula `topSimilarity × voteShare` implemented correctly

**If any item above is not checked, fix it before continuing. Bonus features are worthless if core is broken.**

---

## Sprint 9 — Threshold slider / what-if replay

**Clock window:** [Fill in: e.g. 14:35–15:05] (30 min)

**Objective:** UI has interactive sliders for the three thresholds; dragging them re-partitions the board instantly without re-running inference.

**Tasks:**
- [ ] Create `components/ThresholdControls.tsx`:
  - [ ] Three range sliders:
    - [ ] `MIN_SIMILARITY`: 0.0–1.0, step 0.05, default 0.45
    - [ ] `MIN_VOTE_SHARE`: 0.0–1.0, step 0.05, default 0.60
    - [ ] `MIN_VOTE_MARGIN`: 0.0–1.0, step 0.05, default 0.15
  - [ ] Display current values above each slider
  - [ ] On change, call `/api/replay?sim={sim}&share={share}&margin={margin}`
- [ ] Create `app/api/replay/route.ts` — GET handler:
  - [ ] Parse query params: `sim`, `share`, `margin`
  - [ ] Fetch all decisions from `decisions` table (scores already stored)
  - [ ] For each decision, re-apply gate with new thresholds:
    - [ ] Check: `topSimilarity >= sim` AND `voteShare >= share` AND `voteMargin >= margin` AND `vetoedBy === null`
    - [ ] If true → lane='auto', else → lane='human'
  - [ ] Partition into two arrays, return `{ autoResolved, needsHuman }`
  - [ ] **Do not** re-run triage, do not re-generate replies — pure recomputation of stored scores
- [ ] Update `page.tsx` to include ThresholdControls at top of board
- [ ] Test: drag **MIN_VOTE_SHARE** from 0.60 → 0.55 and watch **N-002 / N-005 / N-019** ("milk packet missing") flip human → auto. Board goes 11/19 → 14/16.
- [ ] Bigger swing if you want a louder demo moment: share → 0.50 gives 21 auto / 9 human

> ⚠️ **Corrected from the original plan.** Dragging `MIN_VOTE_MARGIN` 0.15 → 0.05 changes **nothing** — verified against the data. "Milk packet missing" has share **0.57**, already below the 0.60 share gate, so margin is not the binding constraint. `MIN_VOTE_SHARE` is the slider that actually moves cards.
- [ ] Redeploy

**Depends on:** Sprint 8 (core complete)

**Definition of done:**
- VALIDATION.md §5: "sits right on the margin boundary; confirm which side it falls and that the behaviour is stable, not flapping between runs" — can manually test with slider
- Demonstrates that thresholds are a real, tuneable mechanism (key demo moment)

**Invariant checkpoints:**
- Invariant #3: Slider reads default values from `THRESHOLDS` object

**Risk / fallback:** Slider UI is fiddly. Fallback: use plain number inputs instead of range sliders; functionality > aesthetics. Redeploy after this sprint.

---

## Sprint 10 — Savings counter

**Clock window:** [Fill in: e.g. 15:05–15:20] (15 min)

**Objective:** Board header shows "X agent-minutes saved" based on auto-resolved count.

**Tasks:**
- [ ] Create `lib/metrics.ts`:
  - [ ] Export `computeSavings(autoResolvedCount: number): number`
  - [ ] Formula: `autoResolvedCount × 25` (median `time_to_resolve_min` from DATA.md §1)
- [ ] Update `app/api/board/route.ts`:
  - [ ] Call `computeSavings(autoResolved.length)`
  - [ ] Return additional field: `savings: number`
- [ ] Update `page.tsx`:
  - [ ] Display at top: "⏱️ {savings} agent-minutes saved" or "Saved {savings / 60} hours of manual work"
- [ ] Test: with 11 auto-resolved, expect 11 × 25 = 275 agent-minutes
- [ ] Redeploy

**Depends on:** Sprint 9 (or Sprint 8 minimum)

**Definition of done:**
- VALIDATION.md §6 pre-demo: "Savings counter matches auto_count × 25 min = 11 × 25 = 275 agent-minutes" — verified

**Invariant checkpoints:**
- None at risk

**Risk / fallback:** None. This is a one-line calculation. If it takes >15 min, you're overthinking it. Redeploy after this sprint.

---

## Sprint 11 — Approve/override writes back to precedents

**Clock window:** [Fill in: e.g. 15:20–15:50] (30 min)

**Objective:** Human can approve or override a decision; approved decisions are appended to `resolved_tickets` and feed future votes.

**Tasks:**
- [ ] Create `app/api/decisions/[id]/override/route.ts` — POST handler:
  - [ ] Parse body: `{ approved: boolean, overrideAction?: ResolutionAction, overrideAmount?: number, reason: string }`
  - [ ] Fetch decision by id
  - [ ] If `approved === true`:
    - [ ] Insert into `resolved_tickets`: `ticket_id` (use original ticket's description hash or new synthetic ID), `category` (from decision), `description`, `resolution_action` (from decision), `resolution_note` ('human approved'), `time_to_resolve_min` (set to 25, the median from history), `csat` (set to 4, the mode from history), `source='human_approved'`
    - [ ] Mark this decision as approved in `decisions` table (add `approved_at` timestamp column if needed)
  - [ ] If `approved === false` (override):
    - [ ] Insert into `resolved_tickets` with `overrideAction` instead of decision's action
  - [ ] Append to `audit_log`: `event_type='human_override'`, `actor='human'`, `payload={approved, reason, ...}`
  - [ ] Return success
- [ ] Update `TicketCard.tsx`:
  - [ ] Wire Approve button → POST to `/api/decisions/:id/override` with `{approved: true, reason: "Looks good"}`
  - [ ] Wire Override button → open modal/form for new action + reason, then POST
- [ ] Create `lib/config.ts`:
  - [ ] Export `ENABLE_WRITE_BACK` boolean (default false)
  - [ ] Gate the write-back behind this flag
  - [ ] Add comment: "⚠️ Turn OFF during judging — changes vote shares mid-demo"
- [ ] Test: approve N-015, verify new row in `resolved_tickets` with `source='human_approved'`
- [ ] Test: process a new ticket with same description, verify it retrieves the approved decision as a precedent
- [ ] **Before judging: set `ENABLE_WRITE_BACK=false` and redeploy**

**Depends on:** Sprint 10 (or Sprint 8 minimum)

**Definition of done:**
- Closes the "learns from history" loop mentioned in problem statement
- Flag exists to disable during demos

**Invariant checkpoints:**
- Invariant #7: Audit log is append-only (override writes new entry, doesn't edit)

**Risk / fallback:** Write-back breaks vote calculations during demo. Fallback: if uncertain, skip this sprint entirely — it's bonus, not core. The system works without it. Redeploy after this sprint if completed.

---

## Sprint 12 — Live ticket stream (Realtime board updates)

**Clock window:** [Fill in: e.g. 15:50–16:10] (20 min)

**Objective:** Board updates live when new tickets are processed via Supabase Realtime. (Note: the submit endpoint was already built in Sprint 7 — this is ONLY the live UI updates.)

**Tasks:**
- [ ] Install Supabase Realtime client: `npm install @supabase/supabase-js` (if not already installed)
- [ ] Update `page.tsx`:
  - [ ] Add Supabase Realtime subscription to `decisions` table
  - [ ] On INSERT, fetch new decision and append to appropriate lane without full page refresh
  - [ ] Optional: add toast notification when a new ticket is processed

- [ ] Test: POST a novel ticket via `/api/tickets`, verify board updates without manual refresh
- [ ] Redeploy

**Depends on:** Sprint 7 (needs POST /api/tickets endpoint already built)

**Definition of done:**
- Board updates in real-time when tickets are submitted (presentation polish)

**Invariant checkpoints:**
- None at risk

**Risk / fallback:** Realtime is flaky or adds latency. Fallback: skip Realtime subscription entirely — the submit box from Sprint 7 already works, users can manually refresh. This sprint is pure presentation value, cut if time is tight.

---

## Sprint 13 — Qdrant hybrid retrieval

**Clock window:** [Fill in: e.g. 15:50–16:30] (40 min)

**Objective:** Embeddings-based retrieval via Qdrant, fused with TF-IDF; falls back gracefully if Qdrant is unreachable.

**Tasks:**
- [ ] Set up Qdrant Cloud account or run Qdrant locally via Docker
- [ ] Install Qdrant client: `npm install @qdrant/js-client-rest`
- [ ] Create embedding generation script (one-time):
  - [ ] Use `@xenova/transformers` to run `Xenova/all-MiniLM-L6-v2` **locally** — no API key, no cost, no rate limit, 384 dims matching the `vector(384)` column. It is only 300 documents.
    - ⚠️ Do NOT use OpenAI `text-embedding-3-small`: it emits **1536** dims and will not fit `vector(384)`, and it adds a fifth paid credential.
  - [ ] Generate embeddings for all 300 `resolved_tickets` descriptions
  - [ ] Store in `resolved_tickets.embedding` column (vector(384))
- [ ] Create Qdrant collection:
  - [ ] Collection name: `resolved_tickets`
  - [ ] Vector size: 384 (or match your embedding model)
  - [ ] Payload: `{ticket_id, resolution_action, csat}`
- [ ] Upsert all 300 embeddings to Qdrant collection
- [ ] Create `lib/triage/qdrant-retriever.ts`:
  - [ ] Implement `QdrantRetriever` class with `search()` method
  - [ ] Generate embedding for query text
  - [ ] Search Qdrant collection, return top-k with cosine similarity
- [ ] Create `lib/triage/hybrid-retriever.ts`:
  - [ ] Implement `HybridRetriever` class
  - [ ] Run both `TfIdfRetriever` and `QdrantRetriever` in parallel
  - [ ] Fuse results with Reciprocal Rank Fusion: `score = Σ 1/(60 + rank_i)`
  - [ ] Return merged top-k
  - [ ] On Qdrant error (network timeout, unreachable), catch, log warning, return TF-IDF results only
- [ ] Add `RETRIEVER` environment variable: `'tfidf'` | `'hybrid'` (default `'tfidf'`)
- [ ] Update `lib/triage/index.ts` to select retriever based on `RETRIEVER` env var
- [ ] Test: set `RETRIEVER=hybrid`, process ticket with "my dahi came warm and had gone off", verify it retrieves "curd delivered warm and spoiled" cluster
- [ ] Test: kill Qdrant (stop container or set wrong URL), verify system degrades to TF-IDF and doesn't crash
- [ ] Redeploy with `RETRIEVER=hybrid`

**Depends on:** Sprint 12 (or Sprint 8 minimum)

**Definition of done:**
- VALIDATION.md §2 paraphrase robustness: "with RETRIEVER=hybrid it should retrieve the 'curd delivered warm and spoiled' cluster" — tested
- VALIDATION.md §6 pre-demo: "Set RETRIEVER=hybrid with Qdrant unreachable — degrades to TF-IDF, nothing 500s" — tested

**Invariant checkpoints:**
- Invariant #10: Demo must survive unreachable Qdrant (fallback to TF-IDF)

**Risk / fallback:** Embeddings take too long to generate or Qdrant setup is complex. Fallback: skip this sprint entirely. TF-IDF-only is a complete, valid submission per ARCHITECTURE.md §1.1 "non-negotiable build order". Qdrant is explicitly bonus. Redeploy only if completed.

---

## 🛑 STOP-GATE 2 — Final Pre-Demo Checklist

**DO NOT present to judges until ALL items below are verified on the public deployed URL:**

From VALIDATION.md §6:

- [ ] Public URL loads and shows a populated board — no empty state, no spinner of death
- [ ] Public GitHub repo is up, README links the live URL, no secrets committed
- [ ] Auto and human lanes both have cards (11 / 19 — an empty lane looks broken)
- [ ] Every card shows: action, amount, confidence, top-3 precedents, drafted reply
- [ ] "Why this action?" is answerable from the UI alone, without you narrating
- [ ] Kill the LLM API key and reload — template replies render, nothing 500s
- [ ] Set RETRIEVER=hybrid with Qdrant unreachable — degrades to TF-IDF, nothing 500s
- [ ] Live submit box works with a novel string (scenario 2 depends on this)
- [ ] Approve/override writes to the audit log and the log is visible
- [ ] Write-back to precedents is SWITCHED OFF during judging (ENABLE_WRITE_BACK=false)
- [ ] Threshold slider re-partitions the board without re-running inference
- [ ] Savings counter matches auto_count × 25 min = 11 × 25 = 275 agent-minutes
- [ ] Cold-load the deployed URL in a private window — no cached-state illusions

**Bookmark these four cards (one per validation scenario):**
- [ ] N-015 (Scenario 1: auto + capped refund)
- [ ] Injected novel ticket (Scenario 2: weak evidence)
- [ ] N-011 (Scenario 3: 7–7 tie)
- [ ] N-001 (Scenario 4: cancelled-order veto)

**If any item is not checked, fix it. A partial demo is worse than no demo.**

---

## Master Timeline Table

| Sprint | Clock Window | Cumulative Core % | Notes |
|--------|--------------|-------------------|-------|
| 1 — Ingest + Deploy Skeleton | [+45 min] | 14% | Early deploy per ARCHITECTURE.md §7 |
| 2 — TF-IDF + Vote | [+40 min] | 26% | |
| 3 — Policy + Guardrails | [+50 min] | 42% | |
| 4 — Template Replies | [+20 min] | 48% | |
| 5 — Board UI | [+60 min] | 67% | |
| 6 — Actions + Audit | [+25 min] | 75% | |
| 7 — Live Submit Endpoint | [+10 min] | 78% | **CRITICAL for Scenario 2** |
| 8 — LLM Replies | [+25 min] | 87% | |
| **STOP-GATE 1** | — | **100% core** | All 4 scenarios testable |
| 9 — Threshold Slider | [+30 min] | Bonus | Highest demo ROI |
| 10 — Savings Counter | [+15 min] | Bonus | Cheapest win |
| 11 — Write-back | [+30 min] | Bonus | Optional |
| 12 — Live Stream Realtime | [+20 min] | Bonus | Presentation polish only |
| 13 — Qdrant Hybrid | [+40 min] | Bonus | Cut first if time is tight |
| **STOP-GATE 2** | — | — | Pre-demo checklist |

**Core total:** 275 minutes (4h 35m)  
**Remaining buffer after core:** 85 minutes  
**All 5 bonus sprints:** 135 minutes (does NOT fit)  
**Realistic bonus target:** Pick 2–3 sprints from {9, 10, 13} or {9, 10, 11} based on your priorities

---

## Three One-Line Answers for Judges

Sourced directly from ARCHITECTURE.md, memorize these:

1. **"What stops a runaway refund?"**  
   → "The AI never picks the number — `clampRefund()` in `lib/policy/guardrails.ts` does, and here is the line." (Show G2 code)

2. **"What happens if the LLM key dies?"**  
   → "Template replies render instead — the decision pipeline is deterministic and doesn't depend on the model. Only the reply prose comes from the model." (Kill key live and reload)

3. **"Why only one LLM call?"**  
   → "Triage, Policy and Audit are pure functions — unit-testable, instantaneous, free, and they cannot hallucinate a refund amount. The model writes prose; it does not decide whether to move money."

---

## Validation Scenario Quick Reference

**Scenario 1 — Strong precedents → auto-resolve (N-015)**
- Ticket: "bread not in the bag" on ORD-9915 (delivered, ₹412, 5 items)
- Expected: lane='auto', action='partial_refund', amount=82, confidence high, top-3 precedents shown, reply cites precedents
- Key check: Refund ≤ order value (G2 holds)

**Scenario 2 — Novel ticket → human lane**
- Test strings: "delivery person was rude", "app crashed and charged me twice", "I want to close my account"
- Expected: topSimilarity < 0.45, lane='human', vetoedBy='G5', no action executed, drafted reply still exists
- Critical: Live submit box must work

**Scenario 3 — Precedents disagree → queue (N-011, N-016, N-021)**
- Ticket: "curd delivered warm and spoiled" (exact 7–7 tie)
- Expected: lane='human' despite similarity ≈ 1.0, voteMargin ≈ 0.00, split displayed, suggested action attached but not executed
- Structural: Unit test ensures margin 0.00 can never auto-resolve

**Scenario 4 — Cancelled order blocks redelivery (N-001, N-017)**
- Ticket: "wrong brand of rice delivered" on cancelled orders
- Expected: lane='human', vetoedBy='G1', proposed action was 'redelivery' but blocked, 'cancelled' chip is red
- Key: Confidence score is high (would auto-resolve on similarity alone) — proves guardrail is doing real work

---

## Cut Priority (if time runs out)

**Never cut:**
- Sprints 1–8 (entire core pipeline)
- G1, G2, G5 (validation scenarios 1, 2, 4)
- Template replies (fallback for Invariant #10)
- Sprint 7 live submit endpoint (Scenario 2 is untestable without it)

**Cut in this order if time is tight:**
1. Sprint 13 (Qdrant) — TF-IDF-only is valid per ARCHITECTURE.md, explicitly bonus
2. Sprint 12 (Realtime updates) — submit box already works from Sprint 7, this is just live UI polish
3. Sprint 11 (write-back) — closes the loop but not essential for any validation scenario
4. Sprint 10 (savings counter) — one-line metric, nice demo flourish but not critical

**Pick 2–3 bonus sprints maximum.** Recommended combinations:
- **Best ROI:** Sprints 9 + 10 (45 min total) — slider + counter, both high demo impact
- **If time allows:** Sprints 9 + 10 + 13 (85 min total) — adds Qdrant for Bonus row satisfaction
- **Safe path:** Sprints 9 + 10 only, use remaining time to polish core and run validation tests

**If core is taking too long:**
- Sprint 5 UI: go bare-bones, plain text cards, no styling
- Sprint 8 LLM: stick with templates, skip LLM entirely (Invariant #10 allows this)
- But NEVER cut guardrails, the gate logic, or the submit endpoint

---

## Notes

- This plan assumes solo builder. Core fits in 275 minutes (4h 35m) with 85-minute buffer.
- **Bonus sprints total 135 minutes and DO NOT all fit.** Pick 2–3 based on priorities.
- Deploy happens early (Sprint 1) per ARCHITECTURE.md §7: "at ~60% done, not at the end."
- Sprint 7 (live submit endpoint) is in core, not bonus — it's the ONLY way to test Scenario 2.
- Each sprint has explicit file paths from ARCHITECTURE.md — do not invent new structure without checking.
- Stop-gates are hard blockers. Do not proceed if prior work is incomplete.
- Validation scenarios map to specific ticket IDs — test against those exact tickets.
- The board split (11 auto / 19 human) is the expected state with default thresholds — if yours differs, something is wrong.

**Remember:** A small finished system beats a large broken one. Core first, bonus only if time permits.

---

**END OF PLAN**