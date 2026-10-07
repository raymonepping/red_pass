# Security model

red_pass is a lab, but it is built so that the secrets platform does not leak
secrets while it is being built, and so that every component holds only the
credential it needs.

## Principles

1. **No secret in Git, `.build/`, inventory, `extra_vars`, logs or the browser.**
   Every task that touches one is `no_log: true` and `diff: false`;
   `scripts/secret-scan.sh` compares known values against output without
   printing them.
2. **Least credential per component.** Cluster nodes hold no seal credential;
   the console holds a probe key that can only run one read-only script; the
   platform token cannot rewrite its own policy.
3. **Generated secrets live in Vault.** Identity and proxy secrets are minted
   by Ansible once, stored in Vault KV, and read back on every run.
4. **Verified TLS everywhere.** One lab CA; every hop (browser → proxy → backend,
   node → agent → seal Vault, Vault → Keycloak, Vault → LDAPS) verifies the
   peer's name. No `-k`, no `tls_skip_verify`.
5. **Fail closed.** The console in VM mode refuses every API call without a
   session; the seal guard waits instead of starting unsealed; a changed SSH
   host key stops the run.

## Where each credential lives

| Credential | Location | Who can use it | Lifetime |
| --- | --- | --- | --- |
| Vault licence, RHSM org/key | `.env` → process env | Ansible (no_log) | operator-managed |
| Controller SSH key + known_hosts | `.secrets/ansible/` | Ansible | permanent |
| Lab CA key, node keys | `.secrets/tls/` (0600); each node only its own key | Ansible / that node | CA 10 y, nodes ≤ 825 d |
| Seal Vault unseal key + root token | `.secrets/seal-init.json` | operator, `make unseal` | permanent (break glass) |
| Cluster recovery keys + root token | `.secrets/vault-init.json` | operator only (never for unsealing) | permanent (break glass) |
| Platform token (policy `red-pass-platform-admin`) | `.secrets/platform-token` | Ansible platform/identity phases | periodic 24 h, renewed |
| Seal agent AppRole secret-id | red-agent-1 `/var/lib/vault-agent/secret-id` | Vault Agent, from its own IP only | 24 h, rotated every 6 h |
| Seal rotator AppRole secret-id | red-agent-1 `/etc/vault-agent/approle/` | rotator, from its own IP only, may only mint/destroy agent secret-ids | no TTL (CIDR-bound anchor) |
| Agent's Vault token (policy `autounseal`) | agent memory only | injected into proxied calls | 1 h, max 24 h |
| LDAP admin/readonly, Keycloak admin, OIDC client secrets, console session key, people's passwords | Vault KV `secret/red-pass/identity`; on red-identity-1 as Podman secrets; on red-ux-1 as `redux` 0600 files | the service that needs it | generated once |
| HAProxy stats password | Vault KV `secret/red-pass/proxy`; sha512-crypt hash in `haproxy.cfg` | operator | generated once |
| Console probe key | `.secrets/ux/`; red-ux-1 `redux` 0600 | `ssh redprobe@node` → forced read-only probe | permanent |

## Trust boundaries and the firewall

| VM | Port | Open to |
| --- | --- | --- |
| red-proxy-1 | 443 · 8200 · 8202 · 8210 · 8443 · 9000 · 8404 | everyone (the front door) |
| red-vault-1..3, red-vault-s | 8200 · 8201 | cluster peers, proxy, controller |
| red-agent-1 | 8100 | **only red-vault-1..3**, and only with a lab-CA client certificate |
| red-agent-1 | 8101 (metrics) | loopback |
| red-identity-1 | 8443 (Keycloak) | **only the proxy** |
| red-identity-1 | 636 (LDAPS) | **only red-vault-1..3** |
| red-identity-1 | 389, 9000 | loopback |
| red-ux-1 | 3443 | **only the proxy** |
| all | 22 | SSH (dedicated key, pinned host keys); `redprobe` only from red-ux-1 |

The identity containers use host networking on purpose: Podman's published
ports are DNAT'd past firewalld and would have ignored these rules.
`make validate` proves the restrictions from outside (direct access to 3443,
8443 and 8100 must time out).

## Authorisation

| Identity | Policy | Can |
| --- | --- | --- |
| `red-pass-admins` (raymon) | `red-pass-admin` | everything (lab) |
| `red-pass-operators` (barend) | `red-pass-operator` | engineering KV read/write, Transit encrypt/decrypt |
| `red-pass-viewers` (viewer) | `red-pass-viewer` | list mounts and metadata |
| platform token | `red-pass-platform-admin` | namespaces, mounts, auth methods, the three person policies by exact name, external groups, `secret/red-pass/*` |
| seal agent | `autounseal` | encrypt/decrypt with `transit/keys/autounseal` |
| seal rotator | `seal-rotator` | mint/list/destroy the agent's secret-ids |

The console enforces the same split for lifecycle actions in host mode
(viewer: none, operator: start/restart/stop/suspend, admin: also trash,
recover, purge) on the server; the browser only hides what the server would
refuse anyway.

## Known lab compromises

- `red-pass-admin` is `path "*"` — fine for a demo estate, not a model for production.
- `red-pass-cli` (Keycloak password grant) exists for the automated identity
  checks; remove it outside a lab.
- Keycloak runs with `--db=dev-file`; the seal Vault and cluster use Raft on the VM disk.
- The break-glass files in `.secrets/` are plain files on the Mac; back them up
  and protect the Mac accordingly.
