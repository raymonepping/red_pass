#!/usr/bin/env bash
# Check that known secret values do not appear in the given files (or
# .build/ by default). Prints only file names and value labels, never values.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ansible-env.sh
source "${SCRIPT_DIR}/ansible-env.sh"

declare -A values=()
[[ -n "${VAULT_LICENSE:-}" ]] && values[license]="${VAULT_LICENSE:0:64}"
[[ -n "${RHSM_ORG:-}" ]] && values[rhsm_org]="${RHSM_ORG}"
[[ -n "${RHSM_ACTIVATION_KEY:-}" ]] && values[rhsm_key]="${RHSM_ACTIVATION_KEY}"
for f in seal-token platform-token; do
  [[ -f "${SECRETS_DIR}/${f}" ]] && values[${f}]="$(tr -d '\n' <"${SECRETS_DIR}/${f}")"
done
for f in seal-init vault-init; do
  json="${SECRETS_DIR}/${f}.json"
  [[ -f "${json}" ]] || continue
  values[${f}-root]="$(jq -r '.root_token' "${json}")"
  i=0
  while IFS= read -r key; do
    values[${f}-key${i}]="${key}"
    i=$((i + 1))
  done < <(jq -r '(.keys_base64 // []) + (.keys // []) + (.recovery_keys_base64 // []) + (.recovery_keys // []) | .[]' "${json}")
done

targets=("$@")
[[ ${#targets[@]} -gt 0 ]] || targets=("${BUILD_DIR}")
hits=0
for label in "${!values[@]}"; do
  value="${values[$label]}"
  [[ ${#value} -ge 8 ]] || continue
  if files="$(grep -rlF -- "${value}" "${targets[@]}" 2>/dev/null)"; then
    printf 'LEAK: %s found in %s\n' "${label}" "${files//$'\n'/, }" >&2
    hits=$((hits + 1))
  fi
done
[[ ${hits} -eq 0 ]] || die "${hits} secret value(s) found."
info "No known secret values in: ${targets[*]} (${#values[@]} values checked)"
