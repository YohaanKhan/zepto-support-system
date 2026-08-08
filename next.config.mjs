import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Multiple lockfiles exist (git worktree). Pin the trace root to this project
  // so the /api/ingest data-file trace resolves correctly and the warning stops.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // The /api/ingest route reads the three CSVs from ./data via fs at runtime.
  // On Vercel, files not referenced statically are pruned from the serverless
  // bundle unless we trace them in explicitly. Without this, ingest 500s in
  // production while working fine locally (PLAN Sprint 1 deploy DoD).
  outputFileTracingIncludes: {
    "/api/ingest": ["./data/**"],
  },
};

export default nextConfig;
