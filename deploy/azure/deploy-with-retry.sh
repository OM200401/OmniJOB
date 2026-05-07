#!/usr/bin/env bash
# Wrapper around azure.sh that retries the VM-creation step across the
# 5 regions UBC's Azure for Students sub permits. Real-time SKU capacity
# fluctuates; the static catalog (az vm list-skus) doesn't reflect it.
# This actually attempts the deploy and moves on when SkuNotAvailable
# / RequestDisallowedByAzure / NoLongerAvailable strikes.

set -e
REGIONS=(${REGIONS:-eastus2 centralus southcentralus westus3 northcentralus})

cd "$(dirname "$0")/../.."

for r in "${REGIONS[@]}"; do
    echo
    echo "============================================================"
    echo "Attempt: LOCATION=$r"
    echo "============================================================"

    # Run azure.sh with stderr captured so we can detect transient capacity
    # errors and retry the next region. Other errors stop the loop.
    # SWA free tier only runs in centralus / eastus2 / westus2 / westeurope /
    # eastasia. Keep SWA pinned to eastus2 regardless of where the VM lands.
    if LOCATION="$r" SWA_LOCATION=eastus2 bash deploy/azure/azure.sh 2>&1 | tee /tmp/azure-attempt.log; then
        echo
        echo "SUCCESS in $r"
        exit 0
    fi

    if grep -qE "SkuNotAvailable|Capacity Restrictions|NoLongerAvailable" /tmp/azure-attempt.log; then
        echo
        echo "    -> $r is capacity-restricted; trying next region."
        continue
    fi

    echo
    echo "Non-capacity error; stopping. Inspect /tmp/azure-attempt.log."
    exit 1
done

echo
echo "Tried every allowed region; B2s not available in any of them."
echo "Wait an hour and rerun, OR override with VM_SIZE=Standard_B2ms"
echo "(twice the cost, but bigger memory pool with more capacity)."
exit 1
