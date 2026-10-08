# red_pass control plane UI

Local Nuxt 4 control plane for the Ansible-built red_pass lab, in the Vault
daylight glass design system (see [../DESIGN.md](../DESIGN.md)).

```bash
make ui-install
make ui-start        # http://127.0.0.1:3310 (loopback only)
make ui-check        # typecheck, lint, unit tests, build
make ui-a11y         # axe WCAG 2.1 AA at 1440×900 and 390×844 (UI running)
```

## What each indicator proves

| Indicator | Proven by | Never inferred from |
| --- | --- | --- |
| **Provisioned** | VM listed in `.build/ownership.json` (Ansible `provision.yml`) and its IP matches Multipass | a familiar VM name |
| **RHEL healthy** | read-only guest probe: RHEL 9, aarch64, SELinux enforcing, swap off, firewalld active, no failed units, root filesystem | Multipass `Running` |
| **Ansible converged** | last successful `make lab` stamp includes the node and its digest equals `scripts/automation-digest.sh` now | "Ansible ran once" |
| **Vault secured** | live node probe (service, verified TLS, initialized, unsealed, expected seal type) + the last `make validate` report (cluster or seal-chain scope, with its age) | the Vault process running |

The seal Vault is judged against seal-node expectations (Shamir, unsealed,
Transit key, seal agent token and rotation); cluster evidence is never attributed to it.

## Modes

- `RED_PASS_MODE=host` (default, `make ui-start`): next to Multipass on the
  Mac; lifecycle actions available.
- `RED_PASS_MODE=vm` (red-ux-1, `make ux-deploy`): observe-only; inventory from
  the pushed ownership manifest, node checks over the forced-command SSH
  probe, lifecycle routes answer 405.

## Boundaries

- Server-side only; `execFile` with fixed argv, timeouts and bounded output.
- Reads only allow-listed fields from `.build/*.json`; never `.secrets/`,
  except the read-only engines token whose path `make engines` (VM) or
  `make ui-start-auth` (host) hands it. That token can read
  `engines/sys/mounts` and nothing else; it is never logged or returned.
- Mutations: Multipass start/stop/restart/suspend/delete/recover/purge, with
  Origin checks, per-instance locks, confirmation, an ownership-drift
  acknowledgement for Ansible-provisioned VMs, and an exact phrase for purge.
- It never runs `make`, Ansible, Vault writes or RHSM.
- `GET /api/engines` (session required): one live `sys/mounts` read in
  namespace `engines` (`RED_PASS_VAULT_ADDR`, `RED_PASS_ENGINES_NAMESPACE`,
  `RED_PASS_ENGINES_TOKEN_FILE`), cached 10 s; returns path, type,
  description and plugin version only.
