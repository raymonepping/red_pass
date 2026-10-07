#!/usr/bin/env bash
# Unauthenticated `vault status` for each red_pass node over verified TLS.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd vault
require_cmd jq

export VAULT_CACERT="${SECRETS_DIR}/tls/ca.crt"
multipass list --format json |
  jq -r '.list[] | select(.name | test("^red-vault-(1|2|3|s)$")) | "\(.name) \(.state) \(.ipv4[0] // "")"' |
  sort | while read -r name state ip; do
  printf '\n\033[1m%s\033[0m (%s %s)\n' "${name}" "${state}" "${ip}"
  [[ -n "${ip}" ]] || continue
  VAULT_ADDR="https://${ip}:8200" vault status -format=json 2>/dev/null |
    jq -r '"  type=\(.type) initialized=\(.initialized) sealed=\(.sealed) ha=\(.ha_enabled) mode=\(if .is_self then "active" else "standby" end) version=\(.version)"' ||
    echo "  unreachable"
done
