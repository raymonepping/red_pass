# Identity

People come from one directory and reach Vault and the console through
Keycloak or LDAP. Everything is built by `ansible/identity.yml`
(roles `identity_secrets`, `identity_stack`, `vault_identity`) and proven by
`ansible/identity-verify.yml` (role `identity_verify`).

## Components

| Component | Where | Notes |
| --- | --- | --- |
| OpenLDAP (`osixia/openldap:1.5.0`, digest-pinned, arm64) | red-identity-1, Podman Quadlet, host network | base `dc=red-pass,dc=lab`; LDAPS 636 with a lab-CA cert; read-only bind user `cn=readonly` |
| Keycloak 26.6.4 (digest-pinned, arm64) | red-identity-1, Podman Quadlet, host network | realm `red-pass`, issuer `https://<proxy>:8443/realms/red-pass`, `--db=dev-file` |
| Vault `auth/oidc` | cluster | browser and `vault login -method=oidc`; client `vault`; role `default` |
| Vault `auth/jwt` | cluster | Keycloak id_tokens presented directly; role `cli` (lab) |
| Vault `auth/ldap` | cluster | `ldaps://red-identity-1:636`, CA-verified, `groupOfNames` filter |
| Console BFF | red-ux-1 | client `red-pass-ui`, Authorization Code + PKCE |

`auth/jwt` exists because a mount with `oidc_client_id` set refuses direct
JWT logins. Vault external groups take one alias each, so every directory group
has three external groups: `oidc-<group>`, `jwt-<group>`, `ldap-<group>`.

## Directory and roles

Defined in `ansible/group_vars/all.yml` (`identity_users`, `identity_groups`):

| Person | LDAP group | Keycloak `groups` claim | Vault policy | Console role |
| --- | --- | --- | --- | --- |
| raymon | red-pass-admins | red-pass-admins | red-pass-admin | admin |
| barend | red-pass-operators | red-pass-operators | red-pass-operator | operator |
| viewer | red-pass-viewers | red-pass-viewers | red-pass-viewer | viewer |

Keycloak federates the directory read-only (attribute mappers for username,
e-mail, first and last name, plus a group mapper); each client adds a
`groups` claim to id, access and userinfo tokens.

## Flows

```text
Vault UI ──OIDC──► Keycloak (realm red-pass) ──LDAP──► OpenLDAP
   ◄── id_token (groups) ── callback https://<proxy>:8200/ui/vault/auth/oidc/oidc/callback
   Vault: external group oidc-red-pass-admins → policy red-pass-admin

Console ──Authorization Code + PKCE (BFF)──► Keycloak
   Nitro verifies the id_token (issuer, audience, nonce, RS/PS/ES) and keeps
   {name, role} in an encrypted httpOnly cookie. No token reaches the browser.

vault login -method=ldap ──LDAPS bind──► OpenLDAP; groups → ldap-<group> → policy
```

## Secrets

Generated once by `identity_secrets` into Vault KV `secret/red-pass/identity`:
`ldap_admin_password`, `ldap_readonly_password`, `keycloak_admin_password`,
`vault_client_secret`, `ui_client_secret`, `ui_session_password`,
`user_<uid>` for every person. Containers receive them as Podman secrets; the
console as `redux`-only files. `make identity-show-user PERSON=<uid>` is the only
command that prints one.

## Adding a person or group

1. Edit `identity_users` (and `identity_groups` for a new group with a
   `policy` and `ui_role`; add `policies/<policy>.hcl`).
2. `make identity` — creates the LDAP entry, a password in Vault KV, the
   Vault policy and external groups.
3. `make identity-verify` — the new person is exercised like the others.

## Checks (`make identity-verify`)

Eleven rows, also part of `make validate`: Keycloak login per person, Vault
JWT login per person with **exactly** the expected identity policy, Vault LDAP
login per person likewise, the operator can encrypt with Transit, the viewer is
denied a KV write. Every token used is revoked at the end.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Invalid username or password" on `https://<proxy>:8443/` | that is the master-realm **admin** console (user `admin`); people live in realm `red-pass` — `/` now redirects to `/realms/red-pass/account` |
| Console: "Sign-in could not be completed", logs show `JWTExpired` | guest clock drift after Mac sleep — `make converge TAGS=rhel` |
| Keycloak 500 "User returned from LDAP has null username" | attribute mappers missing in the federation — `make identity` restores them |
| Vault JWT login "unsupported config type" | JWT login sent to the OIDC mount — use `auth/jwt` |
