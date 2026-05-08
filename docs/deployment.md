# OmniJOB - Deployment Runbook

Primary target is **DigitalOcean** (via the GitHub Student Pack's $200 credit) with **Cloudflare Pages** for the SPA. End-to-end provisioning takes ~15 minutes of clock time, ~10 of which is cloud-init running on its own.

The Azure path is preserved as an alternative - see `docs/deployment-azure.md`-equivalent inline at the bottom.

## What we're deploying

| Component | Hosted on | Cost |
|---|---|---|
| Web SPA (`apps/web`) | Cloudflare Pages free tier | $0 always |
| API + Qdrant + Ollama + crawler | DO droplet `s-2vcpu-4gb` (2 vCPU / 4 GB) | ~$24/mo, $200 credit ≈ 7 months |
| Daily backups | DO Spaces (250 GB) | $5/mo (free under credit window) |
| DNS + edge | Cloudflare (free) | $0 |
| Domain | `omnijob.app` (Porkbun, Namecheap, etc.) | ~$12/year |

Privacy-moat note: Ollama lives on the droplet. No résumé text leaves our infrastructure. When the $200 credit runs out, the same compose files redeploy onto Hetzner CX22 (~€6/mo) without code changes.

---

## Prerequisites

- DigitalOcean account - redeem $200 student credit at https://education.github.com/pack (search "DigitalOcean").
- `doctl` CLI - `winget install DigitalOcean.doctl` on Windows, or https://docs.digitalocean.com/reference/doctl/how-to/install/.
- DO API token with read+write scope: https://cloud.digitalocean.com/account/api/tokens.
- An SSH keypair at `~/.ssh/id_ed25519.pub` (preferred) or `~/.ssh/id_rsa.pub`. Generate with `ssh-keygen -t ed25519` if missing.
- A domain registered. The runbook assumes `omnijob.app`; substitute your own everywhere.
- A Cloudflare account with the domain added (free).
- This repo cloned locally; you'll run commands from the repo root.

---

## Step 1 - Provision the droplet (~5 min)

```sh
doctl auth init     # paste the API token
doctl account get   # confirm
bash deploy/digitalocean/setup.sh
```

The script is idempotent - re-run safely after any failure. It creates:

- Droplet `omnijob-vm` (Ubuntu 22.04, `s-2vcpu-4gb`, NYC3 by default)
- Reserved IP, assigned to the droplet (free while attached)
- Cloud firewall `omnijob-fw` allowing 22/80/443 inbound
- Tag `omnijob` applied to the droplet (so the firewall auto-applies)

Cloud-init runs in the background after the droplet boots (~4-5 min). It installs Docker, Caddy, Bun, Go, awscli, clones this repo, brings up `docker-compose.yml + docker-compose.prod.yml`, pulls the Ollama embedding model, and enables the systemd timers.

**Watch progress (optional):**
```sh
ssh om@<RESERVED_IP>
sudo tail -f /var/log/cloud-init-output.log
```

You'll see the bootstrap finish with `OmniJob bootstrap complete at ...`.

Override defaults via env if needed:
```sh
REGION=sfo3 SIZE=s-2vcpu-2gb-amd bash deploy/digitalocean/setup.sh
```

---

## Step 2 - DNS + TLS (~5 min)

In Cloudflare's DNS panel:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api` | (Reserved IP from step 1) | **DNS only** for first run; flip to Proxied after cert issues |
| CNAME | `@` | (Cloudflare Pages hostname from step 3) | Proxied |
| CNAME | `www` | `omnijob.app` | Proxied |

The "DNS only" setting on the `api` record is mandatory the first time - Caddy needs Let's Encrypt's HTTP-01 challenge to reach the droplet directly.

After DNS propagates (~1-5 min), confirm:

```sh
curl -fsS https://api.omnijob.app/health
# → {"status":"ok","qdrant":true,"sqlite":true,"ollama":true}
```

If `qdrant` or `ollama` is `false`, SSH in and check `docker ps`.

---

## Step 3 - Cloudflare Pages (~5 min)

1. https://dash.cloudflare.com → your account → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select the `OmniJOB` repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: `cd apps/web && bun install && bun run build`
   - Build output directory: `apps/web/dist`
   - Root directory: (leave blank)
4. Environment variables (Production):
   - `VITE_API_URL` = `https://api.omnijob.app`
   - `VITE_EMBEDDING_DIM` = `768`
5. Save. First deploy runs immediately; ~2 minutes.
6. After the first deploy, **Custom domains** → add `omnijob.app` and `www.omnijob.app`. Cloudflare wires up DNS automatically.

Pages does its own SPA fallback via `apps/web/public/_redirects` - no `staticwebapp.config.json` needed.

---

## Step 4 - API env vars on the droplet

The API refuses to start in production without `ALLOWED_ORIGINS` set. SSH in and configure:

```sh
ssh om@<RESERVED_IP>
sudo tee /etc/systemd/system/omnijob-api.service.d/override.conf <<'EOF'
[Service]
Environment=ALLOWED_ORIGINS=https://omnijob.app,https://www.omnijob.app
EOF
sudo systemctl daemon-reload
sudo systemctl restart omnijob-api.service
sudo journalctl -u omnijob-api.service --since "1 min ago"
```

Already set by cloud-init / the systemd unit:
```
NODE_ENV=production
PORT=3000
QDRANT_URL=http://localhost:6333
OLLAMA_URL=http://localhost:11434
SQLITE_PATH=/var/lib/omnijob/users.db
```

---

## Step 5 - (Optional) DO Spaces for offsite backups

Local-disk backups under `/var/lib/omnijob/backups` always run. To also push to DO Spaces:

```sh
# From your laptop:
doctl spaces create omnijob-backups --region nyc3
# Generate access keys at https://cloud.digitalocean.com/account/api/spaces

# Then on the droplet:
ssh om@<RESERVED_IP>
sudo tee -a /etc/systemd/system/omnijob-api.service.d/override.conf <<'EOF'
Environment=DO_SPACES_BUCKET=omnijob-backups
Environment=DO_SPACES_REGION=nyc3
Environment=DO_SPACES_KEY=<access-key>
Environment=DO_SPACES_SECRET=<secret>
EOF
sudo systemctl daemon-reload
sudo systemctl restart omnijob-api.service
```

The backup cron picks these up on its next run (03:00 UTC).

---

## Step 6 - Smoke test (~5 min)

1. **API reachability:** `curl -fsS https://api.omnijob.app/health` → ok JSON.
2. **Web SPA:** `https://omnijob.app/` loads the React build with valid TLS.
3. **Deep-link routing:** `https://omnijob.app/privacy` directly visited does NOT 404 (proves `_redirects` fallback works).
4. **CORS:** open the SPA in a browser, log in, hit `/jobs/search` - no CORS error in DevTools console.
5. **Onboarding flow:** create a test account, paste a small résumé, save the recovery key, log out, log back in, confirm matches load.
6. **Crawler scheduled:**
   ```sh
   ssh om@<RESERVED_IP>
   systemctl list-timers omnijob-crawler.timer
   # → next run at 02:00 / 14:00 UTC
   ```
   Force-run a crawl to seed initial data:
   ```sh
   sudo systemctl start omnijob-crawler.service
   sudo journalctl -u omnijob-crawler.service -f   # ~30-60 min
   ```
   When done, the chained `omnijob-dedupe.service` runs automatically.
7. **Backup ran:** wait until 03:00 UTC, then:
   ```sh
   ssh om@<RESERVED_IP> ls -lh /var/lib/omnijob/backups/
   # If DO Spaces configured:
   aws s3 ls s3://omnijob-backups/ --endpoint-url https://nyc3.digitaloceanspaces.com
   ```

---

## Step 7 - Soft launch

1. Tag the deployed commit:
   ```sh
   git tag v0.1.0-beta -m "first public deploy"
   git push --tags
   ```
2. Send the first 5-10 invites. Tail `/var/lib/omnijob/audit.log` for the first hour to spot abuse.
3. Have a feedback channel ready - `mailto:feedback@omnijob.app` via Cloudflare Email Routing (free).

---

## Cost & runway

```sh
doctl balance get
doctl invoice list
```

The droplet burns ~$0.80/day. With the $200 credit you have ~7 months of runway. Set a billing alert at $150 spent so you have a 30-day window to migrate.

When the credit ends, two clean exits:
- **Cheaper, no DO**: provision a Hetzner CX22 (~€6/mo), `scp` the `/var/lib/omnijob/` dir over, `git clone` the repo, run docker-compose. Same Caddyfile, same systemd units. ~30 minutes of work.
- **Stay on DO**: pay-as-you-go kicks in at ~$24/mo. Lower-friction; higher cost.

---

## Rollback

**Bad web deploy (Cloudflare Pages)**: in the Pages dashboard → Deployments → previous deploy → **Rollback to this deployment**. Or `git revert <bad-commit> && git push` and let Pages auto-redeploy.

**Bad API deploy (cloud-init wedged or systemd broken)**:
```sh
ssh om@<RESERVED_IP>
cd /home/om/omnijob
git fetch && git reset --hard <last-good-sha>
sudo systemctl restart omnijob-api.service
```

**Index corrupted**:
```sh
# Restore the most recent Qdrant snapshot.
ssh om@<RESERVED_IP>
ls /var/lib/omnijob/backups/   # pick a date dir
# Stop the crawler timer, restore each collection via Qdrant snapshot API,
# then re-enable.
sudo systemctl stop omnijob-crawler.timer
# (snapshot restore exec'd on the VM; follow Qdrant docs)
sudo systemctl start omnijob-crawler.timer
```

---

## Tear-down

```sh
doctl compute droplet delete omnijob-vm --force
doctl compute reserved-ip delete <ip> --force
doctl compute firewall delete <fw-id> --force
doctl spaces delete omnijob-backups --force   # if used
```

Cloudflare DNS + the registered domain persist (delete those manually if abandoning the project).

---

## Beta hardening

Hardening that ships in the API for the public beta. Most of these are off-by-default in dev and only activate when `NODE_ENV=production` is set.

### What's enforced

| Layer | Protection | File |
|---|---|---|
| Bun listener | 1 MB request body cap (rejects oversized POSTs before parse) | `apps/api/src/index.ts` |
| API middleware | Per-IP fixed-window rate limits on hot routes | `apps/api/src/lib/ratelimit.ts` |
| API middleware | Fail-closed CORS - startup aborts if `ALLOWED_ORIGINS` unset in prod | `apps/api/src/index.ts` |
| Embed client | 30 s hard timeout on Ollama calls (prevents wedged-model worker exhaustion) | `apps/api/src/embed/ollama.ts` |
| Auth routes | JSON-lines audit log of register/login/recovery/reset events | `apps/api/src/lib/audit.ts` |
| Container runtime | Memory + CPU caps on Qdrant (1G/1cpu), Ollama (2G/2cpu), Redis (256M/0.5cpu) | `infra/docker-compose.prod.yml` |
| Container runtime | Log rotation (10 MB × 3 files) - prevents `/var/lib/docker/containers` from filling the disk | `infra/docker-compose.prod.yml` |

### Rate limit buckets (per IP)

| Route(s) | Limit | Window |
|---|---|---|
| `POST /jobs/search` | 60 req | 60 s |
| `POST /embed` | 10 req | 60 s |
| `POST /jobs/:id/match-explain` | 10 req | 60 s |
| `POST /users/login`, `GET /users/:uid/recovery` | 30 req | 60 s |
| `POST /users/register`, `POST /users/reset-password` | 5 req | 1 hour |
| `POST /users/profile`, `POST /users/profile/blob` | 30 req | 60 s |

A blocked request returns `429` with `Retry-After` and a JSON body `{"error":"rate_limited","retry_after_sec":N}`. The SPA already surfaces 4xx errors via the existing toast pipeline; no client change needed.

### Required env vars on the droplet

Add these via the systemd override (Step 4 above). Without them the API will refuse to start in production mode:

```
NODE_ENV=production
ALLOWED_ORIGINS=https://omnijob.app,https://www.omnijob.app
SQLITE_PATH=/var/lib/omnijob/users.db
QDRANT_URL=http://localhost:6333
OLLAMA_URL=http://localhost:11434
```

Optional tunables (defaults are sane for a 4 GB droplet):

```
MAX_BODY_BYTES=1048576
OLLAMA_TIMEOUT_MS=30000
AUDIT_LOG_PATH=/var/lib/omnijob/audit.log
```

Optional offsite backups (Step 5):
```
DO_SPACES_BUCKET=omnijob-backups
DO_SPACES_REGION=nyc3
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
```

Optional error tracking (Sentry). Set on the droplet for the API and in
the Vercel project env for the frontend. Leave blank to disable - the SDK
init is gated on the DSN being non-empty.
```
SENTRY_DSN=https://...@o....ingest.sentry.io/...        # API
VITE_SENTRY_DSN=https://...@o....ingest.sentry.io/...   # Frontend
```

### Audit log inspection

The auth audit log lives at `/var/lib/omnijob/audit.log` (one JSON object per line). Tail it during the first week of beta to spot abuse patterns:

```sh
ssh om@<RESERVED_IP>
tail -f /var/lib/omnijob/audit.log | jq -c '{ts, event, ip}'

# How many distinct IPs registered in the last hour?
jq -rs --arg cutoff "$(date -u -d '1 hour ago' +%FT%TZ)" \
  'map(select(.event == "register" and .ts > $cutoff)) | map(.ip) | unique | length' \
  /var/lib/omnijob/audit.log
```

Logrotate is not configured for this file by default - for a long beta, add a daily rotation in `/etc/logrotate.d/omnijob-audit`.

### Known gaps (deferred)

- No Redis-backed distributed rate limiter - single-instance only. Migrate when scaling the API horizontally.
- No CAPTCHA on `/users/register`. The 5/hour/IP cap is the primary brake; revisit if signup floods materialize.
- No mTLS or auth on the internal Qdrant/Ollama ports. They bind to 127.0.0.1 only (see `docker-compose.prod.yml`), so the VM perimeter is the trust boundary.

---

## Alternative: Azure (capacity-constrained)

The earlier Azure tooling lives at `deploy/azure/` (`azure.sh`, `cloud-init.yaml`, `deploy-with-retry.sh`). It works in principle, but the Azure-for-Students UBC subscription used during initial development exhibits two practical problems:

1. **B-series capacity exhaustion** in all 5 US regions the sub is allowed (eastus2, centralus, southcentralus, westus3, northcentralus). `deploy/azure/deploy-with-retry.sh` tries 4 SKU classes × 5 regions and consistently fails at the time of writing.
2. **Basic SKU public IP quota = 0** (Microsoft retiring Basic; Standard SKU costs ~$3.65/mo per IP).

If you want to attempt Azure anyway:

```sh
az login
az account show --query name
bash deploy/azure/deploy-with-retry.sh
```

The same `cloud-init.yaml`, Caddyfile, systemd units, and backup script work - only the provisioning script (`azure.sh` vs `setup.sh`) differs. Backup script honors `AZURE_STORAGE_ACCOUNT` for Blob upload via the VM's managed identity.
