-- Zepto Support Ticket Manager — schema (ARCHITECTURE.md §5).
-- 6 tables. Postgres is the source of truth; Qdrant (bonus) is a disposable
-- index rebuildable from resolved_tickets.embedding.

-- pgvector for the 384-dim embedding column (Sprint 13 fills it; NULL until then).
create extension if not exists vector;
-- gen_random_uuid()
create extension if not exists pgcrypto;

-- ── 1. resolved_tickets — the 300-row precedent corpus ─────────────────────
create table if not exists resolved_tickets (
  ticket_id            text primary key,               -- H-1000 … H-1299
  category             text not null,
  description          text not null,                  -- retrieval indexes THIS only
  resolution_action    text not null check (resolution_action in (
                         'redelivery','partial_refund','full_refund',
                         'refund_reissue','coupon','escalation','apology_no_action')),
  resolution_note      text not null,
  time_to_resolve_min  int  not null,                  -- savings counter only
  csat                 int  not null,                  -- 3..5 in this data
  source               text not null default 'seed'
                         check (source in ('seed','human_approved')),
  embedding            vector(384)                     -- NULL until Sprint 13
);

-- ── 2. orders — order context, read ONLY at the Policy stage ───────────────
create table if not exists orders (
  order_id         text primary key,                   -- ORD-9900 … ORD-9929
  items            int  not null,
  value_inr        int  not null,
  delivery_time_min int not null,
  delivery_status  text not null                       -- 'delivered' | 'cancelled' (string, not a flag)
                     check (delivery_status in ('delivered','cancelled'))
);

-- ── 3. tickets — the incoming queue ────────────────────────────────────────
create table if not exists tickets (
  ticket_id   text primary key,                        -- N-000 … N-029 (+ live demo tickets)
  created_at  timestamptz,                             -- naive IST stored as-is (DATA.md §2)
  order_id    text references orders(order_id),
  description text not null
);

-- ── 4. decisions — one per processed ticket, every score persisted ─────────
create table if not exists decisions (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      text not null references tickets(ticket_id),
  lane           text not null check (lane in ('auto','human')),
  action         text not null,
  amount_inr     int,                                   -- null when no money moves
  confidence     double precision not null,
  vote_share     double precision not null,
  vote_margin    double precision not null,
  top_similarity double precision not null,
  precedent_ids  text[] not null default '{}',
  guardrails     jsonb  not null default '[]',
  vetoed_by      text,                                  -- e.g. 'G1', or null
  reasoning      text   not null default '',
  draft_reply    text,
  reply_source   text check (reply_source in ('llm','template')),
  created_at     timestamptz not null default now()
);
create index if not exists decisions_ticket_id_idx on decisions(ticket_id);

-- ── 5. actions — simulated side effects, idempotent ────────────────────────
create table if not exists actions (
  id              uuid primary key default gen_random_uuid(),
  decision_id     uuid not null references decisions(id),
  type            text not null,
  amount_inr      int,
  status          text not null check (status in ('simulated','pending_approval')),
  idempotency_key text not null unique,                 -- {ticket_id}:{action}:{attempt}
  created_at      timestamptz not null default now()
);

-- ── 6. audit_log — APPEND ONLY. Overrides append; they never edit. ─────────
create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  text not null,
  event_type text not null,
  actor      text not null check (actor in ('system','human')),
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_ticket_id_idx on audit_log(ticket_id);
