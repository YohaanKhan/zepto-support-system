import { makeDecision } from "@/lib/policy";
import { generateReply } from "@/lib/reply";
import { supabaseAdmin } from "@/lib/supabase";
import { getRetriever, triage } from "@/lib/triage";
import type { Decision, DeliveryStatus, OrderRow, PrecedentView } from "@/lib/types";
import { appendAuditLog, persistDecision } from "@/lib/audit/persist";
import { executeAction } from "@/lib/audit/execute";

// The full four-stage pipeline for one ticket:
//   triage → makeDecision → generateReply → persist + execute + log
// Deterministic through Stage 2; the only model call is inside generateReply
// (Sprint 8), and it degrades to a template on failure.

export async function processTicket(ticketId: string): Promise<Decision> {
  const db = supabaseAdmin();

  const { data: t, error: tErr } = await db
    .from("tickets")
    .select("order_id, description")
    .eq("ticket_id", ticketId)
    .single();
  if (tErr || !t) throw new Error(`processTicket: ticket ${ticketId} not found`);

  const { data: o, error: oErr } = await db
    .from("orders")
    .select("order_id, items, value_inr, delivery_time_min, delivery_status")
    .eq("order_id", t.order_id)
    .single();
  if (oErr || !o) throw new Error(`processTicket: order ${t.order_id} not found`);

  const order: OrderRow = {
    order_id: o.order_id,
    items: Number(o.items),
    value_inr: Number(o.value_inr),
    delivery_time_min: Number(o.delivery_time_min),
    delivery_status: o.delivery_status as DeliveryStatus,
  };

  // Stage 1–2 (pure, deterministic).
  const retriever = await getRetriever();
  const candidate = await triage(ticketId, t.description, retriever);
  const decision = makeDecision(candidate, order);

  // Stage 3 — reply (LLM with template fallback, Sprint 8).
  const top3 = candidate.precedents.slice(0, 3);
  const { reply, source } = await generateReply(
    decision,
    { ticketId, orderId: order.order_id, description: t.description },
    order,
    top3,
  );
  decision.draftReply = reply;
  decision.replySource = source;

  // Stage 4 — persist + simulate + log.
  const topPrecedents: PrecedentView[] = candidate.precedents.slice(0, 3).map((p) => ({
    ticketId: p.ticketId,
    similarity: p.similarity,
    action: p.action,
    csat: p.csat,
  }));
  const decisionId = await persistDecision(db, decision, topPrecedents);
  await executeAction(db, decision, decisionId);
  await appendAuditLog(db, ticketId, "decision_made", "system", { decision });

  return decision;
}

/** Process every ticket that has no decision yet. Returns the new decisions. */
export async function processPendingTickets(): Promise<Decision[]> {
  const db = supabaseAdmin();
  const [{ data: tickets }, { data: done }] = await Promise.all([
    db.from("tickets").select("ticket_id"),
    db.from("decisions").select("ticket_id"),
  ]);
  const doneSet = new Set((done ?? []).map((d) => d.ticket_id as string));
  const pending = (tickets ?? [])
    .map((t) => t.ticket_id as string)
    .filter((id) => !doneSet.has(id));

  const results: Decision[] = [];
  for (const id of pending) {
    // Sequential: keeps DB load gentle and order deterministic on the board.
    results.push(await processTicket(id));
  }
  return results;
}
