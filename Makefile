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

.PHONY: ui-install ui ui-build ui-start ui-check ui-a11y
UI_PORT ?= 3310

ui-install: ## Install the control-plane UI dependencies
	cd ux && npm ci

ui: ## Run the control-plane UI in dev mode on 127.0.0.1:$(UI_PORT)
	cd ux && PORT=$(UI_PORT) npm run dev

ui-build: ## Production build of the UI
	cd ux && npm run build

ui-start: ui-build ## Serve the built UI on 127.0.0.1:$(UI_PORT)
	cd ux && PORT=$(UI_PORT) npm start

ui-check: ## UI typecheck, lint, unit tests and build
	cd ux && npm run typecheck && npm run lint && npm test && npm run build

ui-a11y: ## axe WCAG 2.1 AA scan of every screen (UI must be running)
	cd ux && RED_PASS_UI_URL=http://127.0.0.1:$(UI_PORT) npm run test:a11y

.PHONY: ux-build ux-deploy ux-sync
ux-build: ## Build the UI bundle for red-ux-1 (.build/ux, content-addressed)
	./scripts/ux-build.sh

ux-deploy: ux-build ## Deploy the UI to red-ux-1 (observe-only VM mode)
	$(RUN) ux

ux-sync: ## Push the current evidence to red-ux-1
	TAGS=sync $(RUN) ux

.PHONY: identity identity-verify identity-show-user
identity: ## OpenLDAP + Keycloak on red-identity-1, Vault oidc/ldap auth and groups
	$(RUN) identity

identity-verify: ## Every person logs in (Keycloak, Vault OIDC + LDAP) and gets exactly their policies
	$(RUN) identity-verify

identity-show-user: ## Print one lab login password (PERSON=raymon) — lab only, explicit action
	@./scripts/identity-show-user.sh "$(PERSON)"

.PHONY: ui-start-auth
ui-start-auth: ui-build ## Host console with Keycloak sign-in and role gating (needs the identity node)
	./scripts/ui-start-auth.sh

.PHONY: proxy proxy-failover-test
proxy: ## HAProxy front door on red-proxy-1
	$(RUN) proxy

proxy-failover-test: ## Stop Vault on the active node; the front door must follow the new leader
	$(RUN) proxy-failover-test
