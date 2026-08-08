/** @type {import('next').NextConfig} */
const nextConfig = {
  // The /api/ingest route reads the three CSVs from ./data via fs at runtime.
  // On Vercel, files not referenced statically are pruned from the serverless
  // bundle unless we trace them in explicitly. Without this, ingest 500s in
  // production while working fine locally (PLAN Sprint 1 deploy DoD).
  outputFileTracingIncludes: {
    "/api/ingest": ["./data/**"],
  },
};

export default nextConfig;
