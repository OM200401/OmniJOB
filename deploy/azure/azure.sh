#!/usr/bin/env bash
# Idempotent Azure provisioning for OmniJob.
#
# Usage:
#   az login
#   bash deploy/azure/azure.sh
#
# Destroys with:
#   az group delete -n omnijob --yes
#
# Cost shape (after $200 credit):
#   B2s VM        ~$30/mo
#   Static Web App  $0
#   Storage (LRS, <5GB)  $0
#   App Insights (<5GB/mo)  $0
#   Public IP (Basic, dynamic)  ~$0
#   Total  ~$30/mo. Migrate to Hetzner CX22 ($8/mo) when credit ends.

set -euo pipefail

LOCATION="${LOCATION:-eastus}"
RG="${RG:-omnijob}"
VM_NAME="${VM_NAME:-omnijob-vm}"
VM_SIZE="${VM_SIZE:-Standard_B2s}"
ADMIN_USER="${ADMIN_USER:-om}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa.pub}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-omnijobbackups$RANDOM}"
APPINSIGHTS="${APPINSIGHTS:-omnijob-insights}"
GITHUB_REPO="${GITHUB_REPO:-https://github.com/OM200401/OmniJOB}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
TAG="project=omnijob"

echo "==> Resource group $RG in $LOCATION"
az group create -n "$RG" -l "$LOCATION" --tags "$TAG" -o none

echo "==> VM $VM_NAME ($VM_SIZE)"
if ! az vm show -g "$RG" -n "$VM_NAME" -o none 2>/dev/null; then
    az vm create \
        --resource-group "$RG" \
        --name "$VM_NAME" \
        --image Ubuntu2204 \
        --size "$VM_SIZE" \
        --admin-username "$ADMIN_USER" \
        --ssh-key-values "$SSH_KEY_PATH" \
        --custom-data deploy/azure/cloud-init.yaml \
        --public-ip-sku Basic \
        --assign-identity \
        --tags "$TAG" \
        -o none
    echo "    VM created. Cloud-init will run in background (~6-8 min)."
else
    echo "    VM already exists; skipping create."
fi

echo "==> Open ports 80, 443"
az vm open-port -g "$RG" -n "$VM_NAME" --port 80,443 --priority 1001 -o none || true

VM_IP=$(az vm show -d -g "$RG" -n "$VM_NAME" --query publicIps -o tsv)
echo "    VM public IP: $VM_IP"

echo "==> Storage account $STORAGE_ACCOUNT (LRS)"
if ! az storage account show -g "$RG" -n "$STORAGE_ACCOUNT" -o none 2>/dev/null; then
    az storage account create \
        --resource-group "$RG" \
        --name "$STORAGE_ACCOUNT" \
        --location "$LOCATION" \
        --sku Standard_LRS \
        --kind StorageV2 \
        --tags "$TAG" \
        -o none
fi

echo "==> backups container"
az storage container create \
    --account-name "$STORAGE_ACCOUNT" \
    --name backups \
    --auth-mode login \
    -o none || true

echo "==> Grant VM managed identity Storage Blob Data Contributor on the account"
VM_PRINCIPAL_ID=$(az vm show -g "$RG" -n "$VM_NAME" --query identity.principalId -o tsv)
ACCOUNT_ID=$(az storage account show -g "$RG" -n "$STORAGE_ACCOUNT" --query id -o tsv)
az role assignment create \
    --assignee "$VM_PRINCIPAL_ID" \
    --role "Storage Blob Data Contributor" \
    --scope "$ACCOUNT_ID" \
    -o none || echo "    role assignment may already exist; ignoring"

echo "==> Application Insights"
if ! az monitor app-insights component show -g "$RG" -a "$APPINSIGHTS" -o none 2>/dev/null; then
    az monitor app-insights component create \
        --app "$APPINSIGHTS" \
        --location "$LOCATION" \
        --resource-group "$RG" \
        --tags "$TAG" \
        -o none
fi

echo "==> Static Web App (linked to GitHub)"
# Note: this requires you to have a GitHub Personal Access Token loaded
# via `az webapp deployment user set` or to run `az staticwebapp create`
# interactively the first time. The action workflow will then handle
# subsequent deploys on push.
if ! az staticwebapp show -g "$RG" -n omnijob-web -o none 2>/dev/null; then
    az staticwebapp create \
        --name omnijob-web \
        --resource-group "$RG" \
        --location eastus2 \
        --source "$GITHUB_REPO" \
        --branch "$GITHUB_BRANCH" \
        --app-location apps/web \
        --output-location dist \
        --login-with-github \
        --tags "$TAG" \
        -o none
fi

SWA_HOST=$(az staticwebapp show -g "$RG" -n omnijob-web --query defaultHostname -o tsv 2>/dev/null || echo "(provisioning…)")

cat <<EOF

============================================================
OmniJob — Azure provision summary
============================================================
Resource group     : $RG
VM                 : $VM_NAME ($VM_SIZE)
VM public IP       : $VM_IP
Storage account    : $STORAGE_ACCOUNT
App Insights       : $APPINSIGHTS
Static Web App     : https://$SWA_HOST

Next steps:
  1. Buy domain (omnijob.app) and add Cloudflare DNS records:
       A    api.omnijob.app  -> $VM_IP    (proxy: DNS only first run)
       CNAME omnijob.app    -> $SWA_HOST  (proxy: on)
       CNAME www            -> omnijob.app (proxy: on)
  2. SSH to the VM:
       ssh om@$VM_IP
     Tail /var/log/cloud-init-output.log to confirm bootstrap finished.
  3. Once api.omnijob.app resolves to the VM, Caddy will issue TLS
     automatically. Confirm:
       curl -fsS https://api.omnijob.app/health
  4. Add the Static Web App deployment token to GitHub secrets as
     AZURE_STATIC_WEB_APPS_API_TOKEN. CI deploys on every push to main.
  5. Run the deployment runbook: docs/deployment.md
============================================================
EOF
