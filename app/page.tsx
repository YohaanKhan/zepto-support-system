"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { TicketCard } from "@/components/TicketCard";
import { TicketDrawer } from "@/components/TicketDrawer";
import type { BoardCard, BoardResponse, Decision } from "@/lib/types";

type LoadStatus = "loading" | "ready" | "error";
type LaneFilter = "all" | "auto" | "human";
type Notice = { tone: "success" | "error"; message: string } | null;

export default function Home() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [notice, setNotice] = useState<Notice>(null);
  const [busyAction, setBusyAction] = useState<"refresh" | "pipeline" | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [laneFilter, setLaneFilter] = useState<LaneFilter>("all");
  const [showSubmit, setShowSubmit] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const load = useCallback(async (showBusy = false) => {
    if (showBusy) setBusyAction("refresh");
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? `GET /api/board returned ${response.status}`);
      }
      setData(json as BoardResponse);
      setStatus("ready");
      setNotice(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus((current) => (current === "loading" ? "error" : current));
      setNotice({ tone: "error", message: `Could not load the board: ${message}` });
      return false;
    } finally {
      if (showBusy) setBusyAction(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allCards = useMemo(
    () => [...(data?.autoResolved ?? []), ...(data?.needsHuman ?? [])],
    [data],
  );

  const selectedTicket = useMemo(
    () => allCards.find((card) => card.ticketId === selectedTicketId) ?? null,
    [allCards, selectedTicketId],
  );

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allCards.filter((card) => {
      const laneMatches = laneFilter === "all" || card.lane === laneFilter;
      const queryMatches =
        !normalizedQuery ||
        card.ticketId.toLowerCase().includes(normalizedQuery) ||
        card.description.toLowerCase().includes(normalizedQuery) ||
        card.action.toLowerCase().includes(normalizedQuery) ||
        card.order?.orderId.toLowerCase().includes(normalizedQuery);
      return laneMatches && queryMatches;
    });
  }, [allCards, laneFilter, query]);

  const autoCards = filteredCards.filter((card) => card.lane === "auto");
  const humanCards = filteredCards.filter((card) => card.lane === "human");
  const counts = data?.counts ?? { auto: 0, human: 0, total: 0 };
  const autoRate = counts.total > 0 ? Math.round((counts.auto / counts.total) * 100) : 0;

  async function runPipeline() {
    setBusyAction("pipeline");
    setNotice(null);
    try {
      const response = await fetch("/api/tickets/process", { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? `Pipeline returned ${response.status}`);
      }
      const reloaded = await load();
      if (reloaded) {
        setNotice({
          tone: "success",
          message: `Pipeline complete: ${json.processed} processed, ${json.auto} auto-resolved, ${json.human} routed to review.`,
        });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyAction(null);
    }
  }

  function selectLane(next: LaneFilter) {
    setLaneFilter(next);
    setSelectedTicketId(null);
  }

  return (
    <div className="app-shell">
      <DesktopSidebar
        active={laneFilter}
        counts={counts}
        onSelect={selectLane}
        onCreate={() => setShowSubmit(true)}
      />

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-primary">
            <div className="mobile-brand">
              <span className="brand-mark"><Icon name="sparkles" /></span>
              <span>Zepto Support</span>
            </div>
            <label className="search-field">
              <Icon name="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ticket, order or action"
                aria-label="Search tickets"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <Icon name="close" />
                </button>
              )}
            </label>
            <div className="topbar-actions">
              <span className="system-status"><i /> Deterministic policy</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => void load(true)}
                disabled={busyAction !== null || ticketSubmitting}
                aria-label="Refresh board"
                title="Refresh board"
              >
                <Icon name="refresh" className={busyAction === "refresh" ? "spin" : ""} />
              </button>
              <button type="button" className="primary-button" onClick={() => setShowSubmit(true)}>
                <Icon name="plus" /> New ticket
              </button>
            </div>
          </div>

          <div className="topbar-secondary">
            <div className="breadcrumbs"><span>Command center</span><Icon name="chevron" /><strong>Resolution board</strong></div>
            <div className="filter-tabs" role="group" aria-label="Filter tickets by lane">
              <FilterButton label="All tickets" count={counts.total} active={laneFilter === "all"} onClick={() => selectLane("all")} />
              <FilterButton label="Auto-resolved" count={counts.auto} active={laneFilter === "auto"} onClick={() => selectLane("auto")} tone="success" />
              <FilterButton label="Human review" count={counts.human} active={laneFilter === "human"} onClick={() => selectLane("human")} tone="warning" />
            </div>
            <button
              type="button"
              className="secondary-button run-button"
              onClick={() => void runPipeline()}
              disabled={busyAction !== null || ticketSubmitting}
            >
              <Icon name="play" /> {busyAction === "pipeline" ? "Processing…" : "Run pipeline"}
            </button>
          </div>
        </header>

        <main className="dashboard">
          <section className="dashboard-main" aria-labelledby="board-title">
            <div className="page-heading">
              <div>
                <p className="eyebrow">AI support operations</p>
                <h1 id="board-title">Resolution command center</h1>
                <p>Every decision is grounded in historical precedents and checked by deterministic policy guardrails.</p>
              </div>
              <div className="heading-badge"><Icon name="shield" /> Auditable decisions</div>
            </div>

            {notice && (
              <div className={`notice notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
                <Icon name={notice.tone === "success" ? "check" : "alert"} />
                <span>{notice.message}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><Icon name="close" /></button>
              </div>
            )}

            {showSubmit && (
              <SubmitTicketPanel
                disabled={busyAction !== null}
                onBusyChange={setTicketSubmitting}
                onClose={() => setShowSubmit(false)}
                onSubmitted={async (decision) => {
                  const reloaded = await load();
                  setShowSubmit(false);
                  if (reloaded) {
                    setSelectedTicketId(decision.ticketId);
                    setNotice({
                      tone: "success",
                      message: `${decision.ticketId} was processed and routed to ${decision.lane === "auto" ? "auto-resolution" : "human review"}.`,
                    });
                  }
                }}
              />
            )}

            {status === "loading" && <BoardSkeleton />}
            {status === "error" && !data && (
              <div className="error-state">
                <span><Icon name="alert" /></span>
                <h2>Board unavailable</h2>
                <p>The support data could not be loaded. Check the Supabase environment and try again.</p>
                <button className="primary-button" type="button" onClick={() => void load(true)}>Try again</button>
              </div>
            )}

            {status === "ready" && data && (
              <div className={`board ${laneFilter !== "all" ? "board-single" : ""}`}>
                {laneFilter !== "human" && (
                  <Lane
                    title="Auto-resolved"
                    description="Safe, high-confidence actions"
                    kind="auto"
                    cards={autoCards}
                    selectedId={selectedTicketId}
                    onSelect={setSelectedTicketId}
                    empty={query ? "No auto-resolved tickets match your search." : "No tickets have been auto-resolved yet."}
                  />
                )}
                {laneFilter !== "auto" && (
                  <Lane
                    title="Needs human review"
                    description="Conflicts, weak evidence or policy vetoes"
                    kind="human"
                    cards={humanCards}
                    selectedId={selectedTicketId}
                    onSelect={setSelectedTicketId}
                    empty={query ? "No human-review tickets match your search." : "The human-review queue is clear."}
                  />
                )}
              </div>
            )}
          </section>

          <aside className="insights-rail" aria-label="Board insights">
            <div className="rail-heading">
              <div>
                <p className="eyebrow">Board overview</p>
                <h2>Resolution health</h2>
              </div>
              <span className="live-dot"><i /> Current</span>
            </div>
            <div className="kpi-grid">
              <KpiCard label="Total decisions" value={counts.total} icon="ticket" />
              <KpiCard label="Auto-resolved" value={counts.auto} icon="check" tone="success" />
              <KpiCard label="Human review" value={counts.human} icon="alert" tone="warning" />
              <KpiCard label="Automation rate" value={`${autoRate}%`} icon="sparkles" tone="brand" />
            </div>

            <section className="rail-card corpus-card">
              <div className="rail-card-title"><span><Icon name="layers" /></span><div><h3>Evidence corpus</h3><p>Deterministic retrieval</p></div></div>
              <div className="corpus-number">300 <small>resolved tickets</small></div>
              <div className="corpus-track"><span style={{ width: "100%" }} /></div>
              <p>Each recommendation surfaces up to three qualifying precedents from the verified history set.</p>
            </section>

            <section className="rail-card workflow-card">
              <div className="rail-card-title"><span><Icon name="shield" /></span><div><h3>Decision workflow</h3><p>Transparent by design</p></div></div>
              <ol>
                <li><b>1</b><span><strong>Retrieve</strong><small>Find matching support history</small></span></li>
                <li><b>2</b><span><strong>Vote</strong><small>Score action agreement</small></span></li>
                <li><b>3</b><span><strong>Guard</strong><small>Apply deterministic policy</small></span></li>
                <li><b>4</b><span><strong>Route</strong><small>Auto-resolve or request review</small></span></li>
              </ol>
            </section>

            <button type="button" className="create-ticket-cta" onClick={() => setShowSubmit(true)}>
              <span><Icon name="plus" /></span>
              <div><strong>Test a live complaint</strong><small>Submit an unseen issue to the decision pipeline</small></div>
              <Icon name="chevron" />
            </button>
          </aside>
        </main>
      </div>

      <MobileNavigation active={laneFilter} onSelect={selectLane} onCreate={() => setShowSubmit(true)} />
      <TicketDrawer card={selectedTicket} onClose={() => setSelectedTicketId(null)} />
    </div>
  );
}

function DesktopSidebar({
  active,
  counts,
  onSelect,
  onCreate,
}: {
  active: LaneFilter;
  counts: BoardResponse["counts"];
  onSelect: (filter: LaneFilter) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="sidebar">
      <button type="button" className="sidebar-logo" onClick={() => onSelect("all")} aria-label="Zepto support home">
        <Icon name="sparkles" />
      </button>
      <nav aria-label="Primary navigation">
        <SidebarButton label="Overview" icon="overview" active={active === "all"} onClick={() => onSelect("all")} />
        <SidebarButton label="Auto-resolved" icon="check" count={counts.auto} active={active === "auto"} onClick={() => onSelect("auto")} />
        <SidebarButton label="Human review" icon="alert" count={counts.human} active={active === "human"} onClick={() => onSelect("human")} />
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="sidebar-create" onClick={onCreate} title="Create live ticket"><Icon name="plus" /></button>
        <div className="agent-avatar" title="Support command center">AI<span /></div>
      </div>
    </aside>
  );
}

function SidebarButton({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: "overview" | "check" | "alert";
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`sidebar-button ${active ? "active" : ""}`} onClick={onClick} aria-label={label} aria-pressed={active} title={label}>
      <Icon name={icon} />
      {count !== undefined && <span>{count}</span>}
    </button>
  );
}

function FilterButton({ label, count, active, onClick, tone = "neutral" }: { label: string; count: number; active: boolean; onClick: () => void; tone?: "neutral" | "success" | "warning" }) {
  return <button type="button" className={`filter-tab filter-${tone} ${active ? "active" : ""}`} onClick={onClick} aria-pressed={active}>{label}<span>{count}</span></button>;
}

function Lane({
  title,
  description,
  kind,
  cards,
  selectedId,
  onSelect,
  empty,
}: {
  title: string;
  description: string;
  kind: "auto" | "human";
  cards: BoardCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty: string;
}) {
  return (
    <section className={`lane lane-${kind}`}>
      <header className="lane-header">
        <div className="lane-title"><span><Icon name={kind === "auto" ? "check" : "alert"} /></span><div><h2>{title}</h2><p>{description}</p></div></div>
        <b>{cards.length}</b>
      </header>
      <div className="lane-list">
        {cards.length === 0 ? (
          <div className="lane-empty"><Icon name={kind === "auto" ? "check" : "alert"} /><p>{empty}</p></div>
        ) : (
          cards.map((card, index) => (
            <TicketCard key={card.ticketId} card={card} active={selectedId === card.ticketId} index={index} onSelect={() => onSelect(card.ticketId)} />
          ))
        )}
      </div>
    </section>
  );
}

function KpiCard({ label, value, icon, tone = "neutral" }: { label: string; value: string | number; icon: "ticket" | "check" | "alert" | "sparkles"; tone?: "neutral" | "success" | "warning" | "brand" }) {
  return <article className={`kpi-card kpi-${tone}`}><span><Icon name={icon} /></span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function SubmitTicketPanel({
  disabled,
  onBusyChange,
  onClose,
  onSubmitted,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSubmitted: (decision: Decision) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = description.trim();
    if (!value || busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error ?? `Request returned ${response.status}`);
      await onSubmitted(json.decision as Decision);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="submit-panel" aria-labelledby="submit-title">
      <div className="submit-icon"><Icon name="sparkles" /></div>
      <div className="submit-copy"><h2 id="submit-title">Submit a live support ticket</h2><p>Try a novel complaint to verify that weak evidence is safely routed to a human.</p></div>
      <form onSubmit={submit}>
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. The app crashed and charged me twice" aria-label="Ticket description" autoFocus disabled={disabled || busy} />
        <button type="submit" className="primary-button" disabled={disabled || busy || !description.trim()}>{busy ? "Processing…" : disabled ? "Pipeline busy" : "Submit"}</button>
      </form>
      <button type="button" className="submit-close" onClick={onClose} aria-label="Close live ticket form"><Icon name="close" /></button>
      {error && <p className="submit-error" role="alert">{error}</p>}
    </section>
  );
}

function BoardSkeleton() {
  return <div className="board skeleton-board" aria-label="Loading board"><div className="skeleton-lane"><i /><i /><i /></div><div className="skeleton-lane"><i /><i /><i /></div></div>;
}

function MobileNavigation({ active, onSelect, onCreate }: { active: LaneFilter; onSelect: (filter: LaneFilter) => void; onCreate: () => void }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <button type="button" className={active === "all" ? "active" : ""} aria-pressed={active === "all"} onClick={() => onSelect("all")}><Icon name="overview" /><span>Overview</span></button>
      <button type="button" className={active === "auto" ? "active" : ""} aria-pressed={active === "auto"} onClick={() => onSelect("auto")}><Icon name="check" /><span>Resolved</span></button>
      <button type="button" className="mobile-create" onClick={onCreate} aria-label="New ticket"><Icon name="plus" /></button>
      <button type="button" className={active === "human" ? "active" : ""} aria-pressed={active === "human"} onClick={() => onSelect("human")}><Icon name="alert" /><span>Review</span></button>
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Icon name="chevron" className="up-icon" /><span>Top</span></button>
    </nav>
  );
}
