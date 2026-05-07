#!/usr/bin/env bash
# Wrapper around azure.sh that retries the VM-creation step across the
# 5 regions UBC's Azure for Students sub permits. Real-time SKU capacity
# fluctuates; the static catalog (az vm list-skus) doesn't reflect it.
# This actually attempts the deploy and moves on when SkuNotAvailable
# / RequestDisallowedByAzure / NoLongerAvailable strikes.

REGIONS=(${REGIONS:-eastus2 centralus southcentralus westus3 northcentralus})

cd "$(dirname "$0")/../.."

for r in "${REGIONS[@]}"; do
    echo
    echo "============================================================"
    echo "Attempt: LOCATION=$r"
    echo "============================================================"

    # SWA free tier only runs in centralus / eastus2 / westus2 / westeurope /
    # eastasia. Keep SWA pinned to eastus2 regardless of where the VM lands.
    # We capture stdout+stderr so a tee in the pipe doesn't mask azure.sh's
    # exit status (the previous bug — tee always exits 0 and made every
    # capacity failure look like success).
    LOCATION="$r" SWA_LOCATION=eastus2 bash deploy/azure/azure.sh \
        > /tmp/azure-attempt.log 2>&1
    status=$?
    cat /tmp/azure-attempt.log

    if [[ $status -eq 0 ]]; then
        echo
        echo "SUCCESS in $r"
        exit 0
    fi

    if grep -qE "SkuNotAvailable|Capacity Restrictions|NoLongerAvailable" /tmp/azure-attempt.log; then
        echo
        echo "    -> $r is capacity-restricted (status=$status); trying next region."
        continue
    fi

    echo
    echo "Non-capacity error (status=$status); stopping. Inspect /tmp/azure-attempt.log."
    exit 1
done

echo
echo "Tried every allowed region; B2s not available in any of them."
echo "Wait an hour and rerun, OR override with VM_SIZE=Standard_B2ms"
echo "(twice the cost, but bigger memory pool with more capacity)."
exit 1
