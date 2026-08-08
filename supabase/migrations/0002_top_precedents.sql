-- The board renders the top-3 precedents with their similarity + past action.
-- decisions.precedent_ids stores only ids, so persist the scored top-3 here to
-- avoid re-running retrieval at board-render time (that would be re-inference).
-- Each element: { ticketId, similarity, action, csat }.
alter table decisions
  add column if not exists top_precedents jsonb not null default '[]';
