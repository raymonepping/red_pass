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
  5 validate    read-only readiness contract → .build/validation.json
```

## Topology

| VM | Role | Size | Seal |
| --- | --- | --- | --- |
| `red-vault-s` | seal Vault (single-node Raft) | 1 CPU · 2G · 10G | Shamir, 1 share |
| `red-vault-1` | cluster (initial leader) | 2 CPU · 4G · 20G | transit → `red-vault-s` |
| `red-vault-2` | cluster | 2 CPU · 4G · 20G | transit → `red-vault-s` |
| `red-vault-3` | cluster | 2 CPU · 4G · 20G | transit → `red-vault-s` |

The operator only ever unseals `red-vault-s` (one key). The cluster nodes hold
a periodic, narrowly scoped Transit token and unseal themselves. See
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

## Secret boundary

| Material | Where it lives | Mode |
| --- | --- | --- |
| Licence, RHSM org + key | `.env` (ignored) → process env only | — |
| SSH identity + known_hosts | `.secrets/ansible/` | 0600 |
| Lab CA + node keys | `.secrets/tls/` | 0600 keys |
| Seal Vault unseal key + root token | `.secrets/seal-init.json` | 0600 |
| Transit seal token | `.secrets/seal-token`; on nodes `/etc/vault.d/seal.env` (root 0600) | 0600 |
| Cluster recovery keys + root token | `.secrets/vault-init.json` | 0600 |
| Platform-admin token | `.secrets/platform-token` | 0600 |

Never passed as `extra_vars`, written to inventory or `.build/`, or printed:
every task that touches one is `no_log: true` and `diff: false`.
`scripts/secret-scan.sh` proves known values are absent from `.build/` (or
any paths you pass) without printing them. `.build/` holds only non-secret
evidence: `ownership.json`, `convergence.json`, `validation.json`.

## Recovery and operations

See [docs/operations.md](docs/operations.md): resume points, restarts and the
seal chain, cold start, rotating the seal token, manual failover test,
teardown, and RHSM unregistration.

## License

[GPLv3](LICENSE)
