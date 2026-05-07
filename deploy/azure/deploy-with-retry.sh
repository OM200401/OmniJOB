#!/usr/bin/env bash
# Wrapper around azure.sh that retries the VM-creation step across the
# 5 regions UBC's Azure for Students sub permits. Real-time SKU capacity
# fluctuates; the static catalog (az vm list-skus) doesn't reflect it.
# This actually attempts the deploy and moves on when SkuNotAvailable
# / RequestDisallowedByAzure / NoLongerAvailable strikes.

# Ensure `az` is on PATH so child azure.sh processes inherit it. Same fix
# as in azure.sh; duplicated here so this wrapper can be run standalone.
if ! command -v az >/dev/null 2>&1; then
    AZ_DIR="/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin"
    if [[ -x "$AZ_DIR/az" ]] || [[ -f "$AZ_DIR/az.cmd" ]]; then
        export PATH="$AZ_DIR:$PATH"
    fi
fi

REGIONS=(${REGIONS:-eastus2 centralus southcentralus westus3 northcentralus})

# Try SKUs in order of preference. Same-or-better-than-B2s, and grouped by
# the type of capacity pool they draw from:
#   B2s            : Intel 2vCPU 4GB ($30/mo) - the original target
#   Standard_B2als_v2 : AMD 2vCPU 8GB ($30/mo) - same price, AMD pool
#   Standard_B2pls_v2 : ARM 2vCPU 4GB ($21/mo) - cheapest, ARM pool
#   Standard_B2ms  : Intel 2vCPU 8GB ($61/mo) - fallback if everything else
#                     fails. Burns the $100 credit in ~6 weeks instead of
#                     ~3 months, but capacity tier is bigger.
SIZES=(${SIZES:-Standard_B2s Standard_B2als_v2 Standard_B2pls_v2 Standard_B2ms})

cd "$(dirname "$0")/../.."

for size in "${SIZES[@]}"; do
    for r in "${REGIONS[@]}"; do
        echo
        echo "============================================================"
        echo "Attempt: VM_SIZE=$size LOCATION=$r"
        echo "============================================================"

        # SWA free tier only runs in centralus / eastus2 / westus2 / westeurope /
        # eastasia. Keep SWA pinned to eastus2 regardless of where the VM lands.
        VM_SIZE="$size" LOCATION="$r" SWA_LOCATION=eastus2 \
            bash deploy/azure/azure.sh > /tmp/azure-attempt.log 2>&1
        status=$?
        cat /tmp/azure-attempt.log

        if [[ $status -eq 0 ]]; then
            echo
            echo "SUCCESS: VM_SIZE=$size LOCATION=$r"
            exit 0
        fi

        if grep -qE "SkuNotAvailable|Capacity Restrictions|NoLongerAvailable" /tmp/azure-attempt.log; then
            echo
            echo "    -> $size in $r is capacity-restricted; trying next combination."
            continue
        fi

        echo
        echo "Non-capacity error (status=$status); stopping. Inspect /tmp/azure-attempt.log."
        exit 1
    done
    echo
    echo "  -> $size unavailable in every allowed region; trying next SKU class."
done

echo
echo "Tried every allowed region; B2s not available in any of them."
echo "Wait an hour and rerun, OR override with VM_SIZE=Standard_B2ms"
echo "(twice the cost, but bigger memory pool with more capacity)."
exit 1
