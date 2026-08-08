import { useId } from "react";
import type { CSSProperties } from "react";

// Brand mark for the AI support command center. A rounded badge holding a
// speed-bolt threaded through a subtle shield notch — "fast resolution, held
// inside deterministic guardrails". Self-contained SVG, no external assets, so
// it renders identically in the sidebar, the topbar and the presentation hero.

export function LogoMark({
  size = 40,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  // useId is stable across SSR and client, so multiple marks never clash and
  // the gradient id never triggers a hydration mismatch.
  const gid = `logo-grad-${useId()}`;
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Zepto Support"
    >
      <defs>
        <linearGradient id={gid} x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${gid})`} />
      {/* shield notch — subtle safety silhouette */}
      <path
        d="M24 9.5 34 13.2v7.3c0 6.4-4.2 10.3-10 12.4-5.8-2.1-10-6-10-12.4v-7.3L24 9.5Z"
        fill="#ffffff"
        fillOpacity="0.14"
      />
      {/* speed bolt */}
      <path
        d="M26.4 12 16.8 25.1c-.5.7 0 1.7.9 1.7h5l-2.2 8.9c-.2.9.9 1.5 1.6.8l10-13.2c.5-.7 0-1.7-.9-1.7h-5.1l2.1-8.6c.2-.9-.9-1.5-1.5-.8Z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function LogoWordmark({
  size = 34,
  tagline,
  tone = "dark",
  className,
}: {
  size?: number;
  tagline?: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={`logo-wordmark logo-tone-${tone} ${className ?? ""}`}>
      <LogoMark size={size} />
      <span className="logo-wordmark-text">
        <strong>
          Zepto<span>Support</span>
        </strong>
        {tagline && <small>{tagline}</small>}
      </span>
    </span>
  );
}
