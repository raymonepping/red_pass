#!/usr/bin/env bash
# Export the controller environment for ansible-playbook.
#
# Reads ONLY the allow-listed keys from the ignored root .env. The file is
# parsed line by line — never sourced or evaluated — and values are never
# printed. Values already present in the caller's environment win.
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

ENV_FILE="${RED_PASS_ENV_FILE:-${ROOT_DIR}/.env}"
ALLOWED_KEYS=(VAULT_LICENSE RHSM_ORG RHSM_ACTIVATION_KEY RHEL_DNS_SERVERS RED_PASS_IMAGE)

load_env_file() {
  local line key value allowed
  [[ -f "${ENV_FILE}" ]] || return 0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ "${line}" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "${line}" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    for allowed in "${ALLOWED_KEYS[@]}"; do
      [[ "${key}" == "${allowed}" ]] || continue
      # Strip one pair of surrounding quotes, if present.
      if [[ "${value}" =~ ^\"(.*)\"$ || "${value}" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      if [[ -z "${!key:-}" ]]; then
        export "${key}=${value}"
      fi
    done
  done <"${ENV_FILE}"
}

prepare_local_dirs
load_env_file

export ANSIBLE_CONFIG="${ROOT_DIR}/ansible.cfg"
export ANSIBLE_LOCAL_TEMP="${CACHE_DIR}/ansible/tmp"
export ANSIBLE_COLLECTIONS_PATH="${CACHE_DIR}/ansible/collections"
export ANSIBLE_GALAXY_TOKEN_PATH="${CACHE_DIR}/ansible/galaxy_token"
