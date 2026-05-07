#!/usr/bin/env bash
# Idempotent DigitalOcean provisioning for OmniJob.
#
# Prerequisites:
#   - doctl installed (https://docs.digitalocean.com/reference/doctl/how-to/install/)
#   - doctl auth init  (paste a DO API token with read+write scope)
#   - SSH key at ~/.ssh/id_ed25519.pub (or set SSH_KEY_PATH)
#
# Usage:
#   bash deploy/digitalocean/setup.sh
#
# Destroys with:
#   doctl compute droplet delete omnijob-vm --force
#   doctl compute floating-ip delete <ip> --force
#   doctl compute firewall delete <id> --force
#
# Cost shape (after $200 student credit):
#   s-2vcpu-4gb droplet     ~$24/mo
#   Reserved IP (attached)   $0
#   Cloud firewall           $0
#   Spaces (optional, 250G)  $5/mo (free under credit window)
#   Total                    ~$24-29/mo. ~7 months runway on $200.

set -euo pipefail

DROPLET_NAME="${DROPLET_NAME:-omnijob-vm}"
REGION="${REGION:-nyc3}"
SIZE="${SIZE:-s-2vcpu-4gb}"
IMAGE="${IMAGE:-ubuntu-22-04-x64}"
TAG="${TAG:-omnijob}"
FIREWALL_NAME="${FIREWALL_NAME:-omnijob-fw}"

# Prefer ed25519 (modern), fall back to RSA. Override with SSH_KEY_PATH env.
if [[ -n "${SSH_KEY_PATH:-}" ]]; then
    :
elif [[ -f "$HOME/.ssh/id_ed25519.pub" ]]; then
    SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
elif [[ -f "$HOME/.ssh/id_rsa.pub" ]]; then
    SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub"
else
    echo "ERROR: no SSH public key found at ~/.ssh/id_ed25519.pub or ~/.ssh/id_rsa.pub"
    echo "Generate one: ssh-keygen -t ed25519"
    exit 1
fi
echo "==> SSH key: $SSH_KEY_PATH"

if ! command -v doctl >/dev/null 2>&1; then
    # Windows: auto-detect doctl from the winget install location.
    if [[ "${OSTYPE:-}" == "msys"* || "${OSTYPE:-}" == "cygwin"* ]]; then
        for d in "$HOME/AppData/Local/Microsoft/WinGet/Packages/DigitalOcean.Doctl_"*/; do
            if [[ -f "$d/doctl.exe" ]]; then
                export PATH="$d:$PATH"
                break
            fi
        done
    fi
fi
if ! command -v doctl >/dev/null 2>&1; then
    echo "ERROR: doctl not on PATH. Install: https://docs.digitalocean.com/reference/doctl/how-to/install/"
    exit 1
fi

echo "==> Verifying doctl auth"
doctl account get >/dev/null

echo "==> Ensuring SSH key is registered with DO"
KEY_FINGERPRINT=$(ssh-keygen -lf "$SSH_KEY_PATH" -E md5 | awk '{print $2}' | sed 's/^MD5://')
if ! doctl compute ssh-key get "$KEY_FINGERPRINT" >/dev/null 2>&1; then
    KEY_NAME="omnijob-$(hostname)-$(date +%Y%m%d)"
    echo "    importing as '$KEY_NAME'"
    doctl compute ssh-key import "$KEY_NAME" --public-key-file "$SSH_KEY_PATH" >/dev/null
else
    echo "    already registered ($KEY_FINGERPRINT)"
fi

echo "==> Droplet $DROPLET_NAME ($SIZE in $REGION)"
DROPLET_ID=$(doctl compute droplet list --format ID,Name --no-header | awk -v n="$DROPLET_NAME" '$2 == n {print $1}')
if [[ -z "$DROPLET_ID" ]]; then
    doctl compute droplet create "$DROPLET_NAME" \
        --image "$IMAGE" \
        --size "$SIZE" \
        --region "$REGION" \
        --ssh-keys "$KEY_FINGERPRINT" \
        --user-data-file deploy/digitalocean/cloud-init.yaml \
        --tag-names "$TAG" \
        --enable-ipv6 \
        --enable-monitoring \
        --wait
    DROPLET_ID=$(doctl compute droplet list --format ID,Name --no-header | awk -v n="$DROPLET_NAME" '$2 == n {print $1}')
    echo "    created droplet $DROPLET_ID. Cloud-init runs in background (~4-5 min)."
else
    echo "    droplet exists ($DROPLET_ID); skipping create."
fi

DROPLET_IP=$(doctl compute droplet get "$DROPLET_ID" --format PublicIPv4 --no-header)
echo "    droplet public IPv4: $DROPLET_IP"

echo "==> Reserved IP"
RESERVED_IP=$(doctl compute reserved-ip list --format IP,DropletID --no-header | awk -v d="$DROPLET_ID" '$2 == d {print $1}')
if [[ -z "$RESERVED_IP" ]]; then
    # Reclaim any orphan reserved IP in the same region (left over from a failed prior run).
    RESERVED_IP=$(doctl compute reserved-ip list --format IP,Region,DropletID --no-header | awk -v r="$REGION" '$2 == r && ($3 == "" || $3 == "0") {print $1}' | head -1)
    if [[ -n "$RESERVED_IP" ]]; then
        echo "    reclaiming orphan reserved IP $RESERVED_IP from prior run"
    else
        RESERVED_IP=$(doctl compute reserved-ip create --region "$REGION" --format IP --no-header)
        echo "    created reserved IP $RESERVED_IP"
    fi
    # --wait is not supported on reserved-ip-action assign in current doctl;
    # the action returns synchronously so it's fine without.
    doctl compute reserved-ip-action assign "$RESERVED_IP" "$DROPLET_ID" >/dev/null
    echo "    assigned $RESERVED_IP to droplet"
else
    echo "    droplet already has reserved IP $RESERVED_IP"
fi

echo "==> Cloud firewall $FIREWALL_NAME"
FW_ID=$(doctl compute firewall list --format ID,Name --no-header | awk -v n="$FIREWALL_NAME" '$2 == n {print $1}')
if [[ -z "$FW_ID" ]]; then
    doctl compute firewall create \
        --name "$FIREWALL_NAME" \
        --tag-names "$TAG" \
        --inbound-rules "protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0" \
        --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0 protocol:icmp,address:0.0.0.0/0,address:::/0" \
        >/dev/null
    echo "    firewall created (22/80/443 inbound, all outbound)"
else
    echo "    firewall exists ($FW_ID)"
fi

cat <<EOF

============================================================
OmniJob - DigitalOcean provision summary
============================================================
Droplet ID         : $DROPLET_ID
Droplet name       : $DROPLET_NAME
Droplet IPv4       : $DROPLET_IP
Reserved IP        : $RESERVED_IP   <-- point DNS at this
Region             : $REGION
Size               : $SIZE
Tag                : $TAG
Firewall           : $FIREWALL_NAME

Next steps:
  1. Wait ~5 min for cloud-init to finish, then:
       ssh om@$RESERVED_IP
       sudo tail -f /var/log/cloud-init-output.log
  2. Cloudflare DNS:
       A    api.omnijob.app  -> $RESERVED_IP   (proxy: DNS only first run)
  3. Cloudflare Pages:
       Connect the repo at https://dash.cloudflare.com/?to=/:account/pages
       Build command: cd apps/web && bun install && bun run build
       Output dir:    apps/web/dist
       Env vars:      VITE_API_URL=https://api.omnijob.app
                      VITE_EMBEDDING_DIM=768
       Then add CNAME omnijob.app -> <pages-host>.pages.dev
  4. Once api.omnijob.app resolves, Caddy will issue TLS automatically:
       curl -fsS https://api.omnijob.app/health
  5. (Optional) DO Spaces for offsite backups:
       doctl spaces create omnijob-backups --region $REGION
       Generate access keys at https://cloud.digitalocean.com/account/api/spaces
       Set DO_SPACES_BUCKET / DO_SPACES_REGION / DO_SPACES_KEY / DO_SPACES_SECRET
       in /etc/systemd/system/omnijob-api.service.d/spaces.conf or .env.
  6. Run the deployment runbook: docs/deployment.md
============================================================
EOF
