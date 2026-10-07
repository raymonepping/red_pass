# Lab-only administrative policy for the Ansible platform layer
# (ansible/platform.yml) and the authenticated read-only validation.
# The token is created by ansible/bootstrap.yml and kept in .secrets/.

# Namespace management (root namespace)
path "sys/namespaces" {
  capabilities = ["list"]
}

path "sys/namespaces/*" {
  capabilities = ["create", "read", "update", "list"]
}

# Mount management in the root namespace and one level of child namespaces
path "sys/mounts" {
  capabilities = ["read"]
}

path "sys/mounts/*" {
  capabilities = ["create", "read", "update"]
}

path "+/sys/mounts" {
  capabilities = ["read"]
}

path "+/sys/mounts/*" {
  capabilities = ["create", "read", "update"]
}

# Read-only cluster evidence for validate.yml
path "sys/storage/raft/configuration" {
  capabilities = ["read"]
}

path "sys/license/status" {
  capabilities = ["read"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

# ── Identity layer (ansible/identity.yml) ────────────────────────────────────
# KV v2 mount holding identity secrets, and those secrets only.
path "secret/data/red-pass/*" {
  capabilities = ["create", "read", "update"]
}

path "secret/metadata/red-pass/*" {
  capabilities = ["read", "list"]
}

# Auth methods: enable and configure oidc + ldap.
path "sys/auth" {
  capabilities = ["read"]
}

path "sys/auth/*" {
  capabilities = ["create", "read", "update", "sudo"]
}

path "auth/oidc/*" {
  capabilities = ["create", "read", "update", "list"]
}

path "auth/jwt/*" {
  capabilities = ["create", "read", "update", "list"]
}

# Clean-up of the CLI role that once lived on the OIDC mount.
path "auth/oidc/role/cli" {
  capabilities = ["read", "delete"]
}

path "auth/ldap/*" {
  capabilities = ["create", "read", "update", "list"]
}

# Person-facing policies (exact names: the platform token must never be
# able to rewrite its own red-pass-platform-admin policy).
path "sys/policies/acl/red-pass-admin" {
  capabilities = ["create", "read", "update"]
}

path "sys/policies/acl/red-pass-operator" {
  capabilities = ["create", "read", "update"]
}

path "sys/policies/acl/red-pass-viewer" {
  capabilities = ["create", "read", "update"]
}

# The external groups that carry them.

path "identity/group" {
  capabilities = ["create", "update"]
}

path "identity/group/*" {
  capabilities = ["create", "read", "update", "list"]
}

path "identity/group-alias" {
  capabilities = ["create", "update"]
}

path "identity/group-alias/*" {
  capabilities = ["create", "read", "update", "list"]
}
