// Placeholder status page. The real two-lane board is Sprint 5 — this exists
// only so the early Vercel deploy (ARCHITECTURE §7) shows something live and
// points at the ingest endpoint.

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ marginBottom: 4 }}>Zepto Support Ticket Manager</h1>
      <p style={{ color: "#a1a1aa", marginTop: 0 }}>
        DigiPlus IT Agentic AI Hackathon — 6-hour build. Sprint 1: scaffold +
        schema + ingest.
      </p>

      <section
        style={{
          marginTop: 32,
          padding: 20,
          border: "1px solid #26262c",
          borderRadius: 10,
          background: "#141419",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Setup status</h2>
        <ol style={{ lineHeight: 1.7, color: "#c7c7cd" }}>
          <li>
            Run <code>supabase/migrations/0001_init.sql</code> (6 tables).
          </li>
          <li>
            Load the corpus:{" "}
            <code>POST /api/ingest</code> → 300 + 30 + 30 = 360 rows.
          </li>
          <li>The two-lane board arrives in Sprint 5.</li>
        </ol>
      </section>

      <p style={{ marginTop: 24, color: "#71717a", fontSize: 13 }}>
        Ingest is a POST endpoint. From a terminal:{" "}
        <code>curl -X POST &lt;this-url&gt;/api/ingest</code>
      </p>
    </main>
  );
}
