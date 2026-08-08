"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { LogoMark, LogoWordmark } from "@/components/Logo";
import { DEFAULT_REPLAY_THRESHOLDS, laneAtThresholds } from "@/lib/policy/replay";

// ── Presentation homepage ──────────────────────────────────────────────────
// A single scrollable narrative — problem, live pipeline, guardrails, the data
// gotchas, architecture, and the build — with real interactive pieces: an
// animated flow diagram, a play-through decision walkthrough, and a live gate
// simulator. Everything is sourced from the repo's own docs so it never drifts.

const NAV = [
  { id: "pipeline", label: "Pipeline" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "guardrails", label: "Guardrails" },
  { id: "architecture", label: "Architecture" },
  { id: "build", label: "Build" },
];

export default function HomePage() {
  const active = useScrollSpy(NAV.map((n) => n.id));

  return (
    <div className="hp">
      <BackdropGrid />
      <SiteNav active={active} />

      <Hero />
      <Marquee />

      <Reveal>
        <Section id="pipeline" index="01" kicker="How it decides" title="Four deterministic stages, one reproducible path">
          <p className="hp-lede">
            Triage, policy, and audit are pure functions. The only model call writes the customer
            reply — it never decides whether money moves. Open a stage to see inside.
          </p>
          <Pipeline />
        </Section>
      </Reveal>

      <Reveal>
        <Section id="walkthrough" index="02" kicker="Watch one decide" title="A ticket, start to finish">
          <p className="hp-lede">
            Press play and follow <span className="hp-mono-inline">N-015</span> — “bread not in the
            bag” — through the pipeline with its real numbers.
          </p>
          <Walkthrough />
        </Section>
      </Reveal>

      <Reveal>
        <Section id="gate" index="03" kicker="Try it" title="The gate is a rule, not a vibe">
          <p className="hp-lede">
            Move a ticket&apos;s scores and watch the lane flip. These are the exact thresholds the
            board ships with — auto-resolve needs all three to clear at once.
          </p>
          <GateSimulator />
        </Section>
      </Reveal>

      <Reveal>
        <Section id="guardrails" index="04" kicker="Safety" title="Five guardrails the model can't argue with">
          <Guardrails />
        </Section>
      </Reveal>

      <Reveal>
        <Section id="data" index="05" kicker="The hard part" title="Four data facts that break naive code">
          <DataFacts />
        </Section>
      </Reveal>

      <Reveal>
        <Section id="architecture" index="06" kicker="Architecture" title="A small, finished system">
          <ArchitectureDiagram />
          <Principles />
        </Section>
      </Reveal>

      <Reveal>
        <Section id="scenarios" index="07" kicker="Validation" title="Four scenarios, four correct outcomes">
          <Scenarios />
        </Section>
      </Reveal>

      <Reveal>
        <Section id="build" index="08" kicker="The build" title="Eight core sprints, then bonus">
          <Timeline />
        </Section>
      </Reveal>

      <FinalCta />
      <Footer />
    </div>
  );
}

/* ── Chrome ────────────────────────────────────────────────────────────────*/

function SiteNav({ active }: { active: string }) {
  return (
    <div className="hp-nav-wrap">
      <nav className="hp-nav">
        <Link href="/" className="hp-nav-brand" aria-label="ZeptoSupport home">
          <LogoMark size={30} />
          <span>Zepto<b>Support</b></span>
        </Link>
        <div className="hp-nav-links">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={active === n.id ? "active" : ""}>
              {n.label}
            </a>
          ))}
        </div>
        <Link href="/board" className="hp-nav-cta">
          Open board <Icon name="arrowRight" />
        </Link>
      </nav>
    </div>
  );
}

function Hero() {
  return (
    <header className="hp-hero">
      <div className="hp-hero-copy">
        <span className="hp-pill"><i />Agentic AI Hackathon · Q4</span>
        <h1>
          Support tickets that <span className="hp-grad">resolve themselves</span>—safely.
        </h1>
        <p>
          ZeptoSupport auto-resolves routine tickets by matching them against 300 historically
          resolved cases, and queues the rest for humans with precedents attached. Every decision is
          deterministic, auditable, and reproducible with the model offline.
        </p>
        <div className="hp-hero-cta">
          <Link href="/board" className="hp-btn hp-btn-primary">
            <Icon name="overview" /> Open the live board
          </Link>
          <a href="#pipeline" className="hp-btn hp-btn-ghost">
            <Icon name="workflow" /> See how it works
          </a>
        </div>
        <div className="hp-hero-stats">
          <HeroStat value="300" label="precedents" />
          <HeroStat value="11/19" label="auto / human" />
          <HeroStat value="5" label="guardrails" />
          <HeroStat value="1" label="LLM call" />
        </div>
      </div>
      <FlowDiagram />
    </header>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="hp-hero-stat">
      <b>{value}</b>
      <small>{label}</small>
    </div>
  );
}

// Animated vertical pipeline with particles flowing down the spine and branching
// at the guardrails into the two lanes. Pure SVG + SMIL, self-contained.
function FlowDiagram() {
  const nodes: { y: number; icon: IconName; title: string; sub: string }[] = [
    { y: 24, icon: "ticket", title: "Incoming ticket", sub: "customer complaint" },
    { y: 116, icon: "layers", title: "Retrieve", sub: "TF-IDF + Qdrant" },
    { y: 208, icon: "scale", title: "Vote", sub: "CSAT-weighted" },
    { y: 300, icon: "shield", title: "Guard", sub: "G1–G5 policy" },
  ];
  const cx = 150;
  return (
    <div className="hp-flow" aria-hidden="true">
      <svg viewBox="0 0 300 440" width="100%" className="hp-flow-svg">
        <defs>
          <linearGradient id="hp-flow-line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2563eb" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        {/* spine */}
        <path id="hp-spine" d="M150 60 L150 300" stroke="url(#hp-flow-line)" strokeWidth="2" fill="none" />
        {/* branches */}
        <path id="hp-branch-auto" d="M150 336 C150 380 88 380 70 400" stroke="#10b981" strokeWidth="2" fill="none" strokeDasharray="4 4" />
        <path id="hp-branch-human" d="M150 336 C150 380 212 380 230 400" stroke="#f59e0b" strokeWidth="2" fill="none" strokeDasharray="4 4" />

        {/* flowing particles on the spine */}
        {[0, 1.3, 2.6].map((delay, i) => (
          <circle key={i} r="3.5" fill="#2563eb">
            <animateMotion dur="3.9s" begin={`${delay}s`} repeatCount="indefinite" rotate="auto">
              <mpath href="#hp-spine" />
            </animateMotion>
            <animate attributeName="opacity" values="0;1;1;0" dur="3.9s" begin={`${delay}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* particle to auto */}
        <circle r="3" fill="#10b981">
          <animateMotion dur="1.5s" begin="0.6s" repeatCount="indefinite"><mpath href="#hp-branch-auto" /></animateMotion>
        </circle>
        {/* particle to human */}
        <circle r="3" fill="#f59e0b">
          <animateMotion dur="1.5s" begin="1.9s" repeatCount="indefinite"><mpath href="#hp-branch-human" /></animateMotion>
        </circle>

        {/* stage nodes */}
        {nodes.map((n) => (
          <g key={n.title} transform={`translate(${cx - 108}, ${n.y})`}>
            <rect width="216" height="52" rx="13" className="hp-flow-node" />
            <rect x="12" y="12" width="28" height="28" rx="8" className="hp-flow-node-icon" />
            <g transform="translate(20, 20)" className="hp-flow-node-glyph">
              <Icon name={n.icon} width={12} height={12} />
            </g>
            <text x="52" y="24" className="hp-flow-node-title">{n.title}</text>
            <text x="52" y="38" className="hp-flow-node-sub">{n.sub}</text>
          </g>
        ))}

        {/* lanes */}
        <g transform="translate(18, 400)">
          <rect width="104" height="34" rx="10" className="hp-flow-lane hp-flow-lane-auto" />
          <text x="52" y="21" className="hp-flow-lane-text">Auto-resolve</text>
        </g>
        <g transform="translate(178, 400)">
          <rect width="104" height="34" rx="10" className="hp-flow-lane hp-flow-lane-human" />
          <text x="52" y="21" className="hp-flow-lane-text">Human review</text>
        </g>
      </svg>
    </div>
  );
}

function Marquee() {
  const items = ["TF-IDF retrieval", "CSAT-weighted vote", "G1–G5 guardrails", "Qdrant hybrid", "Idempotent actions", "Append-only audit", "Template fallback", "Deterministic gate"];
  return (
    <div className="hp-marquee" aria-hidden="true">
      <div className="hp-marquee-track">
        {[...items, ...items].map((item, i) => (
          <span key={i}><i /> {item}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Sections ──────────────────────────────────────────────────────────────*/

function Section({ id, index, kicker, title, children }: { id: string; index: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="hp-section">
      <div className="hp-section-head">
        <span className="hp-index">{index}</span>
        <div>
          <span className="hp-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

const STAGES: { id: string; n: string; title: string; icon: IconName; detail: string; points: string[] }[] = [
  { id: "retrieve", n: "01", title: "Retrieve", icon: "layers", detail: "TF-IDF over unigrams + bigrams of 300 historical tickets, ranked by cosine similarity. ~40 lines of TypeScript — no Python service, no black box.", points: ["Indexes descriptions only — never the resolution note", "Votes over the whole cluster ≥ MIN_SIMILARITY, capped at K = 50", "Optional Qdrant dense retrieval, fused with RRF"] },
  { id: "vote", n: "02", title: "Vote", icon: "scale", detail: "Each precedent votes for its action with weight = similarity × CSAT. Summed by action to get a share and a margin over the runner-up.", points: ["confidence = topSimilarity × voteShare", "Tie-break: CSAT desc, then ticket_id asc", "A 7–7 split has margin 0.00 → never auto-resolves"] },
  { id: "guard", n: "03", title: "Guard", icon: "shield", detail: "Five deterministic guardrails (G1–G5) run before routing. They veto, clamp, or compute — the model is never in this path.", points: ["No redelivery on a cancelled order (G1)", "No refund ever exceeds the order value (G2)", "Escalation never auto-executes (G4)"] },
  { id: "route", n: "04", title: "Route", icon: "target", detail: "Auto-resolve only when every gate holds and no guardrail vetoed. Otherwise queue for a human — with a drafted reply and precedents attached either way.", points: ["Auto iff topSim ≥ 0.45 · share ≥ 0.60 · margin ≥ 0.15", "Every action is simulated with an idempotency key", "The 30 shipped tickets split 11 auto / 19 human"] },
];

function Pipeline() {
  const [active, setActive] = useState(0);
  const s = STAGES[active];
  return (
    <div className="hp-pipeline">
      <div className="hp-pipe-rail" role="tablist" aria-label="Pipeline stages">
        {STAGES.map((stage, i) => (
          <button key={stage.id} role="tab" aria-selected={i === active} className={`hp-pipe-tab ${i === active ? "active" : ""}`} onClick={() => setActive(i)}>
            <span className="hp-pipe-num">{stage.n}</span>
            <span className="hp-pipe-ico"><Icon name={stage.icon} /></span>
            <span className="hp-pipe-name">{stage.title}</span>
            <Icon name="chevron" />
          </button>
        ))}
      </div>
      <div className="hp-pipe-panel" role="tabpanel">
        <div className="hp-pipe-panel-head">
          <span><Icon name={s.icon} /></span>
          <div>
            <small>Stage {s.n}</small>
            <h3>{s.title}</h3>
          </div>
        </div>
        <p>{s.detail}</p>
        <ul>
          {s.points.map((p) => <li key={p}><Icon name="check" /> {p}</li>)}
        </ul>
      </div>
    </div>
  );
}

// Play-through of N-015. Each step reveals the real numbers for that stage.
const WALK: { label: string; icon: IconName; head: string; metrics: { k: string; v: string }[]; note: string }[] = [
  { label: "Retrieve", icon: "layers", head: "17 precedents clear the floor", metrics: [{ k: "top similarity", v: "1.00" }, { k: "cluster size", v: "17" }, { k: "retriever", v: "TF-IDF" }], note: "Verbatim match — “bread not in the bag” is in the corpus." },
  { label: "Vote", icon: "scale", head: "partial_refund wins decisively", metrics: [{ k: "vote share", v: "0.68" }, { k: "vote margin", v: "0.35" }, { k: "confidence", v: "68%" }], note: "Weighted by similarity × CSAT across the whole cluster." },
  { label: "Guard", icon: "shield", head: "G2 clamps the refund", metrics: [{ k: "order value", v: "₹412" }, { k: "items", v: "5" }, { k: "refund", v: "₹82" }], note: "floor(412 / 5) = 82 ≤ order value. No veto fires." },
  { label: "Route", icon: "target", head: "Auto-resolved", metrics: [{ k: "similarity ≥ 0.45", v: "✓" }, { k: "share ≥ 0.60", v: "✓" }, { k: "margin ≥ 0.15", v: "✓" }], note: "All gates clear, no veto → simulated + audit-logged." },
];

function Walkthrough() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= WALK.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1500);
    return () => window.clearInterval(id);
  }, [playing]);

  const w = WALK[step];
  const isLast = step === WALK.length - 1;

  return (
    <div className="hp-walk">
      <div className="hp-walk-steps">
        {WALK.map((item, i) => (
          <button key={item.label} className={`hp-walk-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`} onClick={() => { setPlaying(false); setStep(i); }}>
            <span><Icon name={i < step ? "check" : item.icon} /></span>
            <b>{item.label}</b>
            {i < WALK.length - 1 && <i className="hp-walk-connect" />}
          </button>
        ))}
      </div>

      <div className={`hp-walk-card ${isLast ? "is-final" : ""}`}>
        <div className="hp-walk-card-head">
          <span className="hp-walk-card-ico"><Icon name={w.icon} /></span>
          <div>
            <small>Stage {step + 1} · {w.label}</small>
            <h3>{w.head}</h3>
          </div>
          {isLast && <span className="hp-walk-verdict"><Icon name="check" /> Auto</span>}
        </div>
        <div className="hp-walk-metrics">
          {w.metrics.map((m) => (
            <div key={m.k}><small>{m.k}</small><b>{m.v}</b></div>
          ))}
        </div>
        <p className="hp-walk-note">{w.note}</p>
      </div>

      <div className="hp-walk-controls">
        <button className="hp-btn hp-btn-primary" onClick={() => { if (isLast) { setStep(0); setPlaying(true); } else setPlaying((p) => !p); }}>
          <Icon name={playing ? "close" : "play"} /> {isLast ? "Replay" : playing ? "Pause" : "Play walkthrough"}
        </button>
        <div className="hp-walk-progress">
          <i style={{ width: `${((step + 1) / WALK.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

const GUARDRAILS: { id: string; kind: string; title: string; body: string; icon: IconName }[] = [
  { id: "G1", kind: "veto", title: "Cancelled-order redelivery", body: "delivery_status === 'cancelled' blocks redelivery. It's a string, not a flag.", icon: "package" },
  { id: "G2", kind: "clamp", title: "Refund cap", body: "clampRefund() clamps any amount to order.value_inr. The AI never picks the number.", icon: "scale" },
  { id: "G3", kind: "compute", title: "Partial refund", body: "floor(value_inr / items), clamped to the order value. Pure policy arithmetic.", icon: "target" },
  { id: "G4", kind: "veto", title: "No auto-escalation", body: "escalation always requires a human. It can never auto-execute.", icon: "users" },
  { id: "G5", kind: "veto", title: "Weak evidence", body: "topSimilarity < 0.45 → novel ticket → human. Tests similarity, not confidence.", icon: "eye" },
];

function Guardrails() {
  return (
    <div className="hp-guards">
      {GUARDRAILS.map((g) => (
        <article key={g.id} className="hp-guard">
          <div className="hp-guard-top">
            <span className="hp-guard-ico"><Icon name={g.icon} /></span>
            <b className="hp-guard-id">{g.id}</b>
            <span className={`hp-guard-kind kind-${g.kind}`}>{g.kind}</span>
          </div>
          <h3>{g.title}</h3>
          <p>{g.body}</p>
        </article>
      ))}
    </div>
  );
}

const FACTS: { title: string; body: string; code: string }[] = [
  { title: "History has no order_id", body: "resolved_tickets.csv can't be joined to orders. You cannot learn context-conditioned policy — so we don't try.", code: "// no join — history is context-blind" },
  { title: "History has no ₹ amounts", body: "Every refund figure is our policy, defined once in code. Nothing about money is learned from data.", code: "partial_refund = floor(value / items)" },
  { title: "'cancelled' is a string", body: "There's no is_cancelled boolean. if (order.cancelled) is always undefined and silently disables G1.", code: "order.delivery_status === 'cancelled'" },
  { title: "Every ticket is a verbatim match", body: "Similarity ≈ 1.0 for all 30. Gating on similarity alone auto-resolves 100% — so confidence gates on margin and share too.", code: "confidence = topSim × voteShare" },
];

function DataFacts() {
  return (
    <div className="hp-facts">
      {FACTS.map((f, i) => (
        <article key={f.title} className="hp-fact">
          <div className="hp-fact-head">
            <b>{String(i + 1).padStart(2, "0")}</b>
            <h3>{f.title}</h3>
          </div>
          <p>{f.body}</p>
          <code className="hp-fact-code">{f.code}</code>
        </article>
      ))}
    </div>
  );
}

const ARCH: { layer: string; icon: IconName; items: { name: string; sub: string }[] }[] = [
  { layer: "Data", icon: "database", items: [{ name: "3 CSVs", sub: "300 + 30 + 30 rows" }, { name: "Postgres", sub: "6 tables · source of truth" }] },
  { layer: "Retrieval", icon: "layers", items: [{ name: "TF-IDF", sub: "sparse, in-process" }, { name: "Qdrant", sub: "dense · RRF hybrid" }] },
  { layer: "Decision", icon: "shield", items: [{ name: "Vote + gate", sub: "pure & deterministic" }, { name: "G1–G5", sub: "guardrails" }] },
  { layer: "Output", icon: "message", items: [{ name: "Two-lane board", sub: "auto / human" }, { name: "LLM reply", sub: "template fallback" }] },
];

function ArchitectureDiagram() {
  return (
    <div className="hp-arch">
      {ARCH.map((col, i) => (
        <div key={col.layer} className="hp-arch-col">
          <div className="hp-arch-col-head">
            <span><Icon name={col.icon} /></span>
            {col.layer}
          </div>
          {col.items.map((item) => (
            <div key={item.name} className="hp-arch-node">
              <b>{item.name}</b>
              <small>{item.sub}</small>
            </div>
          ))}
          {i < ARCH.length - 1 && <span className="hp-arch-arrow"><Icon name="arrowRight" /></span>}
        </div>
      ))}
    </div>
  );
}

const PRINCIPLES: { icon: IconName; text: string }[] = [
  { icon: "lock", text: "Only the reply-writer calls an LLM. Triage, policy and audit are pure and reproducible offline." },
  { icon: "sliders", text: "Every threshold lives in one file. No magic numbers anywhere else." },
  { icon: "history", text: "The audit log is append-only. Overrides append a new row — they never edit history." },
  { icon: "shield", text: "The demo survives a dead LLM key and an unreachable Qdrant. Both degrade; neither 500s." },
];

function Principles() {
  return (
    <div className="hp-principles">
      {PRINCIPLES.map((p) => (
        <div key={p.text} className="hp-principle">
          <span><Icon name={p.icon} /></span>
          <p>{p.text}</p>
        </div>
      ))}
    </div>
  );
}

const SCENARIOS: { n: string; title: string; body: string; result: string; tone: "auto" | "human" }[] = [
  { n: "1", title: "Strong precedents", body: "“bread not in the bag” — 17 precedents agree on partial_refund.", result: "Auto · ₹82 capped", tone: "auto" },
  { n: "2", title: "Novel complaint", body: "“delivery person was rude” — nothing in history is close.", result: "Human · G5", tone: "human" },
  { n: "3", title: "Precedents disagree", body: "“curd delivered warm and spoiled” — an exact 7–7 tie.", result: "Human · margin 0.00", tone: "human" },
  { n: "4", title: "Cancelled order", body: "“wrong brand of rice” on a cancelled order.", result: "Human · G1 veto", tone: "human" },
];

function Scenarios() {
  return (
    <div className="hp-scenarios">
      {SCENARIOS.map((s) => (
        <article key={s.n} className={`hp-scenario tone-${s.tone}`}>
          <span className="hp-scenario-n">{s.n}</span>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
          <div className="hp-scenario-result"><Icon name={s.tone === "auto" ? "check" : "alert"} /> {s.result}</div>
        </article>
      ))}
    </div>
  );
}

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

function Timeline() {
  return (
    <div className="hp-timeline">
      {SPRINTS.map((s) => (
        <div key={s.n} className={`hp-sprint ${s.bonus ? "bonus" : "core"}`}>
          <b>{String(s.n).padStart(2, "0")}</b>
          <span>{s.title}</span>
          {s.bonus && <i>bonus</i>}
        </div>
      ))}
    </div>
  );
}

function FinalCta() {
  return (
    <section className="hp-final">
      <div className="hp-final-inner">
        <LogoMark size={56} />
        <h2>See it decide in real time</h2>
        <p>Run the pipeline over 30 tickets, drag the thresholds, and drop a novel ticket into the live box.</p>
        <Link href="/board" className="hp-btn hp-btn-light hp-btn-lg">
          <Icon name="overview" /> Open the live board <Icon name="arrowRight" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="hp-footer">
      <LogoWordmark size={28} tagline="Agentic ticket resolution" />
      <p>Deterministic by design · Auditable by default</p>
    </footer>
  );
}

/* ── Effects ───────────────────────────────────────────────────────────────*/

function BackdropGrid() {
  return <div className="hp-backdrop" aria-hidden="true" />;
}

function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`hp-reveal ${shown ? "in" : ""}`}>
      {children}
    </div>
  );
}

function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.2, 0.5] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

/* ── Gate simulator ────────────────────────────────────────────────────────*/

function GateSimulator() {
  const [sim, setSim] = useState(1.0);
  const [share, setShare] = useState(0.68);
  const [margin, setMargin] = useState(0.35);

  const t = DEFAULT_REPLAY_THRESHOLDS;
  const lane = laneAtThresholds({ topSimilarity: sim, voteShare: share, voteMargin: margin, vetoedBy: null }, t);
  const confidence = sim * share;
  const checks = [
    { label: "Top similarity", value: sim, min: t.minSimilarity },
    { label: "Vote share", value: share, min: t.minVoteShare },
    { label: "Vote margin", value: margin, min: t.minVoteMargin },
  ];

  return (
    <div className="hp-gate">
      <div className="hp-gate-controls">
        <GateSlider label="Top similarity" value={sim} min={t.minSimilarity} onChange={setSim} />
        <GateSlider label="Vote share" value={share} min={t.minVoteShare} onChange={setShare} />
        <GateSlider label="Vote margin" value={margin} min={t.minVoteMargin} onChange={setMargin} />
      </div>
      <div className={`hp-gate-verdict verdict-${lane}`}>
        <span className="hp-gate-badge"><Icon name={lane === "auto" ? "check" : "alert"} />{lane === "auto" ? "Auto-resolve" : "Needs human"}</span>
        <div className="hp-gate-conf"><small>confidence = topSim × share</small><b>{Math.round(confidence * 100)}%</b></div>
        <ul className="hp-gate-checks">
          {checks.map((c) => {
            const pass = c.value >= c.min;
            return (
              <li key={c.label} className={pass ? "pass" : "fail"}>
                <Icon name={pass ? "check" : "close"} />{c.label} <b>{c.value.toFixed(2)}</b> <em>≥ {c.min.toFixed(2)}</em>
              </li>
            );
          })}
        </ul>
        <p className="hp-gate-note">
          {lane === "auto" ? "All three gates clear and no guardrail vetoed — this ticket auto-resolves." : "At least one gate fails, so the ticket is queued for a human — with a drafted reply attached."}
        </p>
      </div>
    </div>
  );
}

function GateSlider({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  const pass = value >= min;
  return (
    <div className="hp-gate-slider">
      <small>{label}<b className={pass ? "pass" : "fail"}>{value.toFixed(2)}</b></small>
      <input type="range" min={0} max={1} step={0.01} value={value} style={{ "--fill": `${Math.round(value * 100)}%` } as CSSProperties} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="hp-gate-min" style={{ left: `${Math.round(min * 100)}%` }}><i /><span>min {min.toFixed(2)}</span></span>
    </div>
  );
}
