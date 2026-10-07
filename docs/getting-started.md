# Getting started

From an empty Mac to signing in to Vault through the front door.

## 1. Inputs

```bash
cp .env.example .env
```

Fill in three values (the file is ignored by Git and only parsed, never
sourced):

```text
VAULT_LICENSE=<raw Vault Enterprise licence>
RHSM_ORG=<Red Hat organisation id>
RHSM_ACTIVATION_KEY=<activation key>
```

The RHEL 9.8 ARM64 qcow2 must exist at `/Users/Shared/rhel-9.8-aarch64-kvm.qcow2`
(or set `RED_PASS_IMAGE`). Check tools and syntax:

```bash
make check
```

## 2. Build

```bash
make lab
```

Nine phases run in order and stop at the first failure with the exact resume
command. A clean Mac takes about half an hour (RHSM registration, `dnf`, the
Vault download and Keycloak's first start dominate); a converged lab re-runs in
a few minutes and reports `changed=0`.

What you get, in the order it is built:

1. **provision** — eight VMs (`red-vault-1..3`, `red-vault-s`, `red-agent-1`,
   `red-identity-1`, `red-proxy-1`, `red-ux-1`), a dedicated SSH key and
   pinned host keys, `.build/ownership.json`.
2. **converge** — RHEL registered, firewalld/SELinux/swap/chrony set, the
   read-only probe, Vault installed with TLS and the licence.
3. **bootstrap** — the seal Vault initialised and unsealed, the cluster
   initialised with recovery keys, auto-unsealed, a scoped platform token.
4. **platform** — namespaces `engineering`, `operations` with KV v2, Transit, PKI.
5. **agent** — the seal agent; cluster nodes switched to it one at a time.
6. **proxy** — the HAProxy front door.
7. **identity** — OpenLDAP, Keycloak, Vault OIDC/JWT/LDAP auth and groups.
8. **ux** — the console on red-ux-1.
9. **validate** — every check in [testing.md](testing.md), recorded in
   `.build/validation.json`.

## 3. Trust the lab CA

```bash
make trust          # asks for your password (System keychain)
make trust-status   # "trusted" + "front door … accepted by macOS"
```

Quit Chrome completely (Cmd+Q) and reopen it.

## 4. Sign in

```bash
PROXY=$(jq -r '.nodes["red-proxy-1"].ipv4' .build/ownership.json)
make identity-show-user PERSON=raymon      # lab password, printed on request only
open "https://$PROXY"                      # console
open "https://$PROXY:8200"                 # Vault UI → method OIDC, role default
```

From the CLI:

```bash
export VAULT_ADDR=https://$PROXY:8200 VAULT_CACERT=$PWD/.secrets/tls/ca.crt
vault login -method=ldap username=barend
vault write -namespace=engineering transit/encrypt/red-pass-demo plaintext=$(echo -n hello | base64)
```

## 5. A short tour

- **Fleet** — seal chain: `red-vault-s` → `red-agent-1` → the three nodes, all
  green. Hero tiles: Vault secured 4/4, Raft voters 3/3.
- **Virtual machines** — eight cards, four indicators each. Click any
  indicator: the drawer lists every check behind it, with its source and age.
- **Front door** — six entry points; on the Vault write path the leader is
  green and the other two show *standby*.
- Prove it: `make proxy-failover-test` (the front door follows a new leader),
  `multipass restart red-vault-2` (it unseals itself), `make seal-rotate`
  (a new secret-id for the agent).

## 6. Day to day

| Situation | Command |
| --- | --- |
| Mac slept, something looks off | `make lab` (re-syncs clocks, converges, validates) |
| `red-vault-s` restarted | `make unseal` |
| Changed automation | `make lab` — the console marks VMs *Outdated* until you do |
| Done for now | `multipass stop --all` · later: start, `make unseal` |
| Tear down | `make destroy` (only the eight red_pass VMs) |

More in [operations.md](operations.md).
