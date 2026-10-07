# DESIGN.md — red_pass

## Lineage

> multi_pass → **red_pass**
>
> Visual system: Vault daylight glass (Arcanium canonical, via key_rotation's
> DESIGN.md, Project Durin, Editors Factory)

multi_pass proved a Vault Enterprise cluster on Multipass RHEL with Terraform
around Ansible. red_pass keeps the lab and removes Terraform: **Ansible
launches, converges, bootstraps and validates everything**, and the cluster
auto-unseals through a seal Vault (the key_rotation / red_doors seal chain).

---

## What this lab demonstrates

| Concept | How it appears |
| --- | --- |
| Ansible-only lifecycle | `make lab` = provision → converge → bootstrap → platform → validate; no Terraform state anywhere |
| Ownership without Terraform | `.build/ownership.json` (written by `provision.yml`) drives the **Provisioned** indicator and the delete-drift warning |
| Convergence you can trust | `.build/convergence.json` + `scripts/automation-digest.sh`: **Converged** only when the last green run's digest equals today's automation |
| Transit seal (auto-unseal) | `red-vault-1..3` unseal themselves via `red-vault-s` (Shamir 1/1); only the seal Vault needs an operator key |
| Evidence, not badges | every indicator opens a drawer of the checks behind it; unknown never counts as passing |
| Secrets stay out of the UI | the BFF reads only allow-listed fields from `.build/` and unauthenticated `sys/health`/`sys/seal-status`; never `.secrets/` |

---

## Vault topology

```text
red-vault-s  (ENT 2.1.0, Shamir 1/1)        red-vault-1..3  (ENT 2.1.0, Raft ×3)
┌───────────────────────────────┐          ┌──────────────────────────────────────┐
│ Raft (single node)            │──seal──► │ seal "transit" → red-vault-s         │
│ transit/keys/autounseal       │          │ recovery keys 3/2 (never for unseal) │
│ policy autounseal             │          │ namespaces engineering / operations  │
│ periodic 720h orphan token    │          │ KV v2 · Transit · PKI mounts         │
└───────────────────────────────┘          └──────────────────────────────────────┘
        ▲ make unseal (1 key)                         ▲ make lab (Ansible)
```

---

## World: daylight glass, black ink, strong signal colours

Follows the **Vault daylight glass** system unchanged (`ux/app/assets/css/main.css`
is the system's `vault-glass.css`; red_pass components live in
`ux/app/assets/css/red-pass.css` and use tokens only).

- Frosted glass panes (`.vg-glass`) over the daylight ground with aluminium
  mullions; black ink text; one **ink hero** per page (`.vg-hero`): the fleet
  summary on `/`, the VM identity + lifecycle on `/instances/:name`.
- Hanken Grotesk for UI, JetBrains Mono for VM names, IPs, paths and digests.
- Shell: frosted left rail (Fleet), floating glass topbar with the live
  **seal-chain pill** and a `LOCAL` badge.

## Colour roles

| Meaning | Token | Used for |
| --- | --- | --- |
| Healthy / passing | `--vg-healthy` on `--vg-healthy-bg` | Provisioned, Healthy, Converged, Secured; unsealed links |
| Attention / outdated | `--vg-pending` on `--vg-pending-bg` | Unmanaged, Outdated, stale validation report, seal-restart warning |
| Critical | `--vg-critical` on `--vg-critical-bg` | Sealed, Not ready, Failed, destructive actions |
| Unknown | `--vg-text-dim` on slate tint | Unknown, Never run (never faded with opacity) |
| Identity / links | `--vg-action-bright` | role chips, eyebrows, links |
| Seal Vault identity | `--vg-hue-violet` tint | the `SEAL VAULT` role chip only |

## Daylight glass — state map

| UI state | Component / tone | Source |
| --- | --- | --- |
| Provisioned | `posture-pill tone-positive` | name in `.build/ownership.json`, IP agrees with Multipass |
| Drift detected | `posture-pill tone-critical` | manifest IP ≠ live IP |
| Unmanaged | `posture-pill tone-warning` | readable manifest without this VM (e.g. multi_pass `vault-1`) |
| Converged / Outdated | `tone-positive` / `tone-warning` | stamp digest vs `scripts/automation-digest.sh` |
| Secured | `tone-positive` | live node probe (service, TLS, initialized, unsealed, expected seal type) + validation report |
| Not ready | `tone-critical` | any failing Vault check (e.g. sealed) |
| Seal chain n/3 | topbar `cluster-pill healthy/degraded/critical` | live `sys/seal-status` of all four nodes |
| Seal Vault sealed | `chain-node is-fail` + hint "run make unseal" | live probe |
| Validation report stale | `tone-warning` row "Validation report age" | `.build/validation.json` older than 24 h |
| VM mode | topbar `env-badge` **VM**, hero "Observe-only" line, no lifecycle controls | `RED_PASS_MODE=vm` in red-ux-1 |
| Reachable / Unreachable | `state-chip` (VM mode replaces Multipass states) | forced-command probe answered or not |
| Service healthy / Down | fourth `posture-pill` with the activity glyph | service unit active + HTTPS 200 |

## Sign-in and persona

- `/signin` is a single ink card (the page's one dark pane) on the daylight
  ground, with one light primary action "Continue with Keycloak"; errors from
  the BFF appear as a critical-tint alert inside it.
- Signed in, the topbar carries the **persona pill**: blue identity dot,
  name, role in small caps, and "Sign out".
- Controls a role may not use are not rendered (viewer: none; operator: start
  /restart/stop/suspend; admin: also trash/recover/purge). The server enforces
  the same rules (401/403).

## Navigation, indicator key and footer (prompt 10)

- **Sidebar rail**: Fleet (`/` — hero, seal chain, links), **Virtual machines**
  (`/machines` — every VM card; an amber badge counts red_pass VMs that need a
  look), **Front door** (`/front-door` — entry points with live backends;
  shown when the proxy exists). Each page has exactly one ink hero; the
  hero's status line is green when all is well and amber otherwise.
- **Indicator key**, pinned bottom-left of the rail: one swatch per state
  colour, named once (no state depends on colour alone).
- On phones the rail is hidden; the topbar carries the section nav on its own
  row.
- **Footer** (`RedPassFooter.vue`, first version by IBM Bob, ported from
  Durin): aluminium rule with a blue glint, *"Ansible builds it. Vault seals
  it. People prove it."*, `© <year> Raymon Epping` with the clearing sweep
  (reduced-motion safe), Provision · Converge · Seal · Prove, and the four
  social links. In flow on every page, including sign-in.
- Front door chips: green up, red down, neutral **standby** for a healthy
  Vault node on the write path (only the leader takes writes).

## Components

- **PosturePill** — glyph (box · chip · converge loop · lock) on a status tint,
  uppercase kind label, status value; always a button that opens evidence.
- **InstanceCard** — VM name (mono), release, role chip, IP, the four pills in
  lifecycle order, resources, start/restart + overflow menu.
- **SealChainPanel** — seal Vault node → wire → three cluster links, each with
  its live seal state.
- **EvidencePanel** — right drawer listing checks with scope
  (`node` / `cluster` / `seal-chain`), source and observation time.
- **ActionDialog** — role-aware: seal-Vault restart warns about `make unseal`;
  cluster restart explains auto-unseal; deleting an Ansible-provisioned VM
  requires an ownership-drift acknowledgement.
- **VmListPane** — folded glass pane (`vg-glass`) wrapping the toolbar and
  instance card grid. Always shows a header button (`aria-expanded` /
  `aria-controls`) with the title "Virtual machines" and a compact summary line
  (total, running/reachable, status, foreign-VM count). Folded by default on
  every load; the open/closed choice is remembered per viewer in `localStorage`
  under the key `red-pass:vm-pane` (try/catch, never required to render). When
  any indicator is critical or amber, or any lab instance is unreachable in VM
  mode, the header summary turns amber and the pane border is tinted amber — a
  folded pane never silently hides a problem.
- **RedPassFooter** — in-flow (never fixed) signature footer, present on every
  page including `/signin`. Contains: a thin aluminium rule with a blue glint at
  its centre; a localStorage-remembered folded **"Indicator key"** (`red-pass:footer-key`)
  naming every state colour once (Secured/green, Attention/amber, Failed/red,
  Unknown/dim, Seal Vault/violet, service VM/cyan); the tagline *"Ansible builds
  it. Vault seals it. People prove it."*; `© <year> Raymon Epping` with the
  clearing sweep on hover/focus (`.sig-name`, reduced-motion safe); the words
  **Provision · Converge · Seal · Prove**; and social links (GitHub, X,
  LinkedIn, Medium) with `aria-label`s and `rel="noopener noreferrer"`.

## Responsive behaviour

≥ 900 px: rail + content. < 900 px: rail hidden, brand in the topbar, cards one
column below 520 px, seal chain stacks vertically. No horizontal scroll at
390 px.

## Motion

180 ms `cubic-bezier(0.16,1,0.3,1)` hovers, 220 ms drawer slide, live dots
pulse. `prefers-reduced-motion` disables all of it.

## Accessibility

axe-core WCAG 2.1 A/AA: **0 violations** on `/`, `/instances/red-vault-1`,
`/instances/red-vault-s`, the evidence drawer and the action dialog at
1440×900 and 390×844 (`npm run test:a11y` against a running UI). Status text
holds ≥ 4.5:1 on its own tint; the drawer body is keyboard-scrollable;
`<html lang="en">`; skip link to `#main`.

## Ports and running

| Service | Address |
| --- | --- |
| Control plane UI | `http://127.0.0.1:3310` (`make ui`) |
| Vault cluster API | `https://<red-vault-N ip>:8200` |
| Seal Vault API | `https://<red-vault-s ip>:8200` |

## Anti-patterns (do not)

- Treat Multipass `Running` as RHEL healthy, or a zero exit status as ready.
- Attribute cluster evidence (Raft voters, licence, platform) to the seal Vault.
- Show Multipass's disk figure for these RHEL guests — it is the EFI partition;
  the guest's root filesystem is used instead.
- Run `make`, Ansible, Vault writes or RHSM from the UI.
- Add a second dark pane, coloured left rails, gradient text or emoji icons.
