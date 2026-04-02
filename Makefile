.PHONY: all lint format typecheck test check fix format-fix sync-golden sync-param-spec sync-workflow-fixtures sync-workflow-expectations sync sync-schema-sources generate-schemas verify-golden check-sync check-sync-workflow-fixtures check-sync-workflow-expectations sync-wfstate-fixtures sync-wfstate-expectations check-sync-wfstate-fixtures check-sync-wfstate-expectations

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

# Sync workflow fixture files from gxformat2 for declarative normalization tests.
#   GXFORMAT2_ROOT=~/projects/worktrees/gxformat2/branch/docs make sync-workflow-fixtures
WF_EXAMPLES_SRC = $(GXFORMAT2_ROOT)/gxformat2/examples
WF_FIXTURES_DST = packages/schema/test/fixtures/workflows

sync-workflow-fixtures:
ifndef GXFORMAT2_ROOT
	$(error GXFORMAT2_ROOT is not set. Point it at your gxformat2 checkout.)
endif
	@test -d "$(WF_EXAMPLES_SRC)/format2" || (echo "ERROR: $(WF_EXAMPLES_SRC)/format2 not found" && exit 1)
	@test -d "$(WF_EXAMPLES_SRC)/native" || (echo "ERROR: $(WF_EXAMPLES_SRC)/native not found" && exit 1)
	@echo "Syncing workflow fixtures from $(WF_EXAMPLES_SRC)..."
	mkdir -p $(WF_FIXTURES_DST)/format2 $(WF_FIXTURES_DST)/native
	cp $(WF_EXAMPLES_SRC)/format2/synthetic-*.gxwf.yml $(WF_FIXTURES_DST)/format2/
	cp $(WF_EXAMPLES_SRC)/native/synthetic-*.ga $(WF_FIXTURES_DST)/native/
	cp $(WF_EXAMPLES_SRC)/native/real-*.ga $(WF_FIXTURES_DST)/native/
	@echo "Synced $$(ls $(WF_FIXTURES_DST)/format2/*.gxwf.yml $(WF_FIXTURES_DST)/native/*.ga | wc -l | tr -d ' ') workflow fixtures."

# Sync expectation YAML files from gxformat2 for declarative normalization tests.
#   GXFORMAT2_ROOT=~/projects/worktrees/gxformat2/branch/docs make sync-workflow-expectations
WF_EXPECTATIONS_SRC = $(GXFORMAT2_ROOT)/gxformat2/examples/expectations
WF_EXPECTATIONS_DST = packages/schema/test/fixtures/expectations

sync-workflow-expectations:
ifndef GXFORMAT2_ROOT
	$(error GXFORMAT2_ROOT is not set. Point it at your gxformat2 checkout.)
endif
	@test -d "$(WF_EXPECTATIONS_SRC)" || (echo "ERROR: $(WF_EXPECTATIONS_SRC) not found" && exit 1)
	@echo "Syncing expectation files from $(WF_EXPECTATIONS_SRC)..."
	mkdir -p $(WF_EXPECTATIONS_DST)
	cp $(WF_EXPECTATIONS_SRC)/*.yml $(WF_EXPECTATIONS_DST)/
	@echo "Synced $$(ls $(WF_EXPECTATIONS_DST)/*.yml | wc -l | tr -d ' ') expectation files."

# Sync workflow_state fixtures from Galaxy repo (3 source locations).
#   GALAXY_ROOT=~/projects/worktrees/galaxy/branch/wf_tool_state make sync-wfstate-fixtures
WFSTATE_SRC = $(GALAXY_ROOT)/test/unit/tool_util/workflow_state
WFSTATE_IWC_SRC = $(GALAXY_ROOT)/test/unit/workflows/iwc
WFSTATE_FWDATA_SRC = $(GALAXY_ROOT)/lib/galaxy_test/base/data
WFSTATE_DST = packages/schema/test/fixtures/workflow-state

sync-wfstate-fixtures:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
	@test -d "$(WFSTATE_SRC)/fixtures" || (echo "ERROR: $(WFSTATE_SRC)/fixtures not found" && exit 1)
	@echo "Syncing workflow_state fixtures from Galaxy..."
	mkdir -p $(WFSTATE_DST)/fixtures
	cp $(WFSTATE_SRC)/fixtures/synthetic-cat1-clean.ga $(WFSTATE_DST)/fixtures/
	cp $(WFSTATE_SRC)/fixtures/synthetic-cat1-stale.ga $(WFSTATE_DST)/fixtures/
	cp $(WFSTATE_SRC)/fixtures/synthetic-cat1.gxwf.yml $(WFSTATE_DST)/fixtures/
	cp $(WFSTATE_IWC_SRC)/RepeatMasking-Workflow.ga $(WFSTATE_DST)/fixtures/
	cp $(WFSTATE_IWC_SRC)/rnaseq-sr.ga $(WFSTATE_DST)/fixtures/
	cp $(WFSTATE_FWDATA_SRC)/test_workflow_1.ga $(WFSTATE_DST)/fixtures/
	cp $(WFSTATE_FWDATA_SRC)/test_workflow_2.ga $(WFSTATE_DST)/fixtures/
	@echo "Synced $$(ls $(WFSTATE_DST)/fixtures/* | wc -l | tr -d ' ') workflow_state fixtures."

# Sync workflow_state expectation YAMLs from Galaxy repo.
#   GALAXY_ROOT=~/projects/worktrees/galaxy/branch/wf_tool_state make sync-wfstate-expectations
WFSTATE_EXPECT_SRC = $(WFSTATE_SRC)/expectations

sync-wfstate-expectations:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
	@test -d "$(WFSTATE_EXPECT_SRC)" || (echo "ERROR: $(WFSTATE_EXPECT_SRC) not found" && exit 1)
	@echo "Syncing workflow_state expectations from $(WFSTATE_EXPECT_SRC)..."
	mkdir -p $(WFSTATE_DST)/expectations
	cp $(WFSTATE_EXPECT_SRC)/*.yml $(WFSTATE_DST)/expectations/
	@echo "Synced $$(ls $(WFSTATE_DST)/expectations/*.yml | wc -l | tr -d ' ') expectation files."

# Check whether synced files have diverged from their upstream sources (no overwrites).
check-sync-workflow-fixtures:
ifndef GXFORMAT2_ROOT
	$(error GXFORMAT2_ROOT is not set. Point it at your gxformat2 checkout.)
endif
	@echo "Checking workflow fixtures..."
	@ok=true; \
	for f in $(WF_EXAMPLES_SRC)/format2/synthetic-*.gxwf.yml; do \
		base=$$(basename "$$f"); \
		local=$(WF_FIXTURES_DST)/format2/$$base; \
		if [ -f "$$local" ] && ! diff -q "$$f" "$$local" >/dev/null 2>&1; then \
			echo "DIVERGED: $$base"; ok=false; \
		elif [ ! -f "$$local" ]; then \
			echo "MISSING:  $$base"; ok=false; \
		fi; \
	done; \
	for f in $(WF_EXAMPLES_SRC)/native/synthetic-*.ga $(WF_EXAMPLES_SRC)/native/real-*.ga; do \
		base=$$(basename "$$f"); \
		local=$(WF_FIXTURES_DST)/native/$$base; \
		if [ -f "$$local" ] && ! diff -q "$$f" "$$local" >/dev/null 2>&1; then \
			echo "DIVERGED: $$base"; ok=false; \
		elif [ ! -f "$$local" ]; then \
			echo "MISSING:  $$base"; ok=false; \
		fi; \
	done; \
	for f in $(WF_FIXTURES_DST)/format2/synthetic-*.gxwf.yml; do \
		base=$$(basename "$$f"); \
		if [ ! -f "$(WF_EXAMPLES_SRC)/format2/$$base" ]; then \
			echo "EXTRA:    $$base (not in gxformat2)"; ok=false; \
		fi; \
	done; \
	for f in $(WF_FIXTURES_DST)/native/synthetic-*.ga $(WF_FIXTURES_DST)/native/real-*.ga; do \
		base=$$(basename "$$f"); \
		if [ ! -f "$(WF_EXAMPLES_SRC)/native/$$base" ]; then \
			echo "EXTRA:    $$base (not in gxformat2)"; ok=false; \
		fi; \
	done; \
	if $$ok; then echo "Workflow fixtures in sync."; else echo "Run 'make sync-workflow-fixtures' to update."; exit 1; fi

check-sync-workflow-expectations:
ifndef GXFORMAT2_ROOT
	$(error GXFORMAT2_ROOT is not set. Point it at your gxformat2 checkout.)
endif
	@echo "Checking expectation files..."
	@ok=true; \
	for f in $(WF_EXPECTATIONS_SRC)/*.yml; do \
		base=$$(basename "$$f"); \
		local=$(WF_EXPECTATIONS_DST)/$$base; \
		if [ -f "$$local" ] && ! diff -q "$$f" "$$local" >/dev/null 2>&1; then \
			echo "DIVERGED: $$base"; ok=false; \
		elif [ ! -f "$$local" ]; then \
			echo "MISSING:  $$base"; ok=false; \
		fi; \
	done; \
	for f in $(WF_EXPECTATIONS_DST)/*.yml; do \
		base=$$(basename "$$f"); \
		if [ ! -f "$(WF_EXPECTATIONS_SRC)/$$base" ]; then \
			echo "EXTRA:    $$base (not in gxformat2)"; ok=false; \
		fi; \
	done; \
	if $$ok; then echo "Expectation files in sync."; else echo "Run 'make sync-workflow-expectations' to update."; exit 1; fi

check-sync-wfstate-fixtures:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
	@echo "Checking workflow_state fixtures..."
	@ok=true; \
	for f in synthetic-cat1-clean.ga synthetic-cat1-stale.ga synthetic-cat1.gxwf.yml; do \
		src=$(WFSTATE_SRC)/fixtures/$$f; \
		local=$(WFSTATE_DST)/fixtures/$$f; \
		if [ -f "$$local" ] && ! diff -q "$$src" "$$local" >/dev/null 2>&1; then \
			echo "DIVERGED: $$f"; ok=false; \
		elif [ ! -f "$$local" ]; then \
			echo "MISSING:  $$f"; ok=false; \
		fi; \
	done; \
	for f in RepeatMasking-Workflow.ga rnaseq-sr.ga; do \
		src=$(WFSTATE_IWC_SRC)/$$f; \
		local=$(WFSTATE_DST)/fixtures/$$f; \
		if [ -f "$$local" ] && ! diff -q "$$src" "$$local" >/dev/null 2>&1; then \
			echo "DIVERGED: $$f"; ok=false; \
		elif [ ! -f "$$local" ]; then \
			echo "MISSING:  $$f"; ok=false; \
		fi; \
	done; \
	for f in test_workflow_1.ga test_workflow_2.ga; do \
		src=$(WFSTATE_FWDATA_SRC)/$$f; \
		local=$(WFSTATE_DST)/fixtures/$$f; \
		if [ -f "$$local" ] && ! diff -q "$$src" "$$local" >/dev/null 2>&1; then \
			echo "DIVERGED: $$f"; ok=false; \
		elif [ ! -f "$$local" ]; then \
			echo "MISSING:  $$f"; ok=false; \
		fi; \
	done; \
	if $$ok; then echo "Workflow_state fixtures in sync."; else echo "Run 'make sync-wfstate-fixtures' to update."; exit 1; fi

check-sync-wfstate-expectations:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
	@echo "Checking workflow_state expectations..."
	@ok=true; \
	for f in $(WFSTATE_EXPECT_SRC)/*.yml; do \
		base=$$(basename "$$f"); \
		local=$(WFSTATE_DST)/expectations/$$base; \
		if [ -f "$$local" ] && ! diff -q "$$f" "$$local" >/dev/null 2>&1; then \
			echo "DIVERGED: $$base"; ok=false; \
		elif [ ! -f "$$local" ]; then \
			echo "MISSING:  $$base"; ok=false; \
		fi; \
	done; \
	for f in $(WFSTATE_DST)/expectations/*.yml; do \
		base=$$(basename "$$f"); \
		if [ ! -f "$(WFSTATE_EXPECT_SRC)/$$base" ]; then \
			echo "EXTRA:    $$base (not in Galaxy)"; ok=false; \
		fi; \
	done; \
	if $$ok; then echo "Workflow_state expectations in sync."; else echo "Run 'make sync-wfstate-expectations' to update."; exit 1; fi

# Run whichever check-sync targets are possible given available env vars.
check-sync:
	@failed=false; \
	if [ -n "$(GXFORMAT2_ROOT)" ]; then \
		$(MAKE) check-sync-workflow-fixtures || failed=true; \
		$(MAKE) check-sync-workflow-expectations || failed=true; \
	else \
		echo "SKIP: check-sync-workflow-{fixtures,expectations} (GXFORMAT2_ROOT not set)"; \
	fi; \
	if [ -n "$(GALAXY_ROOT)" ]; then \
		$(MAKE) check-sync-wfstate-fixtures || failed=true; \
		$(MAKE) check-sync-wfstate-expectations || failed=true; \
	else \
		echo "SKIP: check-sync-wfstate-{fixtures,expectations} (GALAXY_ROOT not set)"; \
	fi; \
	if $$failed; then exit 1; fi

# Requires both GALAXY_ROOT and GXFORMAT2_ROOT. Run individual targets if you only have one.
sync: sync-golden sync-param-spec sync-schema-sources sync-workflow-fixtures sync-workflow-expectations sync-wfstate-fixtures sync-wfstate-expectations

# Sync schema-salad YAML sources from gxformat2 for workflow schema generation.
# Set GXFORMAT2_ROOT to your gxformat2 checkout, e.g.:
#   GXFORMAT2_ROOT=~/projects/worktrees/gxformat2/branch/abstraction_applications make sync-schema-sources
SCHEMA_SRC_ROOT = $(GXFORMAT2_ROOT)/schema
SCHEMA_DST = schema-sources

sync-schema-sources:
ifndef GXFORMAT2_ROOT
	$(error GXFORMAT2_ROOT is not set. Point it at your gxformat2 checkout.)
endif
	@test -d "$(SCHEMA_SRC_ROOT)/v19_09" || (echo "ERROR: $(SCHEMA_SRC_ROOT)/v19_09 not found" && exit 1)
	@test -d "$(SCHEMA_SRC_ROOT)/native_v0_1" || (echo "ERROR: $(SCHEMA_SRC_ROOT)/native_v0_1 not found" && exit 1)
	@echo "Syncing schema-salad sources from $(SCHEMA_SRC_ROOT)..."
	rm -rf $(SCHEMA_DST)
	mkdir -p $(SCHEMA_DST)/v19_09 $(SCHEMA_DST)/native_v0_1 $(SCHEMA_DST)/common
	cp $(SCHEMA_SRC_ROOT)/v19_09/workflow.yml $(SCHEMA_DST)/v19_09/
	cp $(SCHEMA_SRC_ROOT)/v19_09/Process.yml $(SCHEMA_DST)/v19_09/
	@if [ -d "$(SCHEMA_SRC_ROOT)/v19_09/examples" ]; then cp -r $(SCHEMA_SRC_ROOT)/v19_09/examples $(SCHEMA_DST)/v19_09/; fi
	cp $(SCHEMA_SRC_ROOT)/native_v0_1/workflow.yml $(SCHEMA_DST)/native_v0_1/
	cp $(SCHEMA_SRC_ROOT)/common/common.yml $(SCHEMA_DST)/common/
	@if [ -f "$(SCHEMA_SRC_ROOT)/common/steps_description.txt" ]; then cp $(SCHEMA_SRC_ROOT)/common/steps_description.txt $(SCHEMA_DST)/common/; fi
	@if [ -d "$(SCHEMA_SRC_ROOT)/common/metaschema" ]; then cp -r $(SCHEMA_SRC_ROOT)/common/metaschema $(SCHEMA_DST)/common/; fi
	@echo "Schema sources synced to $(SCHEMA_DST)/."

# Generate TypeScript and Effect schemas from synced schema-salad YAML sources.
# Requires schema-salad-plus-pydantic >= 0.1.5 (uv tool or pip install).
# Set SCHEMA_SALAD_PLUS_PYDANTIC to override the command (default: schema-salad-plus-pydantic).
SCHEMA_SALAD_PLUS_PYDANTIC ?= schema-salad-plus-pydantic
WF_SCHEMA_DST = packages/schema/src/workflow/raw

generate-schemas:
	@test -f "$(SCHEMA_DST)/v19_09/workflow.yml" || (echo "ERROR: schema sources not found — run 'make sync-schema-sources' first" && exit 1)
	mkdir -p $(WF_SCHEMA_DST)
	$(SCHEMA_SALAD_PLUS_PYDANTIC) generate --format typescript "$(CURDIR)/$(SCHEMA_DST)/v19_09/workflow.yml" -o "$(CURDIR)/$(WF_SCHEMA_DST)/gxformat2.ts"
	$(SCHEMA_SALAD_PLUS_PYDANTIC) generate --format effect-schema "$(CURDIR)/$(SCHEMA_DST)/v19_09/workflow.yml" -o "$(CURDIR)/$(WF_SCHEMA_DST)/gxformat2.effect.ts"
	$(SCHEMA_SALAD_PLUS_PYDANTIC) generate --format typescript "$(CURDIR)/$(SCHEMA_DST)/native_v0_1/workflow.yml" -o "$(CURDIR)/$(WF_SCHEMA_DST)/native.ts"
	$(SCHEMA_SALAD_PLUS_PYDANTIC) generate --format effect-schema "$(CURDIR)/$(SCHEMA_DST)/native_v0_1/workflow.yml" -o "$(CURDIR)/$(WF_SCHEMA_DST)/native.effect.ts"
	@echo "Generated workflow schemas in $(WF_SCHEMA_DST)/."

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
