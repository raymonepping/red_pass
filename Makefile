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
