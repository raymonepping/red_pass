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
for f in seal-token platform-token ux/engines-token; do
  [[ -f "${SECRETS_DIR}/${f}" ]] && values["${f}"]="$(tr -d '\n' <"${SECRETS_DIR}/${f}")"
done
for f in seal-init vault-init; do
  json="${SECRETS_DIR}/${f}.json"
  [[ -f "${json}" ]] || continue
  values["${f}-root"]="$(jq -r '.root_token' "${json}")"
  i=0
  while IFS= read -r key; do
    values["${f}-key${i}"]="${key}"
    i=$((i + 1))
  done < <(jq -r '(.keys_base64 // []) + (.keys // []) + (.recovery_keys_base64 // []) + (.recovery_keys // []) | .[]' "${json}")
done

# Identity secrets (prompt 07) live in Vault KV; include them when present.
leader="$(jq -r '.nodes | to_entries[]? | select(.value.role == "leader") | .value.ipv4' "${BUILD_DIR}/ownership.json" 2>/dev/null || true)"
if [[ -n "${leader}" && -f "${SECRETS_DIR}/platform-token" ]]; then
  while IFS=$'\t' read -r key value; do
    [[ -n "${key}" ]] && values["identity-${key}"]="${value}"
  done < <(curl -fsS --cacert "${SECRETS_DIR}/tls/ca.crt" -H "X-Vault-Token: $(<"${SECRETS_DIR}/platform-token")" \
    "https://${leader}:8200/v1/secret/data/red-pass/identity" 2>/dev/null |
    jq -r '.data.data // {} | to_entries[] | "\(.key)\t\(.value)"' || true)
  stats="$(curl -fsS --cacert "${SECRETS_DIR}/tls/ca.crt" -H "X-Vault-Token: $(<"${SECRETS_DIR}/platform-token")" \
    "https://${leader}:8200/v1/secret/data/red-pass/proxy" 2>/dev/null | jq -r '.data.data.stats_password // empty' || true)"
  [[ -n "${stats}" ]] && values["proxy-stats"]="${stats}"
fi

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
