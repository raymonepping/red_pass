# Lessons learned

The traps found while building red_pass, each with the fix that is now in
the automation. Most are not specific to this lab.

## Multipass on macOS

- **Launching a VM while another runs fails** with `Failed to get shared "write"
  lock`. Multipass caches `file://` images by *content* and resolves them
  through the disk of the last instance created from it — which is running and
  locked. Fix: launch each VM from its own APFS clone (`cp -c`) with a few
  bytes appended after the last qcow2 cluster.
- **`multipassd` cannot read `~/Documents`** (macOS privacy, TCC). The clones
  live in `/Users/Shared/red-pass-images`.
- **`/etc/hosts` is rewritten on every boot** (`manage_etc_hosts: true` in
  Multipass vendor-data). Manage `/etc/cloud/templates/hosts.redhat.tmpl` too.
- **`multipass restart` can exit non-zero after the guest has rebooted.** Report
  command result and readiness separately.
- **Disk size is the EFI partition** for these RHEL images; read `df /` in the guest.
- **Clocks drift minutes behind after the Mac sleeps.** Tokens look expired,
  fresh certificates look "not yet valid". Fix: chrony `makestep 1.0 -1`,
  `maxpoll 6`, `chronyc waitsync` with a restart as rescue, certificates
  issued with `notBefore` one hour back.
- **1 GB VMs cannot run `dnf`** against full RHEL repo metadata (OOM-killed): 2 GB.
- **Monotonic systemd timers stall while the Mac sleeps** (`OnUnitActiveSec=6h`
  ran 15 h late; `Persistent=` only applies to `OnCalendar=`). Use a wall-clock
  `OnCalendar=` with `Persistent=true`: the missed slot fires after wake.

## RHEL and containers

- **Podman's published ports bypass firewalld** (netavark DNAT). A
  "proxy-only" rich rule did nothing for Keycloak until the containers moved
  to host networking.
- **OpenLDAP answers "No such object"** to anonymous reads of a protected
  base. Probe the root DSE (`namingContexts`) for readiness.

## Vault Enterprise

- `sys/init` over HTTP returns `keys_base64` / `recovery_keys_base64` (the CLI
  prints `unseal_keys_b64`).
- A transit-sealed node exits at start while its seal is unreachable: a
  fail-fast `ExecStartPre` guard with `Restart=always` keeps boot moving.
- Enterprise standbys are **performance standbys**: bare `sys/health` returns
  473; "any unsealed node" checks need `standbyok&perfstandbyok`.
- A JWT/OIDC mount with `oidc_client_id` refuses JWT logins — add `auth/jwt`.
- External groups carry one alias each — one group per mount.
- AppRole stores `token_bound_cidrs` `x/32` as `x`; normalise before comparing.
- The JWT login response leaves `identity_policies` empty; ask `lookup-self`.
- A platform token that may write `red-pass-*` policies can rewrite its own —
  grant exact names.

## Keycloak

- Passing `mappers:` to a user federation replaces the defaults: declare the
  username/e-mail/name mappers or logins fail with "null username".
- Keycloak stores `multivalued: "true"` on group mappers; declare it or every
  run reports a change.
- The issuer must be fixed (Vault checks it). Moving it to the front door is
  one variable and one converge.

## HAProxy

- `http-request` rules run before `use_backend`: a frontend-level deny refused
  every `/node/…` path; a default 404 backend does not.
- RHEL's socket path is `/var/lib/haproxy`, not `/run/haproxy`.
- Health-check semantics leak into the UI: "DOWN" on the write path is a
  healthy standby.

## Ansible

- A delegated `run_once` task registers on the **inventory host**, not on localhost.
- YAML mapping keys are not templated (`"{{ var }}": …`); build such dicts in Jinja.
- Dynamic `include_role` does not pass `--tags` to its tasks; use `apply: tags`.
- `failed_when: false` also overwrites `failed`; judge by the message.
- `default([])` does not replace `null`; use `default([], true)`.
- `--syntax-check` cannot template `hosts:` from hostvars; `add_host` into a group.

## Process

- Prove each layer on its own before connecting it to the next.
- Write the readiness contract first; let `make validate` find the next bug.
- Reruns must be `changed=0`; every exception is a bug or a documented sync.
- The Bash tool's zsh does not word-split `$LIST`; use arrays when moving files
  aside before an "add everything" commit.
