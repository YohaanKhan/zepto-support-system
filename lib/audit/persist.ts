import type { SupabaseClient } from "@supabase/supabase-js";
import type { Decision, PrecedentView } from "@/lib/types";

// Stage 4 (part) — persist the decision and append to the immutable audit log.
// The audit log is APPEND ONLY (Invariant #7): overrides append a new row, they
// never edit history.

/** Map a camelCase Decision onto the snake_case decisions row. Pure. */
export function decisionToRow(
  decision: Decision,
  topPrecedents: PrecedentView[],
) {
  return {
    ticket_id: decision.ticketId,
    lane: decision.lane,
    action: decision.action,
    amount_inr: decision.amountInr,
    confidence: decision.confidence,
    vote_share: decision.voteShare,
    vote_margin: decision.voteMargin,
    top_similarity: decision.topSimilarity,
    precedent_ids: decision.precedentIds,
    guardrails: decision.guardrails,
    vetoed_by: decision.vetoedBy,
    reasoning: decision.reasoning,
    draft_reply: decision.draftReply ?? null,
    reply_source: decision.replySource ?? null,
    top_precedents: topPrecedents,
  };
}

/** Insert the decision, return its generated id (needed for the actions FK). */
export async function persistDecision(
  db: SupabaseClient,
  decision: Decision,
  topPrecedents: PrecedentView[],
): Promise<string> {
  const { data, error } = await db
    .from("decisions")
    .insert(decisionToRow(decision, topPrecedents))
    .select("id")
    .single();
  if (error) throw new Error(`persistDecision: ${error.message}`);
  return data.id as string;
}

export async function appendAuditLog(
  db: SupabaseClient,
  ticketId: string,
  eventType: string,
  actor: "system" | "human",
  payload: unknown,
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    ticket_id: ticketId,
    event_type: eventType,
    actor,
    payload,
  });
  if (error) throw new Error(`appendAuditLog: ${error.message}`);
}
