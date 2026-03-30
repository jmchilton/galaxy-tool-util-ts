.PHONY: all lint format typecheck test check fix format-fix sync-golden

all: check test

lint:
	pnpm -r lint

format:
	pnpm -r format

format-fix:
	pnpm -r format-fix

typecheck:
	pnpm -r typecheck

test:
	pnpm -r test

check: lint format typecheck

fix: format-fix
	pnpm -r lint -- --fix

# Sync golden cache fixtures from Galaxy repo.
# Set GALAXY_ROOT to your Galaxy checkout, e.g.:
#   GALAXY_ROOT=~/projects/worktrees/galaxy/branch/wf_tool_state make sync-golden
GOLDEN_SRC = $(GALAXY_ROOT)/test/unit/tool_util/workflow_state
GOLDEN_DST = packages/core/test/fixtures/golden

sync-golden:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
	@test -d "$(GOLDEN_SRC)/cache_golden" || (echo "ERROR: $(GOLDEN_SRC)/cache_golden not found" && exit 1)
	@echo "Syncing golden cache fixtures from $(GOLDEN_SRC)..."
	rm -rf $(GOLDEN_DST)
	mkdir -p $(GOLDEN_DST)/cache_golden
	cp $(GOLDEN_SRC)/cache_golden.yaml $(GOLDEN_DST)/
	cp $(GOLDEN_SRC)/cache_golden/*.json $(GOLDEN_DST)/cache_golden/
	@echo "Synced $$(ls $(GOLDEN_DST)/cache_golden/*.json | wc -l | tr -d ' ') JSON files + manifest."
