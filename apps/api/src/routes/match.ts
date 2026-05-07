import { Elysia, t } from "elysia";

// Realtime "new match" stream. Boilerplate echo for now; broadcasting from
// the crawler ingest path (PROJECT.md §FR.4) is a follow-up.
export const match = new Elysia().ws("/match/stream", {
  body: t.Object({ ping: t.Optional(t.String()) }),
  open(ws) {
    ws.send({ event: "hello", ts: Date.now() });
  },
  message(ws, msg) {
    ws.send({ event: "echo", payload: msg, ts: Date.now() });
  },
});
