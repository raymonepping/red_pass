# red_pass — Vault Enterprise on Multipass RHEL, Ansible only

A reproducible local HashiCorp Vault Enterprise lab on Apple Silicon: four
RHEL 9.8 ARM64 Multipass VMs, a three-node Raft cluster that **auto-unseals
through a dedicated seal Vault**, and nothing but **Ansible** doing the work.
No Terraform roots, providers or state anywhere.

It is the Ansible-only successor of [`multi_pass`](../multi_pass), where
Terraform owned the VMs and the Vault platform layer.

```text
make lab
  1 provision   Multipass VMs, dedicated SSH identity, host-key trust, ownership manifest
  2 converge    RHEL (RHSM, firewalld, SELinux, swap), Vault binary, TLS, licence, config
  3 bootstrap   seal Vault → transit token → cluster init → auto-unseal → platform token
  4 platform    Enterprise namespaces + KV v2 / Transit / PKI mounts via the Vault API
  5 agent       seal agent on red-agent-1; cluster switched to it one node at a time
  6 proxy       HAProxy front door on red-proxy-1 (TLS in, verified TLS out)
  7 identity    OpenLDAP + Keycloak → Vault auth/oidc, auth/jwt, auth/ldap + external groups
  8 ux          deploy the console to red-ux-1
  9 validate    read-only readiness contract (people, front door) → .build/validation.json
```

## Topology

| VM | Role | Size | Seal |
| --- | --- | --- | --- |
| `red-vault-s` | seal Vault (single-node Raft) | 1 CPU · 2G · 10G | Shamir, 1 share |
| `red-vault-1` | cluster (initial leader) | 2 CPU · 4G · 20G | transit → `red-vault-s` |
| `red-vault-2` | cluster | 2 CPU · 4G · 20G | transit → `red-vault-s` |
| `red-vault-3` | cluster | 2 CPU · 4G · 20G | transit → `red-vault-s` |
| `red-ux-1` | control-plane UI (observe-only VM mode) | 1 CPU · 2G · 10G | — |
| `red-identity-1` | OpenLDAP + Keycloak (Podman Quadlet) | 2 CPU · 4G · 15G | — |
| `red-proxy-1` | HAProxy front door | 1 CPU · 2G · 10G | — |
| `red-agent-1` | seal agent: Vault Agent (AppRole) + secret-id rotator | 1 CPU · 2G · 10G | — |

The operator only ever unseals `red-vault-s` (one key). The cluster nodes
reach its Transit key through the **seal agent** on `red-agent-1` — an mTLS
API proxy that injects its own AppRole token — so they hold **no seal
credential at all**. See
[docs/architecture.md](docs/architecture.md#the-seal-chain).

## Prerequisites

- Apple Silicon Mac with Multipass ≥ 1.16
- Ansible Core ≥ 2.15 (tested 2.21), `vault`, `jq`, `openssl`, `curl`,
  `shasum`, `ssh-keygen`, `ssh-keyscan`; ShellCheck optional
- RHEL 9.8 ARM64 qcow2 at `/Users/Shared/rhel-9.8-aarch64-kvm.qcow2`
  (override with `RED_PASS_IMAGE`)
- an ignored root `.env` (template: [.env.example](.env.example)):

  ```text
  VAULT_LICENSE=<raw Vault Enterprise licence>
  RHSM_ORG=<Red Hat org id>
  RHSM_ACTIVATION_KEY=<activation key>
  ```

  `scripts/ansible-env.sh` reads **only** these keys (plus two optional
  non-secret overrides), line by line, never sourcing the file and never
  printing values. Ansible reads them with `lookup('env')` in `no_log` tasks.

## First run

```bash
make lab
```

About 5 minutes on a clean host. `provision` first **stops** (never deletes)
multi_pass's `vault-1..3` to free resources; disable with
`./scripts/ansible-run.sh provision -e stop_multi_pass=false`, restart them with `make multi-pass-start`.

Talk to the cluster:

```bash
export VAULT_ADDR=https://$(multipass info red-vault-1 --format json | jq -r '.info["red-vault-1"].ipv4[0]'):8200
export VAULT_CACERT=$PWD/.secrets/tls/ca.crt
export VAULT_TOKEN=$(cat .secrets/platform-token)   # scoped platform-admin token
vault namespace list
```

## Make targets

| Target | Purpose |
| --- | --- |
| `make lab` | Whole phased workflow; stops at the first failed phase and prints the resume command |
| `make provision` / `converge` / `bootstrap` / `platform` / `validate` | One phase (`TAGS=tls make converge` for one role) |
| `make check` | Tools, ShellCheck, playbook syntax, no secret paths tracked |
| `make check-mode` | `--check --diff` over provision → platform; `changed=0` on a converged lab |
| `make platform-check` | Report platform drift without changing anything |
| `make unseal` | Unseal `red-vault-s` (one key); cluster nodes follow automatically |
| `make status` | `vault status` for all four nodes |
| `make ping` | Verified SSH to all four nodes |
| `make digest` | Current automation digest (compared with the last successful run) |
| `make destroy` | Delete + purge **only** the four `red-vault-*` VMs (confirmation) |
| `make rhel-unregister` | Unregister guests from RHSM (`CONFIRM_RHSM_UNREGISTER=yes`) |
| `make multi-pass-start` | Start multi_pass's VMs again |
| `make ux-build` / `ux-deploy` / `ux-sync` | Build the UI bundle / deploy it to red-ux-1 / push fresh evidence |
| `make identity` / `identity-verify` | People: LDAP + Keycloak + Vault auth / prove every login |
| `make identity-show-user PERSON=<uid>` | Print one lab password (explicit, lab only) |
| `make ui-start-auth` | Host console with Keycloak sign-in and role gating |
| `make proxy` / `proxy-failover-test` | Front door on red-proxy-1 / prove leader failover through it |
| `make agent` / `seal-rotate` | Seal agent on red-agent-1 / rotate its secret-id now |

## Secret boundary

| Material | Where it lives | Mode |
| --- | --- | --- |
| Licence, RHSM org + key | `.env` (ignored) → process env only | — |
| SSH identity + known_hosts | `.secrets/ansible/` | 0600 |
| Lab CA + node keys | `.secrets/tls/` | 0600 keys |
| Seal Vault unseal key + root token | `.secrets/seal-init.json` | 0600 |
| Seal agent AppRole | role-ids + rotator secret-id `/etc/vault-agent/approle/`, rotating secret-id `/var/lib/vault-agent/secret-id` (on red-agent-1 only) | 0600/0640 |
| Cluster recovery keys + root token | `.secrets/vault-init.json` | 0600 |
| Platform-admin token | `.secrets/platform-token` | 0600 |

Never passed as `extra_vars`, written to inventory or `.build/`, or printed:
every task that touches one is `no_log: true` and `diff: false`.
`scripts/secret-scan.sh` proves known values are absent from `.build/` (or
any paths you pass) without printing them. `.build/` holds only non-secret
evidence: `ownership.json`, `convergence.json`, `validation.json`.

## Front door

Everything you open in a browser goes through `red-proxy-1`:

| URL | What | Backend |
| --- | --- | --- |
| `https://<proxy>` | red_pass console (Keycloak sign-in) | red-ux-1:3443 |
| `https://<proxy>:8200` | Vault UI + API, all writes | **active node only** (bare `sys/health` = 200) |
| `https://<proxy>:8202` | Vault reads | any unsealed node (`standbyok&perfstandbyok`) |
| `https://<proxy>:8443` | Keycloak (the issuer Vault and the console trust) | red-identity-1:8443 |
| `https://<proxy>:8210` | Seal Vault (operator) | red-vault-s |
| `https://<proxy>:9000/node/<name>/v1/…` | any single Vault node, for diagnosis | that node |
| `https://<proxy>:8404/stats` | HAProxy stats (`stats` / password in Vault KV `secret/red-pass/proxy`) | — |

TLS terminates at the proxy with a lab-CA certificate (SANs: the proxy IP,
`red-proxy-1`, `vault.red-pass.lab`, `ui.red-pass.lab`, `id.red-pass.lab`) and is
re-encrypted to each backend with `verify required` + `verifyhost`. The
console and Keycloak accept connections **only from the proxy**; trust the lab
CA (`.secrets/tls/ca.crt`) in your browser/keychain to avoid warnings.
`make proxy-failover-test` stops Vault on the active node and proves the
front door follows the new leader (≈4 s) while the old node auto-unseals.

## People (identity)

`red-identity-1` runs OpenLDAP (directory, `ldaps://…:636`) and Keycloak
(realm `red-pass`, `https://…:8443`), both as Podman containers under systemd
Quadlet, both pinned by digest and native arm64. Keycloak federates the
directory read-only; LDAP groups reach every client as the `groups` claim.

| Person | Group | Vault policy | Console |
| --- | --- | --- | --- |
| `raymon` | `red-pass-admins` | `red-pass-admin` | everything |
| `barend` | `red-pass-operators` | `red-pass-operator` (engineering KV + Transit) | view, start/restart/stop/suspend |
| `viewer` | `red-pass-viewers` | `red-pass-viewer` (metadata only) | view |

Vault accepts people through `auth/oidc` (browser and `vault login
-method=oidc`), `auth/jwt` (Keycloak tokens presented directly) and
`auth/ldap`; external identity groups per mount carry the policies. Every
identity secret (LDAP admin/readonly, Keycloak admin, client secrets, the
console's session key, each person's password) is generated once by Ansible
into Vault KV `secret/red-pass/identity`. `make identity-show-user PERSON=raymon`
prints one lab password; nothing else ever does.

```bash
make identity          # (re)converge people
make identity-verify   # 11 checks: logins, exact policies, operator encrypt, viewer denied
```

## Control plane UI

Two ways to run the same glass console (fleet, live seal chain, four
evidence-backed indicators per VM):

| Mode | Where | How | Lifecycle actions |
| --- | --- | --- | --- |
| **VM** | `https://<red-proxy-1 ip>` (front door → red-ux-1) | deployed by `make lab` / `make ux-deploy`; Keycloak sign-in required | none — observe-only |
| **Host** | `http://127.0.0.1:3310` | `make ui-start` (open, loopback) or `make ui-start-auth` (Keycloak sign-in) | by role: operator start/restart/stop/suspend, admin also delete/recover/purge |

In VM mode the UI reads the evidence Ansible pushes (`make ux-sync`, also the
last step of `make lab`) and probes each node over SSH with a forced-command
key that can only run the read-only probe, only from red-ux-1. See
[ux/README.md](ux/README.md) and [DESIGN.md](DESIGN.md).

## Recovery and operations

See [docs/operations.md](docs/operations.md): resume points, restarts and the
seal chain, cold start, rotating the seal token, manual failover test,
teardown, and RHSM unregistration.

## License

[GPLv3](LICENSE)
