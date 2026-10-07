#!/usr/bin/env bash
# Install the pinned collections into the ignored project cache.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ansible-env.sh
source "${SCRIPT_DIR}/ansible-env.sh"

require_cmd ansible-galaxy
ansible-galaxy collection install \
  --requirements-file "${ROOT_DIR}/ansible/requirements.yml" \
  --collections-path "${CACHE_DIR}/ansible/collections" </dev/null | grep -v 'Nothing to do' || true
