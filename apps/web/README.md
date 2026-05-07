# @omnijob/web

Vite + React web client. Uses the **native Web Crypto API** for AES-256-GCM
and `hash-wasm` for Argon2id - exactly the model PROJECT.md §2.3 specifies,
which the React Native target can't fully deliver yet (RNQC ships only
partial Web Crypto). This makes the web app the simplest place to exercise
the full E2EE flow today.

## Setup

```sh
bun install
cp .env.example .env       # adjust VITE_API_URL if API runs elsewhere
bun run dev                # http://localhost:5173
```

Requires the API up (`apps/api`) and Qdrant + Redis (`infra/`).

## What it does

- **Register**: derives a 32-byte master key from the password via Argon2id
  (`t=3, m=64 MiB, p=1`), generates a random 256-bit DEK, AES-GCM-encrypts the
  DEK with the master key, sends `{ uid, salt, encrypted_dek }` to the API.
  The plaintext password never leaves the browser.
- **Login**: fetches `{ salt, encrypted_dek }` for the uid, re-derives the
  master key from the entered password, decrypts the DEK locally. Wrong
  password ⇒ AES-GCM auth-tag check fails ⇒ "incorrect password".
- **Dashboard**: shows the unlocked state and exposes a "Test search"
  button that POSTs a 1536-dim zero-vector to `/jobs/search` (real embedding
  generation is a follow-up - PROJECT.md §9).

The master key + DEK are held in memory only. Refreshing the page logs you out.

## Layout

```
src/
  main.tsx                React entry
  App.tsx                 Router
  index.css               Plain CSS, no framework
  lib/
    api.ts                fetch wrapper around VITE_API_URL
    auth.tsx              AuthContext + provider + useAuth hook
    crypto/
      argon2.ts           hash-wasm Argon2id wrapper
      aes-gcm.ts          Web Crypto AES-256-GCM wrapper
      vault.ts            high-level register/unlock/encrypt/decrypt
      util.ts             base64 + uuid helpers
  routes/
    Layout.tsx            shared chrome
    Login.tsx
    Register.tsx
    Dashboard.tsx
```
