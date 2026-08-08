import type { CSSProperties } from "react";
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
      ? "Policy adjusted"
      : isAuto
        ? "All guardrails passed"
        : "Approval required";

  return (
    <button
      type="button"
      className={`ticket-card ${active ? "active" : ""}`}
      onClick={onSelect}
      style={{ "--card-delay": `${Math.min(index, 8) * 35}ms` } as CSSProperties}
      aria-label={`Open ${card.ticketId}: ${card.description}`}
    >
      <span className={`ticket-visual visual-${card.lane}`}>
        <Icon name={isAuto ? "check" : "alert"} />
        <small>Confidence</small>
        <b>{formatPercent(card.confidence)}</b>
      </span>

      <span className="ticket-content">
        <span className="ticket-meta-row">
          <span className="ticket-identity">
            <span className={`ticket-lane-icon lane-icon-${card.lane}`}>
              <Icon name={isAuto ? "check" : "alert"} />
            </span>
            <span>
              <strong>{card.ticketId}</strong>
              {card.order && <small>Order {card.order.orderId}</small>}
            </span>
          </span>
          <span className={`status-badge status-${card.lane}`}>
            {isAuto ? "Auto-resolved" : "Human review"}
          </span>
        </span>

        <span className="ticket-description">
          <em>Customer issue</em>
          <strong>{card.description || "No description was provided for this ticket."}</strong>
        </span>

        {card.order && (
          <span className="order-context-row" aria-label={`Order ${card.order.orderId} context`}>
            <span><b>₹{card.order.valueInr}</b><small>order value</small></span>
            <span><b>{card.order.items}</b><small>{card.order.items === 1 ? "item" : "items"}</small></span>
            <span className={`delivery-chip delivery-${card.order.deliveryStatus}`}>
              <b>{card.order.deliveryStatus}</b><small>delivery</small>
            </span>
          </span>
        )}

        {veto && (
          <span className="ticket-veto">
            <Icon name="shield" />
            <span><b>{card.vetoedBy ?? veto.id} policy veto</b>{veto.reason}</span>
          </span>
        )}

        <span className="decision-facts">
          <DecisionFact
            label={isAuto ? "Selected action" : "Suggested action"}
            value={`${formatAction(card.action)}${card.amountInr !== null ? ` · ₹${card.amountInr}` : ""}`}
            wide
          />
          <DecisionFact label="Top match" value={formatPercent(card.topSimilarity)} />
          <DecisionFact label="Vote share" value={formatPercent(card.voteShare)} />
          <DecisionFact label="Vote margin" value={formatPercent(card.voteMargin)} />
        </span>

        <span className="ticket-detail-row">
          <span className={`card-decision-outcome outcome-${veto ? "veto" : mutation ? "mutate" : card.lane}`}>
            <Icon name={veto ? "alert" : "shield"} />
            {outcomeDetail}
          </span>
          <span className="precedent-count"><Icon name="layers" /> {Math.min(card.precedents.length, 3)} precedents</span>
          <span className="open-details">View evidence <Icon name="chevron" /></span>
        </span>
      </span>
    </button>
  );
}

function DecisionFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <span className={`decision-fact ${wide ? "decision-fact-wide" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
