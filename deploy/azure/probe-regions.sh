#!/usr/bin/env bash
# Probe which Azure regions your subscription is allowed to deploy network
# resources in (the same policy gate that VMs hit).
#
# Run: bash deploy/azure/probe-regions.sh
# Output: ALLOWED / BLOCKED per region.

set +e
RG="${RG:-omnijob}"

# Candidates ordered by privacy preference (Canadian / EU first, then US).
REGIONS=(
    canadacentral canadaeast
    westus2 westus3 centralus eastus eastus2 westus southcentralus northcentralus westcentralus
    northeurope westeurope uksouth ukwest
    francecentral germanywestcentral switzerlandnorth swedencentral
    eastasia southeastasia japaneast australiaeast
)

echo "Probing $RG for allowed VNET regions..."
echo

for r in "${REGIONS[@]}"; do
    printf "%-22s " "$r"
    err=$(az network vnet create -g "$RG" -n "probe-$r" -l "$r" \
        --address-prefix 10.0.0.0/24 --subnet-name s --subnet-prefix 10.0.0.0/28 \
        -o none 2>&1)
    if [[ $? -eq 0 ]]; then
        echo "ALLOWED"
        # Clean up immediately so we don't leak network resources.
        az network vnet delete -g "$RG" -n "probe-$r" --no-wait -o none 2>/dev/null
    else
        if echo "$err" | grep -qi "RequestDisallowedByAzure\|disallowed by Azure"; then
            echo "BLOCKED (policy)"
        else
            echo "OTHER ERROR: $(echo "$err" | head -1)"
        fi
    fi
done
