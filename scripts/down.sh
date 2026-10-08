#!/usr/bin/env bash
# make down — stop (never delete) the red_pass VMs: services first, then the
# cluster, then the seal agent, the seal Vault last. Start again with
# `multipass start …` + `make unseal` (see docs/operations.md).
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd multipass

order=(red-ux-1 red-proxy-1 red-identity-1 red-vault-3 red-vault-2 red-vault-1 red-agent-1 red-vault-s)
known="$(multipass list --format json | jq -r '.list[].name')"
for vm in "${order[@]}"; do
  grep -qx "${vm}" <<<"${known}" || continue
  info "Stopping ${vm}"
  multipass stop "${vm}"
done
info "red_pass VMs stopped (nothing deleted)"
