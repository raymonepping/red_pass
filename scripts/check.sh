#!/usr/bin/env bash
# Static checks: tools, shell syntax, playbook syntax, secret paths in Git.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ansible-env.sh
source "${SCRIPT_DIR}/ansible-env.sh"

for cmd in multipass ansible-playbook ansible-galaxy ssh-keygen ssh-keyscan curl jq openssl vault shasum; do
  require_cmd "${cmd}"
done
info "Controller tools present"

for script in "${ROOT_DIR}"/scripts/*.sh; do
  bash -n "${script}"
done
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x --source-path="${ROOT_DIR}/scripts" "${ROOT_DIR}"/scripts/*.sh
  info "ShellCheck clean"
else
  info "ShellCheck not installed; bash -n only"
fi

# Playbooks that target discovered hosts parse fine with an empty inventory.
for playbook in "${ROOT_DIR}"/ansible/*.yml; do
  [[ "$(basename "${playbook}")" == "requirements.yml" ]] && continue
  ansible-playbook --syntax-check "${playbook}" </dev/null >/dev/null
done
info "Playbook syntax valid"

if command -v ansible-lint >/dev/null 2>&1; then
  (cd "${ROOT_DIR}" && ansible-lint ansible </dev/null)
  info "ansible-lint clean"
fi

if git -C "${ROOT_DIR}" ls-files --cached --others --exclude-standard |
  grep -E '(^|/)(\.env$|\.secrets/|\.build/|\.cache/)|\.(key|hclic|pem)$|vault-init\.json|seal-init\.json|platform-token|seal-token'; then
  die "Sensitive or generated paths would be committed (listed above)."
fi
info "No sensitive or generated paths tracked"
