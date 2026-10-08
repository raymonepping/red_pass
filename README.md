# red_pass — Vault Enterprise on Multipass RHEL, Ansible only

A reproducible HashiCorp Vault Enterprise lab on an Apple Silicon Mac: **eight
RHEL 9.8 ARM64 VMs** under Multipass, built, configured, bootstrapped and
proven by **Ansible alone** — no Terraform roots, providers or state anywhere.

- a three-node Raft cluster that **auto-unseals through a seal chain**
  (seal Vault → seal agent → nodes) — the nodes hold no seal credential;
- **people**: OpenLDAP + Keycloak, signing in to Vault (OIDC, JWT, LDAP) and to
  the console, each getting exactly their group's policy;
- one **front door** (HAProxy) for every URL, TLS re-encrypted and verified to
  each backend, following the active Vault node on failover;
- a **control-plane console** in Vault daylight glass that shows four
  evidence-backed indicators per VM.

It is the Ansible-only successor of [`multi_pass`](../multi_pass), where
Terraform owned the VMs and the Vault platform layer.

```text
make lab
  1 provision   Multipass VMs, dedicated SSH identity, host-key trust, ownership manifest
  2 converge    RHEL (RHSM, firewalld, SELinux, swap, chrony), probe, Vault binary, TLS, licence, config
  3 bootstrap   seal Vault → cluster init (recovery keys) → auto-unseal → platform token
  4 platform    Enterprise namespaces + KV v2 / Transit / PKI mounts via the Vault API
  5 agent       seal agent on red-agent-1; cluster switched to it one node at a time
  6 proxy       HAProxy front door on red-proxy-1 (TLS in, verified TLS out)
  7 identity    OpenLDAP + Keycloak → Vault auth/oidc, auth/jwt, auth/ldap + external groups
  8 ux          deploy the console to red-ux-1
  9 engines     self-contained secrets engines in namespace engines + the console's read-only token
 10 validate    read-only readiness contract (cluster, seal chain, people, front door)
```

## Topology

| VM | Role | Size | Notes |
| --- | --- | --- | --- |
| `red-vault-1..3` | Vault Enterprise cluster (Raft ×3) | 2 CPU · 4G · 20G | `seal "transit"` through the seal agent, recovery keys 3/2 |
| `red-vault-s` | seal Vault (single-node Raft) | 1 CPU · 2G · 10G | Shamir 1/1, Transit key `autounseal`, AppRole |
| `red-agent-1` | seal agent | 1 CPU · 2G · 10G | Vault Agent (AppRole), mTLS API proxy :8100, secret-id rotator |
| `red-identity-1` | people | 2 CPU · 4G · 15G | OpenLDAP + Keycloak (Podman Quadlet, host networking) |
| `red-proxy-1` | front door | 1 CPU · 2G · 10G | HAProxy |
| `red-ux-1` | console | 1 CPU · 2G · 10G | Nuxt, observe-only VM mode, Keycloak sign-in |

```text
                        you (browser / CLI)
                               │  TLS (lab CA)
                         red-proxy-1  ── :443 console · :8200 Vault · :8443 Keycloak · :9000 /node/…
          ┌────────────────────┼─────────────────────┬─────────────────┐
     red-vault-1..3       red-vault-s          red-identity-1       red-ux-1
          │  mTLS, no token     ▲                     │ ldaps
          └──► red-agent-1 ─────┘ AppRole        Vault auth/ldap
```

Details: [docs/architecture.md](docs/architecture.md).

## Quick start

```bash
cp .env.example .env        # VAULT_LICENSE, RHSM_ORG, RHSM_ACTIVATION_KEY
make lab                    # ≈ 30 min on a clean Mac, ≈ 3 min when converged
make trust                  # trust the lab CA in the macOS keychain (sudo), then restart Chrome
open https://$(jq -r '.nodes["red-proxy-1"].ipv4' .build/ownership.json)
make identity-show-user PERSON=raymon   # a lab password
```

Step by step, including a tour of the console: [docs/getting-started.md](docs/getting-started.md).

## Prerequisites

- Apple Silicon Mac with Multipass ≥ 1.16, ≈ 22 GB free RAM for the eight VMs
- Ansible Core ≥ 2.15 (tested 2.21), Node.js ≥ 22 (console build), `vault`,
  `jq`, `openssl`, `curl`, `shasum`, `ssh-keygen`, `ssh-keyscan`; ShellCheck optional
- RHEL 9.8 ARM64 qcow2 at `/Users/Shared/rhel-9.8-aarch64-kvm.qcow2`
  (override with `RED_PASS_IMAGE`)
- a Vault Enterprise licence and a Red Hat activation key in the ignored `.env`.
  `scripts/ansible-env.sh` reads **only** those keys, line by line, never
  sourcing the file and never printing values.

`provision` **stops** (never deletes) multi_pass's `vault-1..3` to free memory;
`make multi-pass-start` brings them back.

## Front door

| URL | What | Backend |
| --- | --- | --- |
| `https://<proxy>` | red_pass console (Keycloak sign-in) | red-ux-1:3443 |
| `https://<proxy>:8200` | Vault UI + API, all writes | **active node only** |
| `https://<proxy>:8202` | Vault reads | any unsealed node |
| `https://<proxy>:8443` | Keycloak — the issuer Vault and the console trust | red-identity-1 |
| `https://<proxy>:8210` | seal Vault (operator) | red-vault-s |
| `https://<proxy>:9000/node/<name>/v1/…` | one specific Vault node | that node |
| `https://<proxy>:8404/stats` | HAProxy stats (password in Vault KV `secret/red-pass/proxy`) | — |

The console and Keycloak accept connections only from the proxy. Every
certificate carries IP SANs and stays under Apple's 825-day limit, so after
`make trust` Chrome accepts the IP URLs without `/etc/hosts` entries.
`make proxy-failover-test` stops Vault on the active node and proves the
front door follows the new leader (≈ 4 s).

## People

| Person | Group | Vault policy | Console |
| --- | --- | --- | --- |
| `raymon` | `red-pass-admins` | `red-pass-admin` | everything |
| `barend` | `red-pass-operators` | `red-pass-operator` (engineering KV + Transit) | view + start/restart/stop/suspend (host mode) |
| `viewer` | `red-pass-viewers` | `red-pass-viewer` (metadata only) | view |

Sign in to the Vault UI with method **OIDC**, to the console with "Continue with
Keycloak", or with `vault login -method=ldap username=barend`. Passwords and all
other identity secrets are generated once into Vault KV. Details:
[docs/identity.md](docs/identity.md).

## Console

| Mode | Where | Lifecycle actions |
| --- | --- | --- |
| **VM** (default) | `https://<proxy>` → red-ux-1 | none — observe-only, sign-in required |
| **Host** | `http://127.0.0.1:3310` via `make ui-start` (open) or `make ui-start-auth` (Keycloak) | by role, through Multipass |

Pages: **Fleet** (hero tiles, the three-hop seal chain), **Engines** (every
secrets engine Vault reports in namespace `engines`, read live), **Virtual machines**
(four indicators per VM — Provisioned · RHEL healthy · Ansible converged ·
Vault secured / Service), **Front door** (entry points with live backends), a
detail page per VM, and the sign-in page. The sidebar carries the indicator
key. See [ux/README.md](ux/README.md) and [DESIGN.md](DESIGN.md).

## Make targets

| Target | Purpose |
| --- | --- |
| `make lab` | Whole phased workflow; stops at the first failed phase and prints the resume command |
| `make provision` · `converge` · `bootstrap` · `platform` · `agent` · `proxy` · `identity` · `ux-deploy` · `validate` | One phase (`TAGS=tls make converge` for one role) |
| `make check` | Tools, ShellCheck, playbook syntax, no secret paths tracked |
| `make check-mode` | `--check --diff` over provision → platform; `changed=0` on a converged lab |
| `make platform-check` | Report Vault platform drift without changing anything |
| `make engines` · `engines-check` | Mount the self-contained secrets engines (KV, Transit, PKI, SSH, TOTP, Transform, KMIP, Key Management, SPIFFE) · report what would be mounted |
| `make status` · `ping` · `digest` | `vault status` of the four Vault nodes · verified SSH to all eight · automation digest |
| `make unseal` | Unseal `red-vault-s` (one key); everything else follows |
| `make seal-rotate` | Rotate the seal agent's secret-id now (normally every 6 h) |
| `make identity-verify` | 11 people checks: logins, exact policies, operator encrypt, viewer denied |
| `make identity-show-user PERSON=<uid>` | Print one lab password (explicit, lab only) |
| `make proxy-failover-test` | Prove the front door follows a new Vault leader |
| `make trust` · `untrust` · `trust-status` | Lab CA in the macOS keychain for Chrome/Safari |
| `make ui-check` · `ui-a11y` · `ui-start` · `ui-start-auth` | Console: checks, axe scan, host mode |
| `make ux-build` · `ux-sync` | Console bundle for red-ux-1 · push fresh evidence |
| `make destroy` | Delete + purge **only** the eight red_pass VMs (confirmation) |
| `make rhel-unregister` | Unregister guests from RHSM (`CONFIRM_RHSM_UNREGISTER=yes`) |
| `make multi-pass-start` | Start multi_pass's VMs again |

## Secret boundary

Nothing secret is in Git, `.build/`, inventory, `extra_vars`, logs or the
browser. Controller secrets live in `.secrets/` (0700/0600); service secrets in
Vault KV; every task that handles one is `no_log` + `diff: false`;
`scripts/secret-scan.sh` proves known values are absent without printing them.
The full inventory — which credential lives where, who can reach which port —
is in [docs/security-model.md](docs/security-model.md).

## Documentation

| Document | For |
| --- | --- |
| [docs/getting-started.md](docs/getting-started.md) | zero to a running lab, first sign-in, a guided tour |
| [docs/architecture.md](docs/architecture.md) | ownership, playbooks and roles, seal chain, front door, identity, evidence |
| [docs/security-model.md](docs/security-model.md) | credentials, trust boundaries, firewall matrix |
| [docs/identity.md](docs/identity.md) | people, sign-in flows, adding a person |
| [docs/operations.md](docs/operations.md) | resume points, restarts, cold start, rotation, failover, teardown |
| [docs/testing.md](docs/testing.md) | every gate and what it proves |
| [docs/lessons-learned.md](docs/lessons-learned.md) | the traps found building it |
| [DESIGN.md](DESIGN.md) · [ux/README.md](ux/README.md) | console design system and modes |

## License

[GPLv3](LICENSE)
