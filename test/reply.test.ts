import { describe, expect, it } from "vitest";
import { generateReply } from "@/lib/reply";
import { generateTemplateReply } from "@/lib/reply/templates";
import type { ResolutionAction } from "@/lib/types";
import { mkDecision } from "./fixtures";

const ticket = { ticketId: "N-015", orderId: "ORD-9915" };

describe("generateTemplateReply", () => {
  it("produces a reply for every one of the 7 actions", () => {
    const actions: ResolutionAction[] = [
      "redelivery",
      "partial_refund",
      "full_refund",
      "refund_reissue",
      "coupon",
      "escalation",
      "apology_no_action",
    ];
    for (const action of actions) {
      const reply = generateTemplateReply(mkDecision({ action }), ticket);
      expect(reply.length).toBeGreaterThan(0);
    }
  });

  it("names the ₹ amount for a partial refund", () => {
    const reply = generateTemplateReply(
      mkDecision({ action: "partial_refund", amountInr: 82, lane: "auto" }),
      ticket,
    );
    expect(reply).toContain("₹82");
    expect(reply).not.toContain("[DRAFT");
  });

  it("references the order id for a redelivery", () => {
    const reply = generateTemplateReply(
      mkDecision({ action: "redelivery", amountInr: null, lane: "auto" }),
      ticket,
    );
    expect(reply).toContain("ORD-9915");
  });

  it("prefixes a human-lane reply as a draft awaiting approval", () => {
    const reply = generateTemplateReply(
      mkDecision({ action: "redelivery", amountInr: null, lane: "human" }),
      ticket,
    );
    expect(reply.startsWith("[DRAFT — AWAITING APPROVAL] ")).toBe(true);
  });

  it("does not prefix an auto-lane reply", () => {
    const reply = generateTemplateReply(mkDecision({ lane: "auto" }), ticket);
    expect(reply).not.toContain("[DRAFT");
  });
});

describe("generateReply", () => {
  it("returns the template with source 'template'", async () => {
    const { reply, source } = await generateReply(
      mkDecision({ action: "full_refund", amountInr: 640, lane: "auto" }),
      ticket,
    );
    expect(source).toBe("template");
    expect(reply).toContain("₹640");
  });
});
