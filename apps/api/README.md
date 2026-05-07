# @omnijob/api

Bun + Elysia.js API. Vector search via Qdrant, encrypted user blobs in SQLite.

## Setup

```sh
bun install
bun run init:qdrant    # creates the `jobs` and `users` collections
bun run init:sqlite    # creates the users SQLite table
bun run dev            # http://localhost:3000
```

Requires Qdrant + Redis running (see `../../infra/docker-compose.yml`).

## Endpoints

| Method | Path                | Purpose                                                                  |
| ------ | ------------------- | ------------------------------------------------------------------------ |
| GET    | `/health`           | Liveness + Qdrant + SQLite reachability                                  |
| POST   | `/jobs/search`      | Body `{ vector: float[1536], k? }` → top-K nearest jobs                  |
| POST   | `/jobs/ingest`      | Crawler → API: `{ id, vector, metadata }`                                |
| POST   | `/users/register`   | `{ uid, salt, encrypted_dek }` - server never sees password              |
| POST   | `/users/login`      | `{ uid }` → `{ salt, encrypted_dek }` for client-side key derivation     |
| POST   | `/users/profile`    | `{ uid, encrypted_profile_blob, skill_vector }` - blob encrypted client-side |
| WS     | `/match/stream`     | Realtime "new match" notifications (echo scaffold for now)               |

PII isolation per PROJECT.md §6: the user's `skill_vector` is stored in
Qdrant under a random point id, with the uid → point-id mapping kept
inside the encrypted profile blob - never written to a plain-text column.
