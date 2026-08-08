import { Icon } from "@/components/Icon";
import type { BoardCard, ResolutionAction } from "@/lib/types";

export function formatAction(action: ResolutionAction): string {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function TicketCard({
  card,
  active,
  index = 0,
  onSelect,
}: {
  card: BoardCard;
  active: boolean;
  index?: number;
  onSelect: () => void;
}) {
  const isAuto = card.lane === "auto";
  const veto = card.guardrails.find((guardrail) => guardrail.status === "veto");
  const mutation = card.guardrails.find((guardrail) => guardrail.status === "mutate");
  const outcomeDetail = veto
    ? `Blocked by ${card.vetoedBy ?? veto.id}`
    : mutation
      ? "Policy-adjusted action"
      : isAuto
        ? "Policy checks passed"
        : "Approval required";

  return (
    <button
      type="button"
      className={`ticket-card ${active ? "active" : ""}`}
      onClick={onSelect}
      style={{ "--card-delay": `${Math.min(index, 8) * 35}ms` } as React.CSSProperties}
      aria-label={`Open ${card.ticketId}: ${card.description}`}
    >
      <span className={`ticket-visual visual-${card.lane}`}>
        <Icon name={isAuto ? "check" : "alert"} />
        <small>AI</small>
        <b>{formatPercent(card.confidence)}</b>
      </span>

      <span className="ticket-content">
        <span className="ticket-meta-row">
          <span className="ticket-identity">
            <span className={`ticket-lane-icon lane-icon-${card.lane}`}><Icon name={isAuto ? "check" : "alert"} /></span>
            <span>
              <strong>{card.ticketId}</strong>
              <small>{card.order ? `Order ${card.order.orderId}` : "Ad-hoc support ticket"}</small>
            </span>
          </span>
          <span className={`status-badge status-${card.lane}`}>
            {isAuto ? "Auto-resolved" : "Human review"}
          </span>
        </span>

        <span className="ticket-description"><em>Issue</em>{card.description}</span>

        {veto && (
          <span className="ticket-veto"><Icon name="shield" /><span><b>{card.vetoedBy ?? veto.id} veto</b>{veto.reason}</span></span>
        )}

        <span className="ticket-footer">
          <span className="action-summary">
            <small>{isAuto ? "Selected action" : "Suggested action"}</small>
            <strong>{formatAction(card.action)}{card.amountInr !== null ? ` · ₹${card.amountInr}` : ""}</strong>
          </span>
          <span className="confidence-summary">
            <small>Confidence</small>
            <span><i><i style={{ width: formatPercent(card.confidence) }} /></i><b>{formatPercent(card.confidence)}</b></span>
          </span>
          <span className="evidence-summary"><Icon name="layers" /><span><b>{Math.min(card.precedents.length, 3)}</b><small>precedents</small></span></span>
          <span className="ticket-outcome"><small>{outcomeDetail}</small><Icon name="chevron" /></span>
        </span>
      </span>
    </button>
  );
}
