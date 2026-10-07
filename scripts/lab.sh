#!/usr/bin/env bash
# make lab — the complete, phased, fail-closed workflow. Each phase is an
# independent playbook; on failure the exact resume target is printed.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

PHASES=(provision converge bootstrap platform validate)
STAMP="${BUILD_DIR}/convergence.json"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Digest of the automation as it is when the run starts.
digest="$("${SCRIPT_DIR}/automation-digest.sh")"

phase() { printf '\n\033[1;7m %s \033[0m %s\n\n' "$1" "$2" >&2; }

"${SCRIPT_DIR}/ansible-deps.sh" >/dev/null
"${SCRIPT_DIR}/check.sh"

for index in "${!PHASES[@]}"; do
  name="${PHASES[$index]}"
  phase "$((index + 1))/${#PHASES[@]}" "${name}"
  if ! "${SCRIPT_DIR}/ansible-run.sh" "${name}"; then
    printf '\n\033[31mPhase %s failed.\033[0m Fix the reported error, then resume with:\n  make %s && make lab\n' \
      "${name}" "${name}" >&2
    exit 1
  fi
done

umask 022
jq -n \
  --arg playbook "scripts/lab.sh" \
  --arg started "${started_at}" \
  --arg finished "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg digest "${digest}" \
  --argjson phases "$(printf '%s\n' "${PHASES[@]}" | jq -R . | jq -s .)" \
  --argjson nodes "$(jq '.nodes | keys' "${BUILD_DIR}/ownership.json")" \
  '{result: "success", playbook: $playbook, phases: $phases, started_at: $started,
    finished_at: $finished, automation_digest: $digest, nodes: $nodes}' >"${STAMP}.tmp"
mv "${STAMP}.tmp" "${STAMP}"
phase "done" "red_pass lab converged — digest ${digest:0:12}, evidence in .build/"
