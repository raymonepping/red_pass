# Transit auto-unseal for the red_pass cluster: use the one key, nothing else.
path "transit/encrypt/autounseal" {
  capabilities = ["update"]
}

path "transit/decrypt/autounseal" {
  capabilities = ["update"]
}

path "transit/keys/autounseal" {
  capabilities = ["read"]
}

# The transit seal looks up and renews its own periodic token.
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}
