#!/usr/bin/env bash
# Run the host console (127.0.0.1:3310, full Multipass control) with Keycloak
# sign-in and role gating. The UI's client secret and session key are read
# from Vault KV into ignored 0600 files under .secrets/ux — never env values.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd curl
require_cmd jq

leader="$(jq -r '.nodes | to_entries[] | select(.value.role == "leader") | .value.ipv4' "${BUILD_DIR}/ownership.json")"
identity="$(jq -r '.nodes | to_entries[] | select(.value.role == "identity") | .value.ipv4' "${BUILD_DIR}/ownership.json")"
proxy="$(jq -r '.nodes | to_entries[] | select(.value.role == "proxy") | .value.ipv4' "${BUILD_DIR}/ownership.json")"
[[ -n "${identity}" ]] || die "No identity node in the lab; use make ui-start."
umask 077
mkdir -p "${SECRETS_DIR}/ux"
secrets="$(curl -fsS --cacert "${SECRETS_DIR}/tls/ca.crt" -H "X-Vault-Token: $(<"${SECRETS_DIR}/platform-token")" \
  "https://${leader}:8200/v1/secret/data/red-pass/identity")"
jq -er '.data.data.ui_client_secret' <<<"${secrets}" >"${SECRETS_DIR}/ux/oidc-client-secret"
jq -er '.data.data.ui_session_password' <<<"${secrets}" >"${SECRETS_DIR}/ux/session-secret"
unset secrets

cd "${ROOT_DIR}/ux"
export PORT=3310 RED_PASS_REPOSITORY_ROOT=..
export RED_PASS_ALLOWED_ORIGINS="http://127.0.0.1:3310"
# Keycloak's issuer is the front door once it exists.
export RED_PASS_OIDC_ISSUER="https://${proxy:-${identity}}:8443/realms/red-pass"
export RED_PASS_OIDC_CLIENT_SECRET_FILE="${SECRETS_DIR}/ux/oidc-client-secret"
export RED_PASS_SESSION_SECRET_FILE="${SECRETS_DIR}/ux/session-secret"
export NODE_EXTRA_CA_CERTS="${SECRETS_DIR}/tls/ca.crt"
exec node scripts/start.mjs
