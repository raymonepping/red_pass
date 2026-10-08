# Testing

Every gate below runs against the real lab (or the real UI build); none of
them fakes evidence.

## Static

| Gate | Proves |
| --- | --- |
| `make check` | controller tools, `bash -n` + ShellCheck on scripts, `ansible-playbook --syntax-check` on every playbook, no secret paths tracked |
| `make ui-check` | console: strict TypeScript, ESLint, 89 unit tests, production build |

Unit tests (`ux/tests`) cover Multipass JSON normalisation and safe argv,
ownership/convergence truth rules, seal-node vs cluster-node posture, report
staleness, service-node evidence, front-door parsing (incl. *standby*), origin
allow-list, the session guard and role gates, PKCE, the VM-list summary, and
redaction of command errors, and the Engines adapter (allow-listed
`sys/mounts` fields, built-ins dropped, `live`/`denied`/`unreachable`/
`unconfigured`, refused addresses and paths).

## Idempotency and drift

| Gate | Proves |
| --- | --- |
| second `make lab` | `changed=0` on every VM (only the console's evidence sync changes) |
| `make check-mode` | provision → platform in `--check --diff`: `changed=0` |
| `make platform-check` | Vault namespaces/mounts match `group_vars`; a hand-disabled mount shows up and `make platform` restores it |
| `make engines` ×2 | first run mounts the engines, second `changed=0`; a hand-disabled engine leaves the Engines page within 10 s and the next run restores exactly that one |
| console *Ansible* indicator | the last green run's automation digest equals today's (`scripts/automation-digest.sh`) |

## Readiness contract (`make validate`)

Written to `.build/validation.json` even on failure, then asserted:

- **per Vault node** — service active, SELinux enforcing, swap off, firewall
  8200/8201, TLS, initialised, unsealed, expected seal type;
- **cluster** — exactly one active node, three Raft voters, licence valid,
  platform namespaces and mounts present;
- **seal chain** — Transit key present, the seal agent holds an `autounseal`
  token, secret-id rotated within 7 h, no seal credential on any cluster node;
- **people** — the 11 identity checks ([identity.md](identity.md));
- **front door** — Vault (active), reads, `/node/<name>`, seal Vault, console
  and Keycloak issuer through the proxy; direct access to the console,
  Keycloak and the agent from outside must fail.

## Behaviour (explicit, change live state)

| Gate | Proves |
| --- | --- |
| `multipass restart red-vault-2` | a cluster node unseals itself through the agent |
| restart `red-agent-1` | the cluster keeps serving; the agent re-authenticates |
| `make seal-rotate` ×2 | a fresh secret-id each time; exactly one remains valid |
| stop/start everything, `make unseal` | cold start: the seal chain comes back in order |
| `make proxy-failover-test` | the front door serves a new leader within seconds; the old one rejoins as standby |

## Browser (`ux/e2e`, Playwright + axe)

```bash
./scripts/ui-signin-test.sh https://<proxy> e2e/a11y.spec.ts e2e/signin.spec.ts
./scripts/ui-signin-test.sh https://<proxy>:8200 e2e/vault-oidc.spec.ts
```

- axe WCAG 2.1 AA, **0 violations**, on every page at 1440×900 and 390×844,
  plus the evidence drawer and action dialog;
- sign-in through Keycloak for viewer, barend and raymon with the right
  persona and controls; the API answers 401 without a session;
- raymon signs in to the Vault UI with OIDC through the front door.

Passwords come from Vault for the duration of the run only.

## Secrets

```bash
./scripts/secret-scan.sh .build ux/.output <logs…>
```

Compares every known secret (licence, RHSM, init material, tokens, identity
and proxy secrets) against the given paths and reports only labels and file
names. Run after every phase during development; clean at the end of every
prompt.
