#!/usr/bin/env bash
# Print the SHA-256 automation digest: every file under ansible/ and
# policies/, plus ansible.cfg, hashed per file and then over the sorted
# "<sha256>  <relative path>" list. The UI runs this same script to decide
# whether the last successful convergence is current.
set -euo pipefail
ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

find ansible policies ansible.cfg -type f ! -name '.DS_Store' ! -name '._*' -print0 |
  LC_ALL=C sort -z |
  while IFS= read -r -d '' file; do
    printf '%s  %s\n' "$(shasum -a 256 <"${file}" | cut -d' ' -f1)" "${file}"
  done |
  shasum -a 256 | cut -d' ' -f1
