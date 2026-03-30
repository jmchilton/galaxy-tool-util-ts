.PHONY: all lint format typecheck test check fix format-fix sync-golden sync-param-spec sync verify-golden

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

# Sync parameter_specification.yml from Galaxy repo.
#   GALAXY_ROOT=~/projects/worktrees/galaxy/branch/json_schema_parameters make sync-param-spec
PARAM_SPEC_SRC = $(GALAXY_ROOT)/test/unit/tool_util/parameter_specification.yml
PARAM_SPEC_DST = packages/schema/test/fixtures/parameter_specification.yml

sync-param-spec:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
	@test -f "$(PARAM_SPEC_SRC)" || (echo "ERROR: $(PARAM_SPEC_SRC) not found" && exit 1)
	@echo "Syncing parameter_specification.yml from $(PARAM_SPEC_SRC)..."
	cp $(PARAM_SPEC_SRC) $(PARAM_SPEC_DST)
	@echo "Synced."

sync: sync-golden sync-param-spec

# Verify golden fixtures match checksums (no GALAXY_ROOT needed, works in CI)
verify-golden:
	@node -e '\
		const fs = require("fs"); \
		const crypto = require("crypto"); \
		const path = require("path"); \
		const dir = "$(GOLDEN_DST)/cache_golden"; \
		const manifest = "$(GOLDEN_DST)/cache_golden.yaml"; \
		const checksums = JSON.parse(fs.readFileSync(path.join(dir, "checksums.json"), "utf-8")); \
		const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); \
		let ok = true; \
		const mh = sha(manifest); \
		if (mh !== checksums.manifest_sha256) { console.error("FAIL manifest:", mh, "!=", checksums.manifest_sha256); ok = false; } \
		for (const [f, h] of Object.entries(checksums.files)) { \
			const ah = sha(path.join(dir, f)); \
			if (ah !== h) { console.error("FAIL", f, ":", ah, "!=", h); ok = false; } \
		} \
		if (ok) { console.log("All golden checksums verified."); } else { process.exit(1); } \
	'
