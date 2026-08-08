import type { BoardCard } from "@/lib/types";

function pct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}
function f2(n: number): string {
  return n.toFixed(2);
}

export function TicketCard({ card }: { card: BoardCard }) {
  const veto = card.guardrails.find((g) => g.status === "veto");
  const mutates = card.guardrails.filter((g) => g.status === "mutate");

  return (
    <article className={`card lane-${card.lane}`}>
      <div className="card-top">
        <span className="ticket-id">{card.ticketId}</span>
        {card.order && (
          <span className="order-chip">
            ₹{card.order.valueInr} · {card.order.items} item
            {card.order.items === 1 ? "" : "s"} ·{" "}
            <span className={`status-${card.order.deliveryStatus}`}>
              {card.order.deliveryStatus}
            </span>
          </span>
        )}
      </div>

      <p className="desc">{card.description}</p>

      <div className="action-row">
        <span className="action-badge">{card.action}</span>
        {card.amountInr !== null && <span className="amount">₹{card.amountInr}</span>}
      </div>

      <div className="conf">
        <div className="conf-label">
          <span>Confidence</span>
          <span>{f2(card.confidence)}</span>
        </div>
        <div className="conf-bar">
          <div className="conf-fill" style={{ width: pct(card.confidence) }} />
        </div>
        <div className="stats">
          sim {f2(card.topSimilarity)} · share {f2(card.voteShare)} · margin{" "}
          {f2(card.voteMargin)}
        </div>
      </div>

      {veto && (
        <div className="veto-banner">
          🛑 Blocked by {card.vetoedBy}: {veto.reason}
        </div>
      )}

      <div className="guardrails">
        {card.guardrails.map((g) => (
          <span key={g.id} className={`g-pill g-${g.status}`} title={g.reason}>
            {g.id} {g.status}
          </span>
        ))}
      </div>

      {mutates.length > 0 && !veto && (
        <div className="mutate-note">
          {mutates.map((m) => m.reason).join(" · ")}
        </div>
      )}

      {card.precedents.length > 0 && (
        <>
          <div className="section-label">Top precedents</div>
          {card.precedents.map((p, i) => (
            <div className="prec" key={`${p.ticketId}-${i}`}>
              <span className="pid">{p.ticketId}</span>
              <span className="pact">{p.action}</span>
              <span className="psim">{f2(p.similarity)}</span>
            </div>
          ))}
        </>
      )}

      <div className="reasoning">{card.reasoning}</div>

      {card.draftReply && (
        <details className="reply">
          <summary>
            Drafted reply
            {card.replySource && (
              <span className="reply-source">({card.replySource})</span>
            )}
          </summary>
          <div className="reply-body">{card.draftReply}</div>
        </details>
      )}

      <div className="card-actions">
        <button className="btn btn-approve" disabled title="Wired in Sprint 11">
          Approve
        </button>
        <button className="btn btn-override" disabled title="Wired in Sprint 11">
          Override
        </button>
      </div>
    </article>
  );
}
