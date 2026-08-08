import { describe, expect, it } from "vitest";
import { idempotencyKey } from "@/lib/audit/execute";
import { decisionToRow } from "@/lib/audit/persist";
import { mkDecision } from "./fixtures";

// The DB round-trip itself is verified live against Supabase via
// POST /api/tickets/process (STOP-GATE 1). Here we lock the pure pieces: the
// idempotency-key format and the camelCase → snake_case row mapping.

describe("idempotencyKey", () => {
  it("is {ticket}:{action}:{attempt} and defaults attempt to 1", () => {
    expect(idempotencyKey("N-015", "partial_refund")).toBe("N-015:partial_refund:1");
    expect(idempotencyKey("N-015", "partial_refund", 2)).toBe("N-015:partial_refund:2");
  });

  it("differs by ticket and by action so it never collides across tickets", () => {
    expect(idempotencyKey("N-001", "redelivery")).not.toBe(
      idempotencyKey("N-002", "redelivery"),
    );
  });
});

describe("decisionToRow", () => {
  it("maps every field to its snake_case column", () => {
    const row = decisionToRow(
      mkDecision({
        ticketId: "N-015",
        lane: "auto",
        action: "partial_refund",
        amountInr: 82,
        vetoedBy: null,
        precedentIds: ["H-1000", "H-1001"],
        draftReply: "hi",
        replySource: "template",
      }),
      [{ ticketId: "H-1000", similarity: 1, action: "partial_refund", csat: 5 }],
    );
    expect(row.ticket_id).toBe("N-015");
    expect(row.amount_inr).toBe(82);
    expect(row.top_similarity).toBe(1.0);
    expect(row.precedent_ids).toEqual(["H-1000", "H-1001"]);
    expect(row.draft_reply).toBe("hi");
    expect(row.reply_source).toBe("template");
    expect(row.top_precedents).toHaveLength(1);
  });

  it("nulls draft_reply / reply_source when absent", () => {
    const row = decisionToRow(mkDecision({ draftReply: undefined, replySource: undefined }), []);
    expect(row.draft_reply).toBeNull();
    expect(row.reply_source).toBeNull();
  });
});
