"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { ThresholdControls } from "@/components/ThresholdControls";
import { TicketCard, formatAction, formatPercent } from "@/components/TicketCard";
import { TicketDrawer } from "@/components/TicketDrawer";
import { computeSavings } from "@/lib/metrics";
import {
  DEFAULT_REPLAY_THRESHOLDS,
  laneAtThresholds,
  type ReplayThresholds,
} from "@/lib/policy/replay";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { BoardCard, BoardResponse, Decision, ResolutionAction } from "@/lib/types";

type LoadStatus = "loading" | "ready" | "error";
type LaneFilter = "all" | "auto" | "human";
type AppView = "board" | "health";
type Notice = { tone: "success" | "error"; message: string } | null;
type Toast = { id: number; ticketId: string; lane: "auto" | "human" };

export default function Home() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [notice, setNotice] = useState<Notice>(null);
  const [busyAction, setBusyAction] = useState<"refresh" | "pipeline" | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [view, setView] = useState<AppView>("board");
  const [query, setQuery] = useState("");
  const [laneFilter, setLaneFilter] = useState<LaneFilter>("all");
  const [showSubmit, setShowSubmit] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<ReplayThresholds>(DEFAULT_REPLAY_THRESHOLDS);
  const [showThresholds, setShowThresholds] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  // Sprint 12 — live board updates. Subscribe to INSERTs on `decisions`; on a
  // new one, reload the board and surface a toast. Degrades silently when the
  // browser Supabase env is absent.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const client = supabaseBrowser();
    if (!client) return;
    const channel = client
      .channel("decisions-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "decisions" },
        (payload) => {
          const row = payload.new as { ticket_id?: string; lane?: "auto" | "human" };
          if (!row?.ticket_id) return;
          const toast: Toast = {
            id: Date.now() + Math.random(),
            ticketId: row.ticket_id,
            lane: row.lane === "auto" ? "auto" : "human",
          };
          setToasts((current) => [...current, toast].slice(-3));
          window.setTimeout(
            () => setToasts((current) => current.filter((t) => t.id !== toast.id)),
            5200,
          );
          void loadRef.current();
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  const handleDecisionAction = useCallback(
    async (result: { ticketId: string; lane: "auto" | "human"; message: string }) => {
      const reloaded = await load();
      if (reloaded) setNotice({ tone: "success", message: result.message });
    },
    [load],
  );

  const rawCards = useMemo(
    () => [...(data?.autoResolved ?? []), ...(data?.needsHuman ?? [])],
    [data],
  );

  const thresholdsDefault =
    thresholds.minSimilarity === DEFAULT_REPLAY_THRESHOLDS.minSimilarity &&
    thresholds.minVoteShare === DEFAULT_REPLAY_THRESHOLDS.minVoteShare &&
    thresholds.minVoteMargin === DEFAULT_REPLAY_THRESHOLDS.minVoteMargin;

  // Sprint 9: re-partition locally from stored scores. Instant, no re-inference.
  const allCards = useMemo(() => {
    if (thresholdsDefault) return rawCards;
    return rawCards.map((card) => ({ ...card, lane: laneAtThresholds(card, thresholds) }));
  }, [rawCards, thresholds, thresholdsDefault]);

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
  const counts = useMemo(
    () => ({
      auto: allCards.filter((card) => card.lane === "auto").length,
      human: allCards.filter((card) => card.lane === "human").length,
      total: allCards.length,
    }),
    [allCards],
  );
  const autoRate = counts.total > 0 ? Math.round((counts.auto / counts.total) * 100) : 0;
  const savings = computeSavings(counts.auto);
  const baseAuto = data?.counts.auto ?? 0;
  const retriever = data?.retriever ?? "tfidf";
  const liveEnabled = useMemo(() => supabaseBrowser() != null, []);

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
    setView("board");
    setLaneFilter(next);
    setSelectedTicketId(null);
  }

  function navigate(next: AppView) {
    if (ticketSubmitting) return;
    setView(next);
    setSelectedTicketId(null);
    setShowSubmit(false);
  }

  function openSubmit() {
    setView("board");
    setShowSubmit(true);
  }

  return (
    <div className="app-shell">
      <DesktopSidebar active={view} onNavigate={navigate} onCreate={openSubmit} />

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-primary">
            <Link href="/" className="mobile-brand">
              <LogoMark size={30} />
              <span>ZeptoSupport</span>
            </Link>

            {view === "board" ? (
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
            ) : (
              <div className="topbar-view-title"><span><Icon name="analytics" /></span><div><strong>Health dashboard</strong><small>Current decision snapshot</small></div></div>
            )}

            <div className="topbar-actions">
              <span className="retriever-badge" title="Active retriever">
                <Icon name={retriever === "hybrid" ? "network" : "database"} />
                {retriever === "hybrid" ? "Hybrid" : "TF-IDF"}
              </span>
              <span className="system-status"><i /> Deterministic policy</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => void load(true)}
                disabled={busyAction !== null || ticketSubmitting}
                aria-label="Refresh data"
                title="Refresh data"
              >
                <Icon name="refresh" className={busyAction === "refresh" ? "spin" : ""} />
              </button>
              <button type="button" className="primary-button" onClick={openSubmit}>
                <Icon name="plus" /> New ticket
              </button>
            </div>
          </div>

          <div className="topbar-secondary">
            <div className="breadcrumbs"><span>Command center</span><Icon name="chevron" /><strong>{view === "board" ? "Resolution board" : "Health dashboard"}</strong></div>
            {view === "board" ? (
              <LaneSwitch active={laneFilter} counts={counts} onSelect={selectLane} />
            ) : (
              <div className="health-context"><Icon name="analytics" /> {counts.total} current decisions · {autoRate}% automation</div>
            )}
            {view === "board" && (
              <button
                type="button"
                className={`secondary-button ${showThresholds ? "" : ""}`}
                onClick={() => setShowThresholds((value) => !value)}
                aria-pressed={showThresholds}
              >
                <Icon name="sliders" /> Thresholds
              </button>
            )}
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

        <main className={`dashboard dashboard-${view}`}>
          {view === "board" ? (
            <section className="dashboard-main" aria-labelledby="board-title">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">AI support operations</p>
                  <h1 id="board-title">Resolution command center</h1>
                  <p>Every decision is grounded in historical precedents and checked by deterministic policy guardrails.</p>
                </div>
                <div className="heading-badges">
                  {liveEnabled && (
                    <span className="realtime-pill"><i /> Live</span>
                  )}
                  <div className="heading-badge"><Icon name="shield" /> Auditable decisions</div>
                  <span className="savings-badge" title="Auto-resolved × 25 median agent-minutes">
                    <Icon name="clock" /> <b>{savings}</b> agent-min saved
                  </span>
                </div>
              </div>

              <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

              {showThresholds && (
                <ThresholdControls
                  thresholds={thresholds}
                  counts={counts}
                  baseAuto={baseAuto}
                  onChange={setThresholds}
                  onReset={() => setThresholds(DEFAULT_REPLAY_THRESHOLDS)}
                />
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
              {status === "error" && !data && <LoadError onRetry={() => void load(true)} />}

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
          ) : (
            <HealthDashboard
              cards={allCards}
              status={status}
              notice={notice}
              onDismissNotice={() => setNotice(null)}
              onRetry={() => void load(true)}
              onOpenBoard={() => navigate("board")}
            />
          )}
        </main>
      </div>

      <MobileNavigation active={view} onNavigate={navigate} onCreate={openSubmit} />
      <TicketDrawer
        card={selectedTicket}
        onClose={() => setSelectedTicketId(null)}
        onActioned={handleDecisionAction}
      />
      <RealtimeToasts toasts={toasts} />
    </div>
  );
}

function RealtimeToasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="realtime-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`realtime-toast toast-${toast.lane}`}>
          <span><Icon name={toast.lane === "auto" ? "check" : "alert"} /></span>
          <div>
            <b>{toast.ticketId} processed</b>
            <small>Routed to {toast.lane === "auto" ? "auto-resolution" : "human review"}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function DesktopSidebar({ active, onNavigate, onCreate }: { active: AppView; onNavigate: (view: AppView) => void; onCreate: () => void }) {
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-logo" aria-label="ZeptoSupport overview" title="Back to overview">
        <LogoMark size={32} />
      </Link>
      <nav aria-label="Primary navigation">
        <SidebarButton label="Resolution board" icon="overview" active={active === "board"} onClick={() => onNavigate("board")} />
        <SidebarButton label="Health dashboard" icon="analytics" active={active === "health"} onClick={() => onNavigate("health")} />
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="sidebar-create" onClick={onCreate} title="Create live ticket"><Icon name="plus" /></button>
        <div className="agent-avatar" title="Support command center">AI<span /></div>
      </div>
    </aside>
  );
}

function SidebarButton({ label, icon, active, onClick }: { label: string; icon: IconName; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`sidebar-button ${active ? "active" : ""}`} onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined} title={label}>
      <Icon name={icon} />
    </button>
  );
}

function LaneSwitch({ active, counts, onSelect }: { active: LaneFilter; counts: BoardResponse["counts"]; onSelect: (lane: LaneFilter) => void }) {
  return (
    <div className="lane-switch" role="group" aria-label="Switch ticket lane">
      <LaneSwitchButton label="All" count={counts.total} active={active === "all"} onClick={() => onSelect("all")} />
      <LaneSwitchButton label="Auto" count={counts.auto} active={active === "auto"} tone="auto" onClick={() => onSelect("auto")} />
      <LaneSwitchButton label="Human" count={counts.human} active={active === "human"} tone="human" onClick={() => onSelect("human")} />
    </div>
  );
}

function LaneSwitchButton({ label, count, active, tone = "all", onClick }: { label: string; count: number; active: boolean; tone?: "all" | "auto" | "human"; onClick: () => void }) {
  return <button type="button" className={`lane-switch-button switch-${tone} ${active ? "active" : ""}`} onClick={onClick} aria-pressed={active}><span>{label}</span><b>{count}</b></button>;
}

function Lane({ title, description, kind, cards, selectedId, onSelect, empty }: { title: string; description: string; kind: "auto" | "human"; cards: BoardCard[]; selectedId: string | null; onSelect: (id: string) => void; empty: string }) {
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
          cards.map((card, index) => <TicketCard key={card.ticketId} card={card} active={selectedId === card.ticketId} index={index} onSelect={() => onSelect(card.ticketId)} />)
        )}
      </div>
    </section>
  );
}

function HealthDashboard({ cards, status, notice, onDismissNotice, onRetry, onOpenBoard }: { cards: BoardCard[]; status: LoadStatus; notice: Notice; onDismissNotice: () => void; onRetry: () => void; onOpenBoard: () => void }) {
  const counts = {
    auto: cards.filter((card) => card.lane === "auto").length,
    human: cards.filter((card) => card.lane === "human").length,
    total: cards.length,
  };
  const autoRate = counts.total > 0 ? Math.round((counts.auto / counts.total) * 100) : 0;
  const averageConfidence = average(cards.map((card) => card.confidence));
  const averageSimilarity = average(cards.map((card) => card.topSimilarity));
  const vetoCount = cards.filter((card) => card.guardrails.some((guardrail) => guardrail.status === "veto")).length;
  const mutationCount = cards.filter((card) => card.guardrails.some((guardrail) => guardrail.status === "mutate")).length;
  const cancelledOrders = cards.filter((card) => card.order?.deliveryStatus === "cancelled").length;
  const weakEvidence = cards.filter((card) => card.vetoedBy === "G5").length;
  const templateReplies = cards.filter((card) => card.replySource === "template").length;
  const llmReplies = cards.filter((card) => card.replySource === "llm").length;
  const surfacedPrecedents = cards.reduce((sum, card) => sum + card.precedents.length, 0);
  const actionMix = getActionMix(cards);

  if (status === "error" && cards.length === 0) {
    return <section className="health-dashboard"><LoadError onRetry={onRetry} /></section>;
  }

  return (
    <section className="health-dashboard" aria-labelledby="health-title">
      <div className="page-heading health-page-heading">
        <div>
          <p className="eyebrow">Decision intelligence</p>
          <h1 id="health-title">Resolution health dashboard</h1>
          <p>A current snapshot derived from persisted board decisions—no estimated trends or invented operational data.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onOpenBoard}><Icon name="overview" /> Open resolution board</button>
      </div>

      <NoticeBanner notice={notice} onDismiss={onDismissNotice} />

      {status === "loading" ? (
        <div className="health-loading" aria-busy="true" aria-label="Loading health dashboard"><i /><i /><i /><i /><span className="sr-only">Loading health dashboard</span></div>
      ) : (
        <>
          <div className="health-kpi-grid">
            <HealthKpi label="Current decisions" value={counts.total} detail="Latest decision per ticket" icon="ticket" />
            <HealthKpi label="Automation rate" value={`${autoRate}%`} detail={`${counts.auto} safely auto-routed`} icon="sparkles" tone="brand" />
            <HealthKpi label="Human review" value={counts.human} detail="Awaiting agent attention" icon="alert" tone="warning" />
            <HealthKpi label="Average confidence" value={formatPercent(averageConfidence)} detail="Across the current board" icon="check" tone="success" />
          </div>

          <div className="health-grid">
            <section className="health-panel automation-panel">
              <HealthPanelHeader icon="analytics" title="Resolution distribution" subtitle="Current board partition" />
              <div className="automation-content">
                <div className="automation-ring" style={{ "--automation-rate": `${autoRate * 3.6}deg` } as CSSProperties}>
                  <div><strong>{autoRate}%</strong><small>automated</small></div>
                </div>
                <div className="distribution-list">
                  <DistributionRow label="Auto-resolved" value={counts.auto} total={counts.total} tone="auto" />
                  <DistributionRow label="Human review" value={counts.human} total={counts.total} tone="human" />
                </div>
              </div>
            </section>

            <section className="health-panel evidence-health-panel">
              <HealthPanelHeader icon="layers" title="Evidence health" subtitle="Retrieval quality and corpus coverage" />
              <div className="evidence-health-grid">
                <SnapshotMetric label="Surfaced precedents" value={surfacedPrecedents} detail="Evidence records attached to current decisions" />
                <SnapshotMetric label="Average top match" value={formatPercent(averageSimilarity)} detail="Similarity of rank-one precedents" />
                <SnapshotMetric label="Weak-evidence vetoes" value={weakEvidence} detail="Tickets stopped by G5" />
                <SnapshotMetric label="Template replies" value={templateReplies} detail={`${llmReplies} replies generated by LLM`} />
              </div>
            </section>

            <section className="health-panel safety-panel">
              <HealthPanelHeader icon="shield" title="Policy safety" subtitle="Visible deterministic interventions" />
              <div className="safety-list">
                <SafetyRow icon="alert" label="Decisions with vetoes" value={vetoCount} detail="Automatic execution blocked" tone="danger" />
                <SafetyRow icon="shield" label="Policy mutations" value={mutationCount} detail="Amount or action safely adjusted" tone="info" />
                <SafetyRow icon="package" label="Cancelled orders" value={cancelledOrders} detail="Shown prominently for G1 review" tone="warning" />
                <SafetyRow icon="check" label="No veto recorded" value={Math.max(0, counts.total - vetoCount)} detail="Latest decision completed policy evaluation" tone="success" />
              </div>
            </section>

            <section className="health-panel action-panel">
              <HealthPanelHeader icon="overview" title="Recommended action mix" subtitle="Latest proposed actions across all tickets" />
              <div className="action-mix-list">
                {actionMix.length === 0 ? <p className="health-empty">No decisions are available yet.</p> : actionMix.map((item) => (
                  <div className="action-mix-row" key={item.action}>
                    <span><b>{formatAction(item.action)}</b><small>{item.count} ticket{item.count === 1 ? "" : "s"}</small></span>
                    <i><i style={{ width: `${Math.round((item.count / Math.max(1, counts.total)) * 100)}%` }} /></i>
                    <strong>{Math.round((item.count / Math.max(1, counts.total)) * 100)}%</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="health-panel workflow-health-panel">
              <HealthPanelHeader icon="sparkles" title="Decision workflow" subtitle="One reproducible path for every ticket" />
              <ol className="health-workflow">
                <li><b>1</b><span><strong>Retrieve</strong><small>Search qualifying historical evidence</small></span></li>
                <li><b>2</b><span><strong>Vote</strong><small>Measure action agreement and margin</small></span></li>
                <li><b>3</b><span><strong>Guard</strong><small>Apply G1–G5 deterministic policy checks</small></span></li>
                <li><b>4</b><span><strong>Route</strong><small>Auto-resolve or retain human control</small></span></li>
              </ol>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function HealthKpi({ label, value, detail, icon, tone = "neutral" }: { label: string; value: string | number; detail: string; icon: IconName; tone?: "neutral" | "brand" | "success" | "warning" }) {
  return <article className={`health-kpi health-kpi-${tone}`}><span><Icon name={icon} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function HealthPanelHeader({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  return <header className="health-panel-header"><span><Icon name={icon} /></span><div><h2>{title}</h2><p>{subtitle}</p></div></header>;
}

function DistributionRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: "auto" | "human" }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return <div className={`distribution-row distribution-${tone}`}><div><span><i />{label}</span><b>{value}</b></div><div className="distribution-track"><i style={{ width: `${percentage}%` }} /></div><small>{percentage}% of current decisions</small></div>;
}

function SnapshotMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article className="snapshot-metric"><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>;
}

function SafetyRow({ icon, label, value, detail, tone }: { icon: IconName; label: string; value: number; detail: string; tone: "danger" | "info" | "warning" | "success" }) {
  return <div className={`safety-row safety-${tone}`}><span><Icon name={icon} /></span><div><b>{label}</b><small>{detail}</small></div><strong>{value}</strong></div>;
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  if (!notice) return null;
  return <div className={`notice notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}><Icon name={notice.tone === "success" ? "check" : "alert"} /><span>{notice.message}</span><button type="button" onClick={onDismiss} aria-label="Dismiss message"><Icon name="close" /></button></div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <div className="error-state"><span><Icon name="alert" /></span><h2>Support data unavailable</h2><p>The current decisions could not be loaded. Check the Supabase environment and try again.</p><button className="primary-button" type="button" onClick={onRetry}>Try again</button></div>;
}

function SubmitTicketPanel({ disabled, onBusyChange, onClose, onSubmitted }: { disabled: boolean; onBusyChange: (busy: boolean) => void; onClose: () => void; onSubmitted: (decision: Decision) => Promise<void> }) {
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

function MobileNavigation({ active, onNavigate, onCreate }: { active: AppView; onNavigate: (view: AppView) => void; onCreate: () => void }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <button type="button" className={active === "board" ? "active" : ""} aria-current={active === "board" ? "page" : undefined} onClick={() => onNavigate("board")}><Icon name="overview" /><span>Board</span></button>
      <button type="button" className="mobile-create" onClick={onCreate} aria-label="New ticket"><Icon name="plus" /></button>
      <button type="button" className={active === "health" ? "active" : ""} aria-current={active === "health" ? "page" : undefined} onClick={() => onNavigate("health")}><Icon name="analytics" /><span>Health</span></button>
    </nav>
  );
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getActionMix(cards: BoardCard[]): { action: ResolutionAction; count: number }[] {
  const counts = new Map<ResolutionAction, number>();
  for (const card of cards) counts.set(card.action, (counts.get(card.action) ?? 0) + 1);
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((left, right) => right.count - left.count || left.action.localeCompare(right.action));
}
