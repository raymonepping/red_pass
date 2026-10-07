# Operations

Every playbook is idempotent. If a phase fails, fix the reported cause and
rerun that phase (`make <phase>`), then `make lab`. A converged lab reports
`changed=0` on every phase and on `make check-mode`.

## Resume points

| Symptom | Action |
| --- | --- |
| `provision` fails launching | Check `multipass list`; a `Deleted`/`Unknown` red-vault VM is refused — `multipass recover <name>` or purge it yourself. Automation never deletes. |
| Host key changed | Only after an intentional rebuild: `./scripts/ansible-run.sh provision -e confirm_host_key_change=true`. |
| RHSM registration fails | Check `RHSM_ORG` / `RHSM_ACTIVATION_KEY` in `.env`. If `subscription.rhsm.redhat.com` does not resolve but HTTPS works, `rhel_prepare` sets `RHEL_DNS_SERVERS` (default `1.1.1.1,1.0.0.1`) through NetworkManager. |
| Licence missing | `VAULT_LICENSE` in `.env`; `make converge TAGS=license`. |
| Node IP changed | `make lab` reissues only the certificates whose IP SAN is missing, updates the hosts block, and restarts nodes one at a time. |
| Lost `.secrets/*-init.json` | Do **not** reinitialise. Restore from backup. Bootstrap refuses to run when Vault is initialised but the file is missing (and vice versa). |

## Launching new VMs next to running ones

Multipass caches `file://` images by **content** and resolves them through
the disk of the last instance created from that content; when that VM is
running its disk is write-locked and `multipass launch` fails with
`Failed to get shared "write" lock`. `multipass_vm` therefore launches every
new VM from its own APFS clone under `/Users/Shared/red-pass-images` (outside
`~/Documents`, which `multipassd` cannot read) with a per-node marker appended
after the last qcow2 cluster, and deletes the clone afterwards.

## Clocks

Multipass guests fall minutes behind after the Mac sleeps, and RHEL's
default `makestep 1.0 3` only steps at boot — chrony then slews for hours and
freshly issued OIDC tokens look expired (`JWTExpired`). `rhel_prepare` sets
`makestep 1.0 -1` and steps immediately when the offset exceeds 1 s; every
node's clock offset is RHEL evidence in the console. If sign-in fails with an
expiry error: `make converge TAGS=rhel`.

## Front door operations

- Names instead of the IP (optional, never done by automation) — add to the
  Mac's `/etc/hosts`: `<red-proxy-1 ip> vault.red-pass.lab ui.red-pass.lab id.red-pass.lab`.
  The issuer stays the IP URL, so OIDC keeps working either way.
- `make proxy-failover-test` — explicit, changes live state.
- Stats: `https://<proxy>:8404/stats`, user `stats`, password from Vault KV
  `secret/red-pass/proxy` (stored hashed in `haproxy.cfg`).
- Sizing: the proxy (and any small RHEL VM) needs 2 GB — `dnf` on the full
  RHEL repository metadata is OOM-killed at 1 GB. Resize an existing VM with
  `multipass stop <vm> && multipass set local.<vm>.memory=2G && multipass start <vm>`.

## Identity operations

| Need | Do |
| --- | --- |
| A lab password | `make identity-show-user PERSON=barend` |
| Prove people | `make identity-verify` |
| Add a person / group | edit `identity_users` / `identity_groups` in `ansible/group_vars/all.yml`, then `make identity` (password generated into Vault KV) |
| Keycloak admin console | `https://<red-identity-1>:8443/admin` as `admin` (password in Vault KV, key `keycloak_admin_password`) |

## Restarts and the seal chain

- **Cluster node restarted** — nothing to do: it auto-unseals through the
  seal agent within seconds of booting (proven by rebooting `red-vault-2`).
- **`red-agent-1` restarted** — the cluster keeps serving; the agent logs in
  again with its current secret-id. Nodes restarting meanwhile wait.
- **`red-vault-s` restarted** — the cluster keeps serving. Run `make unseal`;
  the agent re-authenticates by itself.
- **Cold start** (everything stopped): start `red-vault-s` → `make unseal` →
  `red-agent-1` → the cluster nodes (any order; they wait for the agent).

Manual unseal of the seal Vault, if Ansible is unavailable:

```bash
export VAULT_CACERT=$PWD/.secrets/tls/ca.crt
VAULT_ADDR=https://<red-vault-s ip>:8200 vault operator unseal "$(jq -r '.keys_base64[0]' .secrets/seal-init.json)"
```

## Seal agent and rotation

- `make seal-rotate` rotates the agent's secret-id now (normally every 6 h);
  `make validate` fails if the last rotation is older than 7 h, if the agent
  holds no `autounseal` token, or if any cluster node holds a seal credential.
- The agent's AppRole secret-id expires after 24 h: if rotation is broken for a
  day, the agent cannot log in again after its token's max TTL (24 h). The
  validation alarm fires long before that.
- Rotator credential (anchor): `/etc/vault-agent/approle/rotator-secret-id`,
  no TTL but usable only from red-agent-1's address and only to mint/destroy
  the agent's secret-ids. Re-issue it by deleting the file and running
  `make agent`.
- If the agent VM is lost: `make lab` re-creates it; it gets a fresh secret-id
  and the marker path is reused.

## Platform changes

Edit `vault_namespaces` / `vault_mounts` in `ansible/group_vars/all.yml`,
then:

```bash
make platform-check   # what would change
make platform
```

The role creates what is missing and refuses (fails) when a mount exists
with a different type. It never deletes or retypes; pruning is deliberately
out of scope.

## Manual failover acceptance test

Not automated, because it changes live state.

1. `make status` — note the active node.
2. `multipass exec <active> -- sudo systemctl stop vault`
3. Within ~10s `make status` shows another node active.
4. `multipass exec <node> -- sudo systemctl start vault` — it auto-unseals
   and rejoins as standby (no keys needed).
5. `make validate` — one active, two standbys, three voters.

## Teardown

```bash
CONFIRM_RHSM_UNREGISTER=yes make rhel-unregister   # optional, while the VMs exist
make destroy                                        # deletes + purges red-vault-* only
```

`destroy` keeps `.secrets/` and `.cache/`. For a fresh lab afterwards remove
the per-lab secrets it prints (init files, tokens, node certs,
`known_hosts`); the CA and SSH identity may be reused.
Unregistration is never automatic: unregistered systems lose access to
protected Red Hat content and updates.
