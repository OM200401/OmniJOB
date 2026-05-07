#!/usr/bin/env bash
# Probe B2s SKU availability across the regions UBC's policy allows.
# B2s capacity fluctuates by region; this finds where to deploy *today*.

set +e
REGIONS=(westus3 centralus eastus2 southcentralus northcentralus)

echo "Probing Standard_B2s availability across allowed regions..."
echo

for r in "${REGIONS[@]}"; do
    printf "%-22s " "$r"
    # SKU listing returns a Restrictions array. Empty = available.
    restr=$(az vm list-skus -l "$r" --size Standard_B2s \
        --query "[?name=='Standard_B2s'].restrictions[].reasonCode" -o tsv 2>/dev/null)
    if [[ -z "$restr" ]]; then
        echo "AVAILABLE"
    else
        echo "RESTRICTED: $restr"
    fi
done
