# Console Engines page (ansible/engines.yml): list what is mounted in the
# engines namespace. Nothing else — not even the default policy.
path "engines/sys/mounts" {
  capabilities = ["read"]
}

# Its own token only.
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}
