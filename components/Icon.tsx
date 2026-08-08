import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "check"
  | "chevron"
  | "close"
  | "copy"
  | "layers"
  | "overview"
  | "package"
  | "play"
  | "plus"
  | "refresh"
  | "search"
  | "shield"
  | "sparkles"
  | "ticket";

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common} {...props}>
      {name === "alert" && (
        <>
          <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      )}
      {name === "check" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      )}
      {name === "chevron" && <path d="m9 18 6-6-6-6" />}
      {name === "close" && (
        <>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </>
      )}
      {name === "copy" && (
        <>
          <rect width="13" height="13" x="9" y="9" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </>
      )}
      {name === "layers" && (
        <>
          <path d="m12 2 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 17 9 5 9-5" />
        </>
      )}
      {name === "overview" && (
        <>
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
        </>
      )}
      {name === "package" && (
        <>
          <path d="m7.5 4.3 9 5.2" />
          <path d="M3.3 7 12 12l8.7-5" />
          <path d="M12 22V12" />
          <path d="M20.5 16.8V7.2a2 2 0 0 0-1-1.7l-6.5-3.8a2 2 0 0 0-2 0L4.5 5.5a2 2 0 0 0-1 1.7v9.6a2 2 0 0 0 1 1.7l6.5 3.8a2 2 0 0 0 2 0l6.5-3.8a2 2 0 0 0 1-1.7Z" />
        </>
      )}
      {name === "play" && <path d="m8 5 11 7-11 7V5Z" />}
      {name === "plus" && (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M20 7h-5V2" />
          <path d="M4.9 19a9 9 0 1 0 .6-13L15 7" />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      )}
      {name === "shield" && (
        <>
          <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "sparkles" && (
        <>
          <path d="m12 3-1.2 3.2L7.5 7.5l3.3 1.3L12 12l1.2-3.2 3.3-1.3-3.3-1.3L12 3Z" />
          <path d="m19 13-.8 2.2L16 16l2.2.8L19 19l.8-2.2L22 16l-2.2-.8L19 13Z" />
          <path d="m5 14-.7 1.8-1.8.7 1.8.7L5 19l.7-1.8 1.8-.7-1.8-.7L5 14Z" />
        </>
      )}
      {name === "ticket" && (
        <>
          <path d="M2 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3Z" />
          <path d="M13 5v2" />
          <path d="M13 11v2" />
          <path d="M13 17v2" />
        </>
      )}
    </svg>
  );
}
