import type { Decision, OrderRow, ScoredPrecedent } from "@/lib/types";
import { generateTemplateReply, type ReplyTicket } from "./templates";
import { generateLLMReply } from "./llm";

// Stage 3 — Reply-writer (Sprint 8).
//
// Flow: try LLM → on ANY failure (missing key, 429, timeout, network) log a
// warning and fall back to the deterministic template. The demo must survive a
// dead LLM key (Invariant #10). Only this module calls an LLM (Invariant #2).

export type ReplySource = "llm" | "template";

export interface ReplyResult {
  reply: string;
  source: ReplySource;
}

/**
 * Generate a customer reply for the given decision.
 *
 * Tries the LLM path first. Falls back to a deterministic template on any
 * error — missing API key, HTTP 429, timeout, or empty response.
 *
 * @param topPrecedents  The top-3 scored precedents from triage — forwarded to
 *                        the LLM prompt so it can reference similar past cases.
 */
export async function generateReply(
  decision: Decision,
  ticket: ReplyTicket,
  order?: OrderRow,
  topPrecedents?: ScoredPrecedent[],
): Promise<ReplyResult> {
  try {
    const llmReply = await generateLLMReply(
      decision,
      ticket.description ?? "",
      order,
      topPrecedents ?? [],
    );
    return { reply: llmReply, source: "llm" };
  } catch (err) {
    console.warn(
      `[reply] LLM failed for ${ticket.ticketId}, using template fallback:`,
      err instanceof Error ? err.message : err,
    );
    return {
      reply: generateTemplateReply(decision, ticket, order),
      source: "template",
    };
  }
}

