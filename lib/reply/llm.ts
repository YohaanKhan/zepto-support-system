import OpenAI from "openai";
import type { Decision, OrderRow, ScoredPrecedent } from "@/lib/types";

// ── Sprint 8 — LLM reply writer ────────────────────────────────────────────
//
// Rules (CLAUDE.md, Invariant #2):
//   • Only Stage 3 calls an LLM. Triage and Policy are pure functions.
//   • Fallback to templates on any error, 429, or timeout — never crash the demo.
//   • Throttle to LLM_MAX_CONCURRENCY (default 3). Groq free tier: 6k tokens/min.
//   • Cache by ticket_id: the whole batch is ~4 min one-time; re-running must not
//     double-bill. Cache is an in-process Map (process restart clears it, which is
//     fine — replies are also stored in decisions.draft_reply).
//   • Provider-agnostic: ONE OpenAI-compatible client, configured purely by env.
//     Swapping Groq → Gemini → OpenAI is an env change, zero code change.

// ── In-process reply cache (keyed by ticket_id) ────────────────────────────
const replyCache = new Map<string, string>();

// ── Concurrency semaphore ──────────────────────────────────────────────────
const MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY ?? 3);
let activeRequests = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENCY) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activeRequests--;
  }
}

// ── Lazy singleton OpenAI client ───────────────────────────────────────────
let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null; // missing key → degrade to template (Invariant #10)
  if (_client) return _client;
  _client = new OpenAI({
    apiKey,
    baseURL: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
  });
  return _client;
}

// ── Prompt construction ────────────────────────────────────────────────────
function buildPrompt(
  decision: Pick<Decision, "action" | "amountInr" | "lane" | "ticketId">,
  ticketDescription: string,
  order: OrderRow | undefined,
  topPrecedents: ScoredPrecedent[],
): string {
  const actionLine = decision.amountInr
    ? `Action: ${decision.action} ₹${decision.amountInr}`
    : `Action: ${decision.action}`;

  const orderLine = order
    ? `Order value: ₹${order.value_inr}, Items: ${order.items}, Status: ${order.delivery_status}`
    : "";

  const precedentLines = topPrecedents
    .slice(0, 3)
    .map(
      (p, i) =>
        `  ${i + 1}. Ticket ${p.ticketId} — similarity ${p.similarity.toFixed(2)}, past action: ${p.action}`,
    )
    .join("\n");

  const draftNote =
    decision.lane === "human"
      ? "\nThis reply is a DRAFT awaiting human approval. Begin with [DRAFT — AWAITING APPROVAL] "
      : "";

  return `You are a customer support agent for Zepto, an instant grocery delivery app. Draft a short, warm, specific reply to the customer.

Customer complaint: "${ticketDescription}"
${actionLine}
${orderLine}

Similar past cases resolved the same way:
${precedentLines || "  (none)"}

Instructions:
- Be empathetic and concise (2–4 sentences).
- Mention the specific action being taken (e.g. refund amount, redelivery).
- Do NOT invent amounts, timelines, or promises beyond what you were given.
- Do NOT mention internal ticket IDs or system details.${draftNote}

Reply:`;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Generate a reply via LLM. Throws on failure (including 429 and timeout) so
 * the caller (lib/reply/index.ts) can catch and fall back to templates.
 *
 * Results are cached in-process by ticketId. A process restart clears the
 * cache, but replies are also written to decisions.draft_reply by the pipeline.
 */
export async function generateLLMReply(
  decision: Pick<Decision, "action" | "amountInr" | "lane" | "ticketId">,
  ticketDescription: string,
  order: OrderRow | undefined,
  topPrecedents: ScoredPrecedent[],
): Promise<string> {
  const client = getClient();
  if (!client) throw new Error("LLM_API_KEY not set — falling back to template");

  // Cache hit
  const cached = replyCache.get(decision.ticketId);
  if (cached) return cached;

  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 5000);
  const model = process.env.LLM_MODEL ?? "llama-3.1-8b-instant";
  const prompt = buildPrompt(decision, ticketDescription, order, topPrecedents);

  // Throttle concurrency (Groq free tier rate limit)
  await acquireSlot();
  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    const completion = await client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.4,
      },
      { signal: timeoutSignal },
    );

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("LLM returned empty reply");

    replyCache.set(decision.ticketId, text);
    return text;
  } catch (err: unknown) {
    // Surface a typed error so the caller can log usefully.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM reply failed for ${decision.ticketId}: ${msg}`);
  } finally {
    releaseSlot();
  }
}
