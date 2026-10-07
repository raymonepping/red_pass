# The rotator may only mint and destroy secret-ids of the seal agent's role.
path "auth/approle/role/red-pass-seal-autounseal/secret-id" {
  capabilities = ["update", "list"]
}

path "auth/approle/role/red-pass-seal-autounseal/secret-id-accessor/destroy" {
  capabilities = ["update"]
}
