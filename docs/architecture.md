# Architecture

red_pass rebuilds the multi_pass lab with a single automation engine. Every
responsibility Terraform held in multi_pass has an Ansible owner here, and the
lab grew around it: a seal agent, people (OpenLDAP + Keycloak), a front door
(HAProxy) and a console — eight RHEL VMs in all.

## Ownership: multi_pass → red_pass

| Domain | multi_pass | red_pass |
| --- | --- | --- |
| VM lifecycle | Terraform `todoroff/multipass` | `multipass_vm` role on localhost, driving the Multipass CLI with fixed argv |
| Topology / inventory | Terraform outputs → `extra_vars` | `lab_inventory` role: `multipass list --format json` → `add_host`, filtered by a hard allow-list |
| Ownership evidence | Terraform state | `.build/ownership.json`, written by `provision.yml` |
| Guest OS + Vault | Ansible, triggered by Terraform | Ansible |
| Unseal | Shamir 3/2, operator keys per node | Transit auto-unseal: `red-vault-s` (Shamir 1/1) → seal agent on `red-agent-1` → nodes (no credential on the nodes) |
| People | — | `identity_*` roles: OpenLDAP + Keycloak, Vault oidc/jwt/ldap, external groups |
| Entry point | node addresses | `edge_proxy` role: HAProxy front door on `red-proxy-1` |
| Console | host-only Nuxt app | `ux_app` role: observe-only console on `red-ux-1` (+ host mode) |
| Namespaces + mounts | Terraform Vault provider | `vault_platform` role via the Vault HTTP API |
| Secrets engines showcase | — | `vault_engines` role (namespace `engines`), shown live by the console with its own read-only token (`ux_engines_token`) |
| Drift detection | `terraform plan` | `make check-mode` / `make platform-check` (`changed=0` = no drift) |
| "Last converged" | `terraform/ansible` `automation_digest` output | `.build/convergence.json` + `scripts/automation-digest.sh` |

Why no Terraform: in this lab both Terraform layers were thin wrappers around
things Ansible already had to know (VM IPs for SSH, a token for the Vault
API). Removing them removes two state files that had to be kept secret-free,
the provider/first-apply timing problem documented in multi_pass, and the
three-root phase boundary. The cost is that drift detection is check-mode
based and only covers what the roles declare; there is no state graph.

## Playbooks and roles

```mermaid
flowchart LR
  subgraph controller["Controller (localhost)"]
    env[".env → scripts/ansible-env.sh"]
    prov["provision.yml<br/>lab_ssh · multipass_vm"]
    disc["discover.yml<br/>lab_inventory"]
    boot["bootstrap.yml<br/>vault_bootstrap (seal · cluster)"]
    plat["platform.yml<br/>vault_platform"]
    val["validate.yml"]
  end
  subgraph guests["red-vault-1..3 · red-vault-s"]
    conv["converge.yml<br/>rhel_prepare · vault_install · vault_tls<br/>vault_license · vault_configure"]
  end
  env --> prov --> disc --> conv --> boot --> plat --> val
```

Every playbook except `provision.yml` imports `discover.yml` first (tagged
`always`), so phases run independently in any order after provisioning.
`site.yml` imports all five; `make lab` runs them one by one
(`scripts/lab.sh`) for clear resume points and writes the convergence stamp.

## The seal chain

```mermaid
flowchart TB
  op(["Operator<br/>.secrets/seal-init.json"])
  subgraph seal["red-vault-s · Shamir 1/1"]
    tr["transit/keys/autounseal<br/>policy autounseal"]
    ar["auth/approle<br/>red-pass-seal-autounseal · red-pass-seal-rotator<br/>(CIDR-bound to red-agent-1)"]
  end
  subgraph agent["red-agent-1"]
    va["vault-agent<br/>auto_auth approle · api_proxy force token<br/>mTLS listener :8100"]
    rot["seal-rotator.timer (6 h)<br/>new secret-id, destroy old"]
  end
  subgraph cluster["Raft cluster · seal &quot;transit&quot; · recovery keys 3/2"]
    v1["red-vault-1"]
    v2["red-vault-2"]
    v3["red-vault-3"]
  end
  op -- "make unseal (1 key)" --> seal
  va -- "AppRole login · token renewed / re-issued" --> ar
  rot -- "rotator AppRole" --> ar
  v1 & v2 & v3 -- "mTLS (node cert) · no token" --> va
  va -- "encrypt / decrypt with its own token" --> tr
```

1. `red-vault-s` is a standalone single-node Raft Vault with Shamir 1/1,
   holding the non-exportable Transit key `autounseal` (policy `autounseal`:
   encrypt/decrypt that key, lookup/renew self).
2. **Seal agent** (`agent.yml`, role `seal_agent`): AppRole
   `red-pass-seal-autounseal` (token 1 h / max 24 h, secret-id 24 h, both
   CIDR-bound to red-agent-1) logs Vault Agent in; `api_proxy` forces that
   token on every proxied call. The listener requires a lab-CA client
   certificate and firewalld admits only the three cluster addresses.
3. `seal-rotator.timer` uses a second AppRole that may only mint and destroy
   secret-ids of the first: every 6 h a new secret-id replaces the file and
   all others are destroyed. The agent uses it at its next login.
4. Cluster nodes: `seal "transit"` points at the agent with the node's own
   client certificate, `disable_renewal`, and a placeholder token the agent
   overrides. No `seal.env`, no `VAULT_TOKEN`. Recovery keys (3/2) are never
   needed for unsealing.
5. `vault-wait-seal` (ExecStartPre) checks the agent over mTLS: it answers 200
   only when it holds a token and the seal Vault is unsealed. It fails fast;
   systemd retries every 10 s, so neither boot nor Vault crash-loops.
6. Migration on a running lab: the agent is proven from a cluster node first
   (`.build/seal-agent.json` marker), then nodes switch one at a time, each
   waiting to be unsealed again; finally the old 720 h token is revoked.
7. Only one seal stanza is configured: Seal HA is not part of the licence.

Peer names resolve through `/etc/hosts`. Multipass vendor-data sets
`manage_etc_hosts: true`, so cloud-init rewrites `/etc/hosts` on every boot;
`vault_configure` therefore manages the same block in
`/etc/cloud/templates/hosts.redhat.tmpl` as well.

## Service VMs and the node probe

`red-ux-1` runs the control-plane UI in **VM mode**: it cannot reach the
Multipass daemon, so it never changes VM lifecycle. Its evidence comes from:

- `/var/lib/red-ux/evidence/` — `ownership.json`, `convergence.json`,
  `validation.json` and `automation-digest.txt`, pushed by `ux.yml`
  (`make ux-sync`, last step of `make lab`);
- `/usr/local/libexec/red-pass-probe` on every node (role `lab_probe`): one
  fixed read-only script. The UI runs it over SSH as the unprivileged
  `redprobe`, whose key is `restrict,command="…red-pass-probe",from="<red-ux-1>"`
  — no shell, no forwarding, no other source. Host mode runs the same probe
  through `multipass exec`.

Service VMs get a fourth indicator **Service** (their own unit + HTTPS
health) instead of Vault; cluster and seal-chain evidence are never
attributed to them.

## Front door

```mermaid
flowchart LR
  you([Browser / CLI]) -- "TLS · lab CA" --> px[red-proxy-1 · HAProxy]
  px -- ":8200 active only" --> v[red-vault-1..3]
  px -- ":8202 any unsealed" --> v
  px -- ":9000 /node/name" --> v
  px -- ":8210" --> s[red-vault-s]
  px -- ":443" --> ux[red-ux-1 console]
  px -- ":8443" --> kc[red-identity-1 Keycloak]
```

- Every backend hop is TLS with `verify required` + `verifyhost <node>`.
- `:8200` checks bare `GET /v1/sys/health`: only the active node answers 200
  (Enterprise performance standbys answer 473), so writes and the Vault UI
  always hit the leader and follow it on failover.
- Keycloak's issuer, Vault's OIDC callbacks and the console's origins switch
  to the proxy URL as soon as `red-proxy-1` is in the inventory
  (`front_door` in `group_vars`), in the same `make lab`.
- The console (3443) and Keycloak (8443) accept only the proxy's address
  (firewalld rich rules). OpenLDAP and Keycloak run with **host networking**:
  Podman's published ports are DNAT'd by netavark and would bypass firewalld.

## Identity

```mermaid
flowchart LR
  ldap[(OpenLDAP<br/>ou=people · ou=groups)] -- read-only federation<br/>group-ldap-mapper --> kc[Keycloak realm red-pass]
  kc -- "id_token · groups claim" --> oidc[Vault auth/oidc<br/>browser + CLI]
  kc -- "id_token presented directly" --> jwt[Vault auth/jwt]
  ldap -- "ldaps bind (cn=readonly)" --> ldapauth[Vault auth/ldap]
  oidc & jwt & ldapauth --> groups[external groups<br/>oidc-/jwt-/ldap-red-pass-*] --> pol[red-pass-admin / operator / viewer]
  kc -- "Authorization Code + PKCE" --> ui[red_pass console BFF<br/>httpOnly session · role]
```

- `auth/jwt` exists because a mount configured with `oidc_client_id`
  refuses direct JWT logins ("unsupported config type").
- Vault external groups carry one alias each, so every directory group has
  one external group per mount.
- The console never sees a token: the Nitro BFF does the code exchange,
  verifies the id_token (issuer, audience, nonce, RS/PS/ES algorithms) and
  keeps only `{name, role}` in an encrypted, httpOnly, secure cookie. VM mode
  refuses every API call without a session (no bypass).
- Keycloak's issuer is fixed (`keycloak_public_url`); prompt 08 moves it to
  the front door.

## Data flow and evidence

| Artifact | Writer | Reader | Contains |
| --- | --- | --- | --- |
| `.build/ownership.json` | `provision.yml` | UI "Ansible provisioned" | names, roles, sizing, IPv4, first_seen |
| `.build/convergence.json` | `scripts/lab.sh` after a fully green run | UI "Ansible converged" | result, timestamps, phases, automation digest |
| `.build/validation.json` | `validate.yml` (also on failure) | UI "Vault secured", humans | pass/fail per node, cluster and seal-chain check |

The automation digest (`scripts/automation-digest.sh`) is a SHA-256 over every
file under `ansible/` and `policies/` plus `ansible.cfg`. If it differs from the
stamp, the lab is converged against an older definition ("outdated").
