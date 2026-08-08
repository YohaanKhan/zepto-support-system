"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { formatAction, formatPercent } from "@/components/TicketCard";
import { RESOLUTION_ACTIONS, type BoardCard, type ResolutionAction } from "@/lib/types";

type ActionResult = { ticketId: string; lane: "auto" | "human"; message: string };

export function TicketDrawer({
  card,
  onClose,
  onActioned,
}: {
  card: BoardCard | null;
  onClose: () => void;
  onActioned?: (result: ActionResult) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [selectedPrecedentId, setSelectedPrecedentId] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState<ResolutionAction>("partial_refund");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [actionBusy, setActionBusy] = useState<"approve" | "override" | null>(null);
  const [actionError, setActionError] = useState("");
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setCopied(false);
    setSelectedPrecedentId(card?.precedents[0]?.ticketId ?? null);
    setOverrideOpen(false);
    setActionError("");
    setActionBusy(null);
    if (card) {
      setOverrideAction(card.action);
      setOverrideAmount(card.amountInr != null ? String(card.amountInr) : "");
    }
  }, [card?.ticketId, card?.precedents, card]);

  useEffect(() => {
    if (!card) return;
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !drawerRef.current.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [card, onClose]);

  if (!card) return null;

  const isAuto = card.lane === "auto";
  const veto = card.guardrails.find((guardrail) => guardrail.status === "veto");
  const selectedPrecedent = card.precedents.find((item) => item.ticketId === selectedPrecedentId) ?? card.precedents[0];

  async function copyReply() {
    if (!card?.draftReply) return;
    try {
      await navigator.clipboard.writeText(card.draftReply);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function submitDecision(approved: boolean) {
    if (!card || actionBusy) return;
    setActionBusy(approved ? "approve" : "override");
    setActionError("");
    try {
      const body: Record<string, unknown> = {
        approved,
        reason: approved ? "Approved as proposed" : `Overridden to ${formatAction(overrideAction)}`,
      };
      if (!approved) {
        body.overrideAction = overrideAction;
        const amount = overrideAmount.trim();
        if (amount) body.overrideAmount = Number(amount);
      }
      const response = await fetch(`/api/decisions/${card.decisionId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error ?? `Request returned ${response.status}`);
      const label = formatAction(json.finalAction as ResolutionAction);
      const wb = json.wroteBack ? " and appended to the precedent corpus" : "";
      const message = approved
        ? `${card.ticketId} approved (${label})${wb}. Logged to the audit trail.`
        : `${card.ticketId} overridden to ${label}${wb}. Logged to the audit trail.`;
      await onActioned?.({ ticketId: card.ticketId, lane: card.lane, message });
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside ref={drawerRef} className="ticket-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-header">
          <div>
            <div className="drawer-title-row">
              <h2 id="drawer-title">{card.ticketId}</h2>
              <span className={`status-badge status-${card.lane}`}>{isAuto ? "Auto-resolved" : "Human review"}</span>
            </div>
            <p>{card.description}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="drawer-scroll">
          <section className="pipeline-strip" aria-label="Decision pipeline">
            <PipelineStep number="01" label="Retrieve" detail={`${card.precedents.length} shown`} done />
            <i />
            <PipelineStep number="02" label="Vote" detail={`${formatPercent(card.voteShare)} share`} done />
            <i />
            <PipelineStep number="03" label="Guard" detail={veto ? `${card.vetoedBy} veto` : "Checked"} done />
            <i />
            <PipelineStep number="04" label="Route" detail={isAuto ? "Resolved" : "Review"} done={isAuto} warning={!isAuto} />
          </section>

          {!isAuto && (
            <section className="halt-panel">
              <span><Icon name="alert" /></span>
              <div>
                <p className="section-kicker">Automatic execution stopped</p>
                <h3>{veto ? `Policy guardrail ${card.vetoedBy ?? veto.id} fired` : "Evidence did not meet the auto-resolution gate"}</h3>
                <p>{veto?.reason ?? "The system retained a suggested action and drafted reply, but requires a human to approve the outcome."}</p>
              </div>
            </section>
          )}

          <DrawerSection title="AI decision summary" icon="sparkles">
            <div className="decision-summary">
              <ConfidenceRing value={card.confidence} lane={card.lane} />
              <div className="decision-outcome">
                <small>{isAuto ? "Selected action" : "Recommended action"}</small>
                <h3>{formatAction(card.action)}</h3>
                {card.amountInr !== null && <strong>₹{card.amountInr}</strong>}
                <p>{isAuto ? "The policy gate approved this decision for simulated execution." : "No automatic action was approved; human review is required."}</p>
              </div>
            </div>
            <div className="metric-grid">
              <Metric label="Top similarity" value={formatPercent(card.topSimilarity)} />
              <Metric label="Vote share" value={formatPercent(card.voteShare)} />
              <Metric label="Vote margin" value={formatPercent(card.voteMargin)} />
            </div>
            {selectedPrecedent && (
              <div className="evidence-anchor"><Icon name="layers" /><span>Decision anchored by <b>{selectedPrecedent.ticketId}</b> at {formatPercent(selectedPrecedent.similarity)} similarity</span><strong>Verified</strong></div>
            )}
          </DrawerSection>

          <DrawerSection title="Top historical precedents" icon="layers" subtitle="Up to three qualifying evidence records are surfaced">
            {card.precedents.length === 0 ? (
              <div className="drawer-empty">No precedent cleared the similarity floor for this ticket.</div>
            ) : (
              <div className="precedent-list">
                {card.precedents.slice(0, 3).map((precedent, index) => {
                  const active = precedent.ticketId === selectedPrecedentId;
                  return (
                    <button type="button" key={precedent.ticketId} className={`precedent-card ${active ? "active" : ""}`} onClick={() => setSelectedPrecedentId(precedent.ticketId)}>
                      <span className="precedent-rank">0{index + 1}</span>
                      <span className="precedent-copy"><b>{precedent.ticketId}</b><small>Historical action · {formatAction(precedent.action)}</small><em>CSAT {precedent.csat.toFixed(1)} / 5</em></span>
                      <span className="precedent-score"><b>{formatPercent(precedent.similarity)}</b><i><i style={{ width: formatPercent(precedent.similarity) }} /></i></span>
                    </button>
                  );
                })}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Policy guardrails" icon="shield" subtitle="Deterministic checks evaluated before routing">
            <div className="guardrail-grid">
              {card.guardrails.map((guardrail) => (
                <article key={guardrail.id} className={`guardrail-card guardrail-${guardrail.status}`}>
                  <span><Icon name={guardrail.status === "pass" ? "check" : "alert"} /></span>
                  <div><p><b>{guardrail.id}</b>{guardrail.status}</p><small>{guardrail.reason}</small></div>
                </article>
              ))}
            </div>
          </DrawerSection>

          <DrawerSection title="Why this action?" icon="sparkles">
            <div className="reasoning-panel"><span><Icon name="shield" /></span><p>{card.reasoning}</p></div>
          </DrawerSection>

          {card.order && (
            <DrawerSection title="Order context" icon="package">
              <div className="order-grid">
                <OrderInfo label="Order ID" value={card.order.orderId} />
                <OrderInfo label="Order value" value={`₹${card.order.valueInr}`} />
                <OrderInfo label="Items" value={`${card.order.items} item${card.order.items === 1 ? "" : "s"}`} />
                <OrderInfo label="Delivery status" value={card.order.deliveryStatus} danger={card.order.deliveryStatus === "cancelled"} />
              </div>
            </DrawerSection>
          )}

          <DrawerSection title="Drafted customer reply" icon="ticket" subtitle={card.lane === "human" ? "Awaiting human approval" : `Generated by ${card.replySource ?? "fallback"}`}>
            {card.draftReply ? (
              <div className="reply-panel">
                <div className="reply-toolbar"><span><Icon name="sparkles" /> {card.replySource === "llm" ? "AI drafted" : "Template fallback"}</span><button type="button" onClick={() => void copyReply()}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}</button></div>
                <div className="reply-body"><span>Z</span><p>{card.draftReply}</p></div>
              </div>
            ) : (
              <div className="drawer-empty">No drafted reply is attached to this decision.</div>
            )}
          </DrawerSection>

          <DrawerSection title="Human decision" icon="thumbsUp" subtitle="Approve the proposal or override it — every choice is appended to the audit log">
            <div className="decision-actions">
              <button
                type="button"
                className="approve-button"
                onClick={() => void submitDecision(true)}
                disabled={actionBusy !== null}
              >
                <Icon name="thumbsUp" /> {actionBusy === "approve" ? "Approving…" : `Approve ${formatAction(card.action)}`}
              </button>
              <button
                type="button"
                className="override-button"
                onClick={() => setOverrideOpen((value) => !value)}
                disabled={actionBusy !== null}
                aria-expanded={overrideOpen}
              >
                <Icon name="pencil" /> Override
              </button>
            </div>

            {overrideOpen && (
              <div className="override-form">
                <div className="override-form-row">
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label htmlFor="override-action">New action</label>
                    <select
                      id="override-action"
                      value={overrideAction}
                      onChange={(event) => setOverrideAction(event.target.value as ResolutionAction)}
                    >
                      {RESOLUTION_ACTIONS.map((action) => (
                        <option key={action} value={action}>{formatAction(action)}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label htmlFor="override-amount">Amount ₹ (optional)</label>
                    <input
                      id="override-amount"
                      type="number"
                      min={0}
                      value={overrideAmount}
                      onChange={(event) => setOverrideAmount(event.target.value)}
                      placeholder="e.g. 120"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="override-button"
                  onClick={() => void submitDecision(false)}
                  disabled={actionBusy !== null}
                >
                  <Icon name="check" /> {actionBusy === "override" ? "Submitting…" : "Submit override"}
                </button>
              </div>
            )}

            <p className="writeback-off-note">
              <Icon name="lock" />
              Corpus write-back is gated by ENABLE_WRITE_BACK (off during judging). Approve / override always writes the audit log.
            </p>
            {actionError && <p className="submit-error" role="alert">{actionError}</p>}
          </DrawerSection>
        </div>

        <footer className="drawer-footer">
          <div><span className={`footer-state state-${card.lane}`}><Icon name={isAuto ? "check" : "alert"} /></span><p><b>{isAuto ? "Auto-resolution approved" : "Awaiting human approval"}</b><small>{isAuto ? "Simulated action recorded — no real payment call" : "A suggested action and drafted reply are attached for the agent"}</small></p></div>
          <button type="button" className="secondary-button" onClick={onClose}>Close details</button>
        </footer>
      </aside>
    </div>
  );
}

function PipelineStep({ number, label, detail, done = false, warning = false }: { number: string; label: string; detail: string; done?: boolean; warning?: boolean }) {
  return <div className={`pipeline-step ${done ? "done" : ""} ${warning ? "warning" : ""}`}><span>{done ? <Icon name="check" /> : warning ? <Icon name="alert" /> : number}</span><p><b>{label}</b><small>{detail}</small></p></div>;
}

function DrawerSection({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: IconName; children: React.ReactNode }) {
  return <section className="drawer-section"><header><span><Icon name={icon} /></span><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></header>{children}</section>;
}

function ConfidenceRing({ value, lane }: { value: number; lane: "auto" | "human" }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className={`confidence-ring ring-${lane}`} style={{ "--confidence": `${percent * 3.6}deg` } as React.CSSProperties}><div><strong>{percent}%</strong><small>confidence</small></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;
}

function OrderInfo({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`order-info ${danger ? "danger" : ""}`}><small>{label}</small><strong>{value}</strong></div>;
}
