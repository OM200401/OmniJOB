# OmniJOB — Azure Deployment Runbook

This runs you from a fresh Azure free-trial signup to a working
`https://omnijob.app` in roughly 90 minutes of clock time. Most of it is
Azure waiting on itself; the human-attended steps total ~30 minutes.

## What we're deploying

| Component | Hosted on | Cost |
|---|---|---|
| Web SPA (`apps/web`) | Azure Static Web Apps free tier | $0 always |
| API + Qdrant + Ollama + crawler | Azure VM B2s (2 vCPU / 4 GB) | ~$30/mo, $200 credit ≈ 6 months |
| Daily backups | Azure Blob Storage (LRS, <5 GB) | $0 first 12 months |
| Telemetry | Application Insights | $0 under 5 GB/mo |
| DNS + edge | Cloudflare (free) | $0 |
| Domain | `omnijob.app` (Porkbun, Namecheap, etc.) | ~$12/year |

Privacy-moat note: Ollama lives on the VM. No résumé text leaves our
infrastructure. When the $200 credit runs out, the same VM image and the
same compose files redeploy onto Hetzner CX22 (~$8/mo) without code
changes.

---

## Prerequisites

- Azure free account (https://azure.microsoft.com/free) — requires a credit card; no auto-charge after credit.
- `az` CLI — `brew install azure-cli` or `winget install Microsoft.AzureCLI`.
- An SSH keypair at `~/.ssh/id_rsa.pub`. Generate with `ssh-keygen -t rsa -b 4096` if missing.
- A domain registered. The runbook assumes `omnijob.app`; substitute your own everywhere.
- A Cloudflare account with the domain added (free).
- This repo cloned locally; you'll run `az` commands from the repo root.

---

## Step 1 — Provision Azure resources (~10 min, mostly waiting)

```sh
az login
az account show --query name   # confirm you're on "Free Trial"
bash deploy/azure/azure.sh
```

The script is idempotent — re-run safely after any failure. It creates:

- Resource group `omnijob` in `eastus` (cheapest B-series region)
- VM `omnijob-vm` (Ubuntu 22.04, B2s, system-assigned managed identity)
- NSG rule opening 80 + 443
- Storage account `omnijobbackups<random>` with `backups` container
- Application Insights `omnijob-insights`
- Role assignment letting the VM upload to Blob Storage via its identity

Cloud-init runs in the background after the VM boots (~6-8 min). It
installs Docker, Caddy, Bun, Go, Azure CLI, clones this repo, and brings
up `docker-compose.yml + docker-compose.prod.yml`.

**Watch progress (optional):**
```sh
ssh om@$(az vm show -d -g omnijob -n omnijob-vm --query publicIps -o tsv)
sudo tail -f /var/log/cloud-init-output.log
```

You'll see the bootstrap finish with `OmniJob bootstrap complete at ...`.

---

## Step 2 — DNS + TLS (~5 min)

In Cloudflare's DNS panel:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api` | (VM public IP from step 1) | **DNS only** for first run, can flip to Proxied after cert issues |
| CNAME | `@` | (Static Web App default hostname, e.g. `<id>.azurestaticapps.net`) | Proxied |
| CNAME | `www` | `omnijob.app` | Proxied |

The "DNS only" setting on the `api` record is mandatory the first time —
Caddy needs Let's Encrypt's HTTP-01 challenge to reach the VM directly.
Once the cert is issued you can flip to Proxied (DNS-01 is a follow-up
fix tracked in `deploy/azure/Caddyfile`).

After DNS propagates (~1-5 min), confirm:

```sh
curl -fsS https://api.omnijob.app/health
# → {"status":"ok","qdrant":true,"sqlite":true,"ollama":true}
```

If `qdrant` or `ollama` is `false`, SSH in and check `docker ps`.

---

## Step 3 — Static Web Apps GitHub Action (~5 min)

1. The `azure.sh` script created the Static Web App. Get the deployment token:
   ```sh
   az staticwebapp secrets list -g omnijob -n omnijob-web --query properties.apiKey -o tsv
   ```
2. In the GitHub repo, **Settings → Secrets and variables → Actions → New secret**:
   - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Value: (paste from step above)
3. Make a trivial change to `apps/web/` (e.g. update `apps/web/README.md`) and push to `main`. The workflow at
   `.github/workflows/azure-static-web-app.yml` runs `bun install + bun run build` with `VITE_API_URL=https://api.omnijob.app`, then deploys.
4. Confirm via Actions tab; build should land in ~2 min.

---

## Step 4 — Smoke test (~5 min)

1. **API reachability:** `curl -fsS https://api.omnijob.app/health` → ok JSON.
2. **Web SPA:** `https://omnijob.app/` loads the React build with valid TLS.
3. **Deep-link routing:** `https://omnijob.app/privacy` directly visited does NOT 404 (proves `staticwebapp.config.json` fallback works).
4. **CORS:** open the SPA in a browser, log in, hit `/jobs/search` — no CORS error in DevTools console.
5. **Onboarding flow:** create a test account, paste a small résumé, save the recovery key, log out, log back in, confirm matches load.
6. **Crawler scheduled:**
   ```sh
   ssh om@<VM_IP>
   systemctl list-timers omnijob-crawler.timer
   # → next run at 02:00 UTC
   ```
   Force-run a crawl to seed initial data:
   ```sh
   sudo systemctl start omnijob-crawler.service
   tail -f /var/log/omnijob-crawler.log   # ~30-60 min
   ```
   When done, the chained `omnijob-dedupe.service` runs automatically.
7. **Backup ran:** wait until 03:00 UTC the first night, then:
   ```sh
   az storage blob list --account-name <STORAGE_ACCOUNT> --container backups -o table
   ```
   You should see `users.db` and `jobs.snapshot` / `users.snapshot` blobs from the previous night.
8. **App Insights ingesting:** in Azure portal → `omnijob-insights` → Logs, run `requests | take 10` and confirm `/health` probes are landing.

---

## Step 5 — Soft launch

1. Tag the deployed commit:
   ```sh
   git tag v0.1.0-beta -m "first public deploy"
   git push --tags
   ```
2. Update PROJECT.md §9 — resolve "Hosting target for the Bun/Elysia API" with the Hetzner-compatible Azure plan.
3. Send the first 5-10 invites. Watch App Insights `requests` and `exceptions` for the first hour.
4. Have a feedback channel ready — `mailto:feedback@omnijob.app` via Cloudflare Email Routing (free) or a self-hosted Plausible analytics dashboard on the same VM.

---

## Cost & runway

```sh
az consumption usage list --top 10 -o table
az consumption budget show -g omnijob 2>/dev/null   # set a budget for safety
```

The B2s VM burns ~$1/day. With the $200 credit you have ~180 days of runway. Budget-alert at $150 spent so you have a 30-day window to migrate.

When the credit ends, two clean exits:
- **Cheaper, no Azure**: provision a Hetzner CX22 (~€6/mo), `scp` the `/var/lib/omnijob/` dir over, `git clone` the repo, run docker-compose. Same Caddyfile, same systemd units. ~30 minutes of work.
- **Stay on Azure**: pay-as-you-go kicks in at ~$30/mo for the same B2s. Lower-friction; higher cost.

---

## Rollback

**Bad web deploy (Static Web App)**:
```sh
git revert <bad-commit> && git push
# Workflow auto-deploys the revert.
```

**Bad API deploy (cloud-init wedged or systemd broken)**:
```sh
ssh om@<VM_IP>
cd /home/om/omnijob
git fetch && git reset --hard <last-good-sha>
sudo systemctl restart omnijob-api.service
```

**Index corrupted**:
```sh
# Restore the most recent Qdrant snapshot.
az storage blob download-batch --account-name <STORAGE_ACCOUNT> --source backups -d /tmp/restore --pattern "<DATE>/*"
# Stop the crawler timer, restore each collection via Qdrant snapshot API,
# then re-enable.
sudo systemctl stop omnijob-crawler.timer
# (snapshot restore exec'd on the VM; follow Qdrant docs)
sudo systemctl start omnijob-crawler.timer
```

---

## Tear-down

```sh
az group delete -n omnijob --yes --no-wait
```

One command, ~30 seconds, removes every Azure resource including the VM, storage, IPs, and Static Web App. Cloudflare DNS + the registered domain persist (delete those manually if abandoning the project).
