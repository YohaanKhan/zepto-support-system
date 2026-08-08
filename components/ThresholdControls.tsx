"use client";

import type { CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { DEFAULT_REPLAY_THRESHOLDS, type ReplayThresholds } from "@/lib/policy/replay";

// Sprint 9 — what-if threshold controls. Dragging a slider re-partitions the
// board instantly by re-running the pure gate over already-loaded scores
// (see lib/policy/replay.ts). No triage, no LLM, no network per drag — the
// parent recomputes lanes locally; GET /api/replay is the server mirror.

type Key = keyof ReplayThresholds;

const SLIDERS: { key: Key; label: string; hint: string }[] = [
  { key: "minSimilarity", label: "Min similarity", hint: "Below this, evidence is too weak (G5)" },
  { key: "minVoteShare", label: "Min vote share", hint: "How much precedents must agree" },
  { key: "minVoteMargin", label: "Min vote margin", hint: "Winner must beat the runner-up by this" },
];

export function ThresholdControls({
  thresholds,
  counts,
  baseAuto,
  onChange,
  onReset,
}: {
  thresholds: ReplayThresholds;
  counts: { auto: number; human: number };
  baseAuto: number;
  onChange: (next: ReplayThresholds) => void;
  onReset: () => void;
}) {
  const isDefault =
    thresholds.minSimilarity === DEFAULT_REPLAY_THRESHOLDS.minSimilarity &&
    thresholds.minVoteShare === DEFAULT_REPLAY_THRESHOLDS.minVoteShare &&
    thresholds.minVoteMargin === DEFAULT_REPLAY_THRESHOLDS.minVoteMargin;

  const delta = counts.auto - baseAuto;

  return (
    <section className="threshold-panel" aria-label="Threshold what-if controls">
      <div className="threshold-head">
        <span><Icon name="sliders" /></span>
        <div>
          <h2>What-if thresholds</h2>
          <p>Re-partition the board from stored scores — no re-inference.</p>
        </div>
        <button type="button" className="threshold-reset" onClick={onReset} disabled={isDefault}>
          <Icon name="replay" /> Reset
        </button>
      </div>

      <div className="threshold-grid">
        {SLIDERS.map(({ key, label, hint }) => {
          const value = thresholds[key];
          const def = DEFAULT_REPLAY_THRESHOLDS[key];
          const shifted = value !== def;
          return (
            <div className="threshold-slider" key={key}>
              <small>
                {label}
                <b className={shifted ? "shifted" : ""}>{value.toFixed(2)}</b>
              </small>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={value}
                style={{ "--fill": `${Math.round(value * 100)}%` } as CSSProperties}
                onChange={(event) =>
                  onChange({ ...thresholds, [key]: Number(event.target.value) })
                }
                aria-label={`${label} (default ${def})`}
              />
              <p className="threshold-default">
                {hint} · default {def.toFixed(2)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="threshold-outcome">
        <span>At these thresholds:</span>
        <b className="chip-auto"><Icon name="check" /> {counts.auto} auto</b>
        <b className="chip-human"><Icon name="alert" /> {counts.human} human</b>
        <span className="chip-delta">
          {delta === 0 ? "same as default split" : `${delta > 0 ? "+" : ""}${delta} vs default`}
        </span>
      </div>
    </section>
  );
}
