import type { Decision, OrderRow } from "@/lib/types";
import { generateTemplateReply, type ReplyTicket } from "./templates";

// Stage 3 — Reply-writer. The ONLY stage that will call an LLM (Sprint 8). For
// now it is template-only. Kept OUT of makeDecision so Policy stays pure and
// model-free (Invariant #2) — the Sprint 6 pipeline calls this after the
// decision is made and attaches the result to draftReply / replySource.

export type ReplySource = "llm" | "template";

export interface ReplyResult {
  reply: string;
  source: ReplySource;
}

/**
 * Produce the customer reply for a decision. Sprint 8 will try the LLM here
 * first and fall back to the template on any failure; today it is template-only.
 */
export async function generateReply(
  decision: Decision,
  ticket: ReplyTicket,
  order?: OrderRow,
): Promise<ReplyResult> {
  return { reply: generateTemplateReply(decision, ticket, order), source: "template" };
}
