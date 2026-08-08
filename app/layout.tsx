import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zepto · AI Support Command Center",
  description:
    "Evidence-grounded support ticket resolution with deterministic policy guardrails and human review.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0f382c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
