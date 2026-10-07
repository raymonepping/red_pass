SHELL := /bin/bash
RUN   := ./scripts/ansible-run.sh

.DEFAULT_GOAL := help
.PHONY: help check deps provision ping

help: ## Show targets
	@awk 'BEGIN{FS=":.*## "} /^[a-z0-9-]+:.*## /{printf "  \033[1m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: deps ## Static checks: tools, shell + playbook syntax, secret paths
	./scripts/check.sh

deps: ## Install pinned Ansible collections into .cache
	./scripts/ansible-deps.sh

provision: deps ## Launch/start the four red-vault VMs, SSH trust, ownership manifest
	$(RUN) provision

ping: ## Verified SSH ping of all four VMs
	$(RUN) ping

.PHONY: converge bootstrap unseal
converge: deps ## RHEL prep, Vault install/TLS/license/config on all four nodes (TAGS=...)
	$(RUN) converge

bootstrap: ## Seal chain: seal Vault, transit auto-unseal, cluster init, platform token
	$(RUN) bootstrap

unseal: ## Unseal red-vault-s (one key); the cluster auto-unseals
	$(RUN) unseal

.PHONY: platform platform-check validate lab check-mode status digest destroy rhel-unregister multi-pass-start
platform: ## Create missing namespaces/mounts through the Vault API
	$(RUN) platform

platform-check: ## Report platform drift without changing anything
	CHECK=1 $(RUN) platform

validate: ## Read-only end-to-end validation, writes .build/validation.json
	$(RUN) validate

lab: ## The whole phased workflow: provision → converge → bootstrap → platform → validate
	./scripts/lab.sh

check-mode: ## --check --diff over provision, converge, bootstrap, platform (expect changed=0)
	@set -e; for p in provision converge bootstrap platform; do \
	  printf '\n\033[1m== check-mode: %s\033[0m\n' "$$p"; CHECK=1 $(RUN) $$p; done

status: ## vault status for every red_pass node
	./scripts/status.sh

digest: ## Print the current automation digest
	@./scripts/automation-digest.sh

destroy: ## Delete + purge ONLY the four red-vault VMs (confirmation required)
	$(RUN) destroy

rhel-unregister: ## Unregister guests from RHSM (CONFIRM_RHSM_UNREGISTER=yes)
	$(RUN) rhel-unregister

multi-pass-start: ## Start multi_pass's vault-1..3 again (start only)
	multipass start vault-1 vault-2 vault-3
