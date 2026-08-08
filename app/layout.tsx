import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZeptoSupport · Agentic Ticket Resolution",
  description:
    "Evidence-grounded support ticket resolution: TF-IDF retrieval, CSAT-weighted voting, and deterministic G1–G5 policy guardrails with a human-review lane.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
