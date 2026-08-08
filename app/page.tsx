"use client";

import { useCallback, useEffect, useState } from "react";
import { TicketCard } from "@/components/TicketCard";
import type { BoardCard, BoardResponse } from "@/lib/types";

type Status = "loading" | "ready" | "error";

export default function Home() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/board", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/board → ${res.status}`);
      setData((await res.json()) as BoardResponse);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runPipeline = async () => {
    setBusy(true);
    try {
      await fetch("/api/tickets/process", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts;

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1 className="title">Zepto Support Ticket Manager</h1>
          <p className="subtitle">
            Routine tickets auto-resolved against 300 historical precedents; the
            rest queued for humans with precedents attached.
          </p>
        </div>
        <div className="toolbar">
          {counts && (
            <div className="counts">
              <span className="count-pill">
                <b>{counts.auto}</b> auto
              </span>
              <span className="count-pill">
                <b>{counts.human}</b> needs human
              </span>
            </div>
          )}
          <button className="btn" onClick={() => void load()} disabled={busy}>
            Refresh
          </button>
          <button className="btn" onClick={() => void runPipeline()} disabled={busy}>
            {busy ? "Processing…" : "Run pipeline"}
          </button>
        </div>
      </header>

      {status === "loading" && <p className="subtitle">Loading board…</p>}
      {status === "error" && (
        <p className="veto-banner">Could not load board: {error}</p>
      )}

      {status === "ready" && data && (
        <div className="board">
          <Lane
            kind="auto"
            title="Auto-Resolved"
            cards={data.autoResolved}
            empty="No tickets auto-resolved yet — run the pipeline."
          />
          <Lane
            kind="human"
            title="Needs Human Review"
            cards={data.needsHuman}
            empty="Nothing queued for humans."
          />
        </div>
      )}
    </main>
  );
}

function Lane({
  kind,
  title,
  cards,
  empty,
}: {
  kind: "auto" | "human";
  title: string;
  cards: BoardCard[];
  empty: string;
}) {
  return (
    <section className={`lane-${kind}`}>
      <div className="lane-header">
        <span className="dot" />
        {title} <span className="n">({cards.length})</span>
      </div>
      {cards.length === 0 ? (
        <div className="lane-empty">{empty}</div>
      ) : (
        cards.map((c) => <TicketCard key={c.ticketId} card={c} />)
      )}
    </section>
  );
}
