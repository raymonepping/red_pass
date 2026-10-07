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
