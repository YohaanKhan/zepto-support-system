"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { LogoMark, LogoWordmark } from "@/components/Logo";
import { DEFAULT_REPLAY_THRESHOLDS, laneAtThresholds } from "@/lib/policy/replay";

// The presentation homepage. A single scrollable narrative of the system —
// problem, pipeline, guardrails, the data gotchas, the stack, and the build
// plan — with a few interactive pieces (clickable pipeline, a live gate
// simulator). Everything here is sourced from the repo's own docs so the
// homepage never drifts from the code.

const STAGES: {
  id: string;
  n: string;
  title: string;
  icon: IconName;
  tagline: string;
  detail: string;
  points: string[];
}[] = [
  {
    id: "retrieve",
    n: "01",
    title: "Retrieve",
    icon: "layers",
    tagline: "Find the evidence",
    detail:
      "TF-IDF over unigrams + bigrams of 300 historical tickets, ranked by cosine similarity. ~40 lines of TypeScript — no Python service, no black box.",
    points: [
      "Indexes descriptions only — never resolution_note (it leaks the label)",
      "Votes over the whole cluster ≥ MIN_SIMILARITY, capped at K = 50",
      "Optional Qdrant dense retrieval, fused with RRF, degrades to TF-IDF",
    ],
  },
  {
    id: "vote",
    n: "02",
    title: "Vote",
    icon: "scale",
    tagline: "Measure agreement",
    detail:
      "Each precedent votes for its action with weight = similarity × CSAT. We sum by action to get a share and a margin over the runner-up.",
    points: [
      "Confidence = topSimilarity × voteShare",
      "Deterministic tie-break: CSAT desc, then ticket_id asc",
      "A 7–7 split has margin 0.00 and can never auto-resolve",
    ],
  },
  {
    id: "guard",
    n: "03",
    title: "Guard",
    icon: "shield",
    tagline: "Apply policy",
    detail:
      "Five deterministic guardrails (G1–G5) run before anything is routed. They veto, clamp, or compute — the model is never in this path.",
    points: [
      "No redelivery on a cancelled order (G1)",
      "No refund ever exceeds the order value (G2)",
      "Escalation never auto-executes (G4)",
    ],
  },
  {
    id: "route",
    n: "04",
    title: "Route",
    icon: "target",
    tagline: "Decide the lane",
    detail:
      "Auto-resolve only when every gate holds AND no guardrail vetoed. Otherwise the ticket is queued for a human — with a drafted reply and precedents attached either way.",
    points: [
      "Auto iff topSim ≥ 0.45 · share ≥ 0.60 · margin ≥ 0.15 · no veto",
      "Every action is simulated with an idempotency key",
      "The 30 shipped tickets split 11 auto / 19 human",
    ],
  },
];

const GUARDRAILS: { id: string; kind: string; title: string; body: string; icon: IconName }[] = [
  { id: "G1", kind: "veto", title: "Cancelled-order redelivery", body: "delivery_status === 'cancelled' blocks a redelivery action. It's a string, not a flag.", icon: "package" },
  { id: "G2", kind: "mutate", title: "Refund cap", body: "clampRefund() clamps any amount to order.value_inr. The AI never picks the number.", icon: "scale" },
  { id: "G3", kind: "compute", title: "Partial refund", body: "floor(value_inr / items), clamped to the order value. Pure arithmetic from policy.", icon: "target" },
  { id: "G4", kind: "veto", title: "No auto-escalation", body: "escalation always requires a human. It can never auto-execute.", icon: "users" },
  { id: "G5", kind: "veto", title: "Weak evidence", body: "topSimilarity < 0.45 → novel ticket → human lane. Tests similarity, not confidence.", icon: "eye" },
];

const FACTS: { title: string; body: string }[] = [
  { title: "History has no order_id", body: "resolved_tickets.csv cannot be joined to orders. You cannot learn context-conditioned policy — so we don't try to." },
  { title: "History has no ₹ amounts", body: "Every refund figure is our policy, defined once in code. Nothing about money is learned from the data." },
  { title: "'cancelled' is a string", body: "There is no is_cancelled boolean. The guardrail tests delivery_status === 'cancelled' — writing if (order.cancelled) silently disables G1." },
  { title: "Every incoming ticket is a verbatim match", body: "Similarity ≈ 1.0 for all 30. Gating on similarity alone would auto-resolve 100% — so confidence gates on vote margin and share too." },
];

const STACK: { name: string; role: string; icon: IconName }[] = [
  { name: "Next.js + TypeScript", role: "App Router UI & API routes", icon: "code" },
  { name: "Supabase / Postgres", role: "Source of truth — 6 tables", icon: "database" },
  { name: "TF-IDF retriever", role: "Sparse similarity, in-process", icon: "layers" },
  { name: "Qdrant (optional)", role: "Dense vectors, RRF hybrid", icon: "network" },
  { name: "OpenAI-compatible LLM", role: "Reply prose only — Groq default", icon: "message" },
  { name: "Vercel", role: "Public deploy from ~60% done", icon: "zap" },
];

const SCENARIOS: { n: string; title: string; body: string; result: string; tone: "auto" | "human" }[] = [
  { n: "1", title: "Strong precedents", body: "“bread not in the bag” — 17 precedents agree on partial_refund.", result: "Auto · ₹82 (capped)", tone: "auto" },
  { n: "2", title: "Novel complaint", body: "“delivery person was rude” — nothing in history is close.", result: "Human · G5 weak evidence", tone: "human" },
  { n: "3", title: "Precedents disagree", body: "“curd delivered warm and spoiled” — an exact 7–7 tie.", result: "Human · margin 0.00", tone: "human" },
  { n: "4", title: "Cancelled order", body: "“wrong brand of rice” on a cancelled order.", result: "Human · G1 veto", tone: "human" },
];

const SPRINTS: { n: number; title: string; bonus: boolean }[] = [
  { n: 1, title: "Ingest + deploy", bonus: false },
  { n: 2, title: "TF-IDF + vote", bonus: false },
  { n: 3, title: "Policy + guardrails", bonus: false },
  { n: 4, title: "Template replies", bonus: false },
  { n: 5, title: "Two-lane board", bonus: false },
  { n: 6, title: "Actions + audit", bonus: false },
  { n: 7, title: "Live submit box", bonus: false },
  { n: 8, title: "LLM replies", bonus: false },
  { n: 9, title: "Threshold slider", bonus: true },
  { n: 10, title: "Savings counter", bonus: true },
  { n: 11, title: "Approve / override", bonus: true },
  { n: 12, title: "Realtime stream", bonus: true },
  { n: 13, title: "Qdrant hybrid", bonus: true },
];

export default function HomePage() {
  const [activeStage, setActiveStage] = useState(0);
  const stage = STAGES[activeStage];

  return (
    <div className="home">
      <SiteNav />

      {/* Hero */}
      <header className="home-hero">
        <div className="home-hero-inner">
          <span className="home-eyebrow"><Icon name="sparkles" /> Agentic AI Hackathon · Q4</span>
          <h1>
            Support tickets that <span>resolve themselves</span> — safely.
          </h1>
          <p className="home-lede">
            ZeptoSupport auto-resolves routine tickets by matching them against 300 historically
            resolved cases, and queues the rest for humans with precedents attached. Every decision
            is deterministic, auditable, and reproducible with the model offline.
          </p>
          <div className="home-hero-cta">
            <Link href="/board" className="home-btn home-btn-primary">
              <Icon name="overview" /> Open the live board
            </Link>
            <a href="#pipeline" className="home-btn home-btn-ghost">
              <Icon name="workflow" /> See how it works
            </a>
          </div>
          <dl className="home-stat-row">
            <Stat value="300" label="historical precedents" />
            <Stat value="11 / 19" label="auto / human split" />
            <Stat value="5" label="policy guardrails" />
            <Stat value="1" label="LLM call — reply only" />
          </dl>
        </div>
        <div className="home-hero-glow" aria-hidden="true" />
      </header>

      {/* Problem */}
      <Section id="problem" kicker="The problem" title="A human reads every ticket, even the obvious ones">
        <div className="home-problem">
          <div className="home-problem-card home-problem-before">
            <span className="home-tag home-tag-muted">Without the system</span>
            <p>Every “item missing”, “refund not received”, “wrong brand” ticket waits in one queue for a human — the routine ones buried with the genuinely hard ones.</p>
          </div>
          <div className="home-problem-arrow"><Icon name="arrowRight" /></div>
          <div className="home-problem-card home-problem-after">
            <span className="home-tag home-tag-brand">With ZeptoSupport</span>
            <p>Routine tickets are matched to precedent and resolved automatically inside guardrails. Humans see only conflicts, weak evidence, and policy vetoes — each with a drafted reply ready to send.</p>
          </div>
        </div>
      </Section>

      {/* Interactive pipeline */}
      <Section id="pipeline" kicker="How it decides" title="Four deterministic stages, one reproducible path">
        <p className="home-section-lede">
          Triage, policy, and audit are pure functions. The only model call writes the customer
          reply — it never decides whether money moves. Click a stage to open it.
        </p>
        <div className="home-pipeline">
          <div className="home-pipeline-track" role="tablist" aria-label="Pipeline stages">
            {STAGES.map((s, index) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={index === activeStage}
                className={`home-stage ${index === activeStage ? "active" : ""}`}
                onClick={() => setActiveStage(index)}
              >
                <span className="home-stage-icon"><Icon name={s.icon} /></span>
                <b>{s.n}</b>
                <strong>{s.title}</strong>
                <small>{s.tagline}</small>
                {index < STAGES.length - 1 && <i className="home-stage-link" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="home-stage-detail" role="tabpanel">
            <div className="home-stage-detail-head">
              <span><Icon name={stage.icon} /></span>
              <div>
                <small>Stage {stage.n}</small>
                <h3>{stage.title}</h3>
              </div>
            </div>
            <p>{stage.detail}</p>
            <ul>
              {stage.points.map((point) => (
                <li key={point}><Icon name="check" /> {point}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Gate simulator */}
      <Section id="gate" kicker="Try it" title="The gate is a rule, not a vibe">
        <p className="home-section-lede">
          Move a ticket&apos;s scores and watch the lane flip. These are the exact thresholds the
          board ships with — auto-resolve needs all three to clear at once.
        </p>
        <GateSimulator />
      </Section>

      {/* Guardrails */}
      <Section id="guardrails" kicker="Safety" title="Five guardrails the model can't argue with">
        <div className="home-guardrails">
          {GUARDRAILS.map((g) => (
            <article key={g.id} className={`home-guardrail home-guard-${g.kind}`}>
              <header>
                <span className="home-guard-icon"><Icon name={g.icon} /></span>
                <b>{g.id}</b>
                <span className={`home-guard-kind kind-${g.kind}`}>{g.kind}</span>
              </header>
              <h3>{g.title}</h3>
              <p>{g.body}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* Data facts */}
      <Section id="data" kicker="The hard part" title="Four data facts that break naive code">
        <div className="home-facts">
          {FACTS.map((fact, index) => (
            <article key={fact.title} className="home-fact">
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>{fact.title}</h3>
                <p>{fact.body}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* Scenarios */}
      <Section id="scenarios" kicker="Validation" title="Four scenarios, four correct outcomes">
        <div className="home-scenarios">
          {SCENARIOS.map((s) => (
            <article key={s.n} className={`home-scenario scenario-${s.tone}`}>
              <span className="home-scenario-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <div className={`home-scenario-result result-${s.tone}`}>
                <Icon name={s.tone === "auto" ? "check" : "alert"} /> {s.result}
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* Stack */}
      <Section id="stack" kicker="Architecture" title="A small, finished system">
        <div className="home-stack">
          {STACK.map((item) => (
            <article key={item.name} className="home-stack-item">
              <span><Icon name={item.icon} /></span>
              <div>
                <b>{item.name}</b>
                <small>{item.role}</small>
              </div>
            </article>
          ))}
        </div>
        <div className="home-principles">
          <Principle icon="lock" text="Only the reply-writer calls an LLM. Triage, policy and audit are pure and reproducible offline." />
          <Principle icon="sliders" text="Every threshold lives in one file. No magic numbers anywhere else." />
          <Principle icon="history" text="The audit log is append-only. Overrides append a new row — they never edit history." />
          <Principle icon="shield" text="The demo survives a dead LLM key and an unreachable Qdrant. Both degrade; neither 500s." />
        </div>
      </Section>

      {/* Sprint timeline */}
      <Section id="build" kicker="The build" title="Eight core sprints, then bonus">
        <div className="home-timeline">
          {SPRINTS.map((s) => (
            <div key={s.n} className={`home-sprint ${s.bonus ? "bonus" : "core"}`}>
              <b>{s.n}</b>
              <span>{s.title}</span>
              {s.bonus && <i className="home-sprint-tag">bonus</i>}
            </div>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <section className="home-final">
        <div className="home-final-inner">
          <LogoMark size={54} />
          <h2>See it decide in real time</h2>
          <p>Open the board, run the pipeline over 30 tickets, drag the thresholds, and drop a novel ticket into the live box.</p>
          <Link href="/board" className="home-btn home-btn-primary home-btn-lg">
            <Icon name="overview" /> Open the live board <Icon name="arrowRight" />
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <LogoWordmark size={30} tagline="Agentic ticket resolution" />
        <p>Deterministic by design · Auditable by default</p>
      </footer>
    </div>
  );
}

function SiteNav() {
  return (
    <nav className="home-nav">
      <Link href="/" className="home-nav-brand"><LogoWordmark size={32} /></Link>
      <div className="home-nav-links">
        <a href="#pipeline">Pipeline</a>
        <a href="#guardrails">Guardrails</a>
        <a href="#data">Data</a>
        <a href="#stack">Stack</a>
      </div>
      <Link href="/board" className="home-btn home-btn-primary home-nav-cta">
        <Icon name="overview" /> Live board
      </Link>
    </nav>
  );
}

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="home-section">
      <div className="home-section-head">
        <span className="home-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="home-stat">
      <dt>{value}</dt>
      <dd>{label}</dd>
    </div>
  );
}

function Principle({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="home-principle">
      <span><Icon name={icon} /></span>
      <p>{text}</p>
    </div>
  );
}

function GateSimulator() {
  const [sim, setSim] = useState(1.0);
  const [share, setShare] = useState(0.68);
  const [margin, setMargin] = useState(0.35);

  const t = DEFAULT_REPLAY_THRESHOLDS;
  const lane = laneAtThresholds(
    { topSimilarity: sim, voteShare: share, voteMargin: margin, vetoedBy: null },
    t,
  );
  const confidence = sim * share;
  const checks = [
    { label: "Top similarity", value: sim, min: t.minSimilarity },
    { label: "Vote share", value: share, min: t.minVoteShare },
    { label: "Vote margin", value: margin, min: t.minVoteMargin },
  ];

  return (
    <div className="home-gate">
      <div className="home-gate-controls">
        <GateSlider label="Top similarity" value={sim} min={t.minSimilarity} onChange={setSim} />
        <GateSlider label="Vote share" value={share} min={t.minVoteShare} onChange={setShare} />
        <GateSlider label="Vote margin" value={margin} min={t.minVoteMargin} onChange={setMargin} />
      </div>
      <div className={`home-gate-verdict verdict-${lane}`}>
        <span className="home-gate-badge">
          <Icon name={lane === "auto" ? "check" : "alert"} />
          {lane === "auto" ? "Auto-resolve" : "Needs human"}
        </span>
        <div className="home-gate-conf">
          <small>confidence = topSim × share</small>
          <b>{Math.round(confidence * 100)}%</b>
        </div>
        <ul className="home-gate-checks">
          {checks.map((c) => {
            const pass = c.value >= c.min;
            return (
              <li key={c.label} className={pass ? "pass" : "fail"}>
                <Icon name={pass ? "check" : "close"} />
                {c.label} <b>{c.value.toFixed(2)}</b> <em>≥ {c.min.toFixed(2)}</em>
              </li>
            );
          })}
        </ul>
        <p className="home-gate-note">
          {lane === "auto"
            ? "All three gates clear and no guardrail vetoed — this ticket auto-resolves."
            : "At least one gate fails, so the ticket is queued for a human — with a drafted reply attached."}
        </p>
      </div>
    </div>
  );
}

function GateSlider({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const pass = value >= min;
  return (
    <div className="home-gate-slider">
      <small>
        {label}
        <b className={pass ? "pass" : "fail"}>{value.toFixed(2)}</b>
      </small>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        style={{ "--fill": `${Math.round(value * 100)}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
      <div className="home-gate-min" style={{ left: `${Math.round(min * 100)}%` } as CSSProperties}>
        <i />
        <span>min {min.toFixed(2)}</span>
      </div>
    </div>
  );
}
