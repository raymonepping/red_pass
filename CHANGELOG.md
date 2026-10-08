# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `make engines` / `engines-check` (`ansible/engines.yml`, role
  `vault_engines`): every self-contained secrets engine — KV v2, Transit, PKI,
  SSH, TOTP, and with a licence that has the feature Transform, KMIP, Key
  Management, SPIFFE — in namespace `engines`. Idempotent, per-engine failure
  handling, licence gate, reasons for every skipped engine; a phase of
  `make lab` after `ux`.
- Console **Engines** page (under Fleet): one tile per engine Vault reports,
  read live through the front door with a dedicated orphan token (policy
  `red-pass-ui-engines`: read `engines/sys/mounts` only), with explicit
  unreachable / denied / not-configured / empty states.

## [1.0.0] - 2026-10-07

### Added

- Ansible-only lab (no Terraform): `make lab` provisions eight RHEL 9.8 ARM64
  Multipass VMs and converges, bootstraps, configures and validates them.
- Vault Enterprise 2.1 Raft cluster (3 voters) with transit auto-unseal through
  a seal chain: seal Vault (`red-vault-s`, Shamir 1/1) → seal agent
  (`red-agent-1`, AppRole + Vault Agent mTLS API proxy, secret-id rotation
  every 6 h) → nodes holding no seal credential.
- Vault platform layer through the HTTP API: namespaces, KV v2, Transit, PKI.
- People: OpenLDAP + Keycloak on `red-identity-1`; Vault `auth/oidc`,
  `auth/jwt`, `auth/ldap`, external groups and person policies; identity
  secrets generated into Vault KV.
- HAProxy front door on `red-proxy-1` (active-node Vault, reads, console,
  Keycloak, seal Vault, per-node paths, stats) with verified re-encryption.
- Control-plane console (Nuxt 4, Vault daylight glass) on `red-ux-1`
  (observe-only, Keycloak sign-in) and on the host (full Multipass control by
  role); four evidence-backed indicators per VM, seal chain, front door.
- Validation contract (`make validate`), check mode, identity checks, failover
  test, secret scan, axe-clean UI at desktop and phone sizes.
- `make trust` / `untrust` / `trust-status` for the lab CA in the macOS keychain.

### Security

- No secret in Git, `.build/`, inventory, `extra_vars`, logs or the browser;
  least-credential per component; verified TLS on every hop; firewalld
  source restrictions proven from outside.
