.PHONY: all lint format typecheck test test-e2e check fix format-fix sync-golden sync-param-spec sync-workflow-fixtures sync-workflow-expectations sync sync-schema-sources generate-schemas verify-golden check-sync check-sync-workflow-fixtures check-sync-workflow-expectations sync-wfstate-fixtures sync-wfstate-expectations check-sync-wfstate-fixtures check-sync-wfstate-expectations sync-wfstate-templates check-sync-wfstate-templates sync-glossary build-glossary check-sync-all

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
	pnpm -r --filter "!@galaxy-tool-util/gxwf-e2e" test

test-e2e:
	pnpm --filter @galaxy-tool-util/gxwf-e2e test

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

# Sync fixture files from gxformat2 / Galaxy using rsync.
# Mappings are declared in scripts/sync-manifest.json.
# Individual targets sync one group; 'check-sync' checks all available groups.
#
# Examples:
#   GXFORMAT2_ROOT=~/projects/worktrees/gxformat2/branch/main make sync-workflow-fixtures
#   GALAXY_ROOT=~/projects/worktrees/galaxy/branch/main make sync-wfstate-fixtures
#   GALAXY_ROOT=... GXFORMAT2_ROOT=... make check-sync

sync-workflow-fixtures:
	node scripts/sync-fixtures.mjs --sync --group workflow-fixtures

sync-workflow-expectations:
	node scripts/sync-fixtures.mjs --sync --group workflow-expectations

sync-wfstate-fixtures:
	node scripts/sync-fixtures.mjs --sync --group wfstate-fixtures

sync-wfstate-expectations:
	node scripts/sync-fixtures.mjs --sync --group wfstate-expectations

sync-wfstate-templates:
	node scripts/sync-fixtures.mjs --sync --group wfstate-templates

check-sync-workflow-fixtures:
	node scripts/sync-fixtures.mjs --check --group workflow-fixtures

check-sync-workflow-expectations:
	node scripts/sync-fixtures.mjs --check --group workflow-expectations

check-sync-wfstate-fixtures:
	node scripts/sync-fixtures.mjs --check --group wfstate-fixtures

check-sync-wfstate-expectations:
	node scripts/sync-fixtures.mjs --check --group wfstate-expectations

check-sync-wfstate-templates:
	node scripts/sync-fixtures.mjs --check --group wfstate-templates

# Run all groups that have their src_root env var set; skip the rest.
check-sync:
	node scripts/sync-fixtures.mjs --check

# Sync Galaxy's terms.yml for the glossary.
#   GALAXY_ROOT=~/projects/repositories/galaxy make sync-glossary
GLOSSARY_SRC = $(GALAXY_ROOT)/lib/galaxy/schema/terms.yml
GLOSSARY_DST = docs/glossary/galaxy-terms.yml

sync-glossary:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
	@test -f "$(GLOSSARY_SRC)" || (echo "ERROR: $(GLOSSARY_SRC) not found" && exit 1)
	@echo "Syncing Galaxy terms.yml..."
	cp $(GLOSSARY_SRC) $(GLOSSARY_DST)
	@echo "Synced."

# Merge galaxy-terms.yml + tool-util-terms.yml → docs/glossary.md
build-glossary:
	@node scripts/build-glossary.mjs

# Full sync + regenerate + verify. Requires both GALAXY_ROOT and GXFORMAT2_ROOT.
sync:
ifndef GALAXY_ROOT
	$(error GALAXY_ROOT is not set. Point it at your Galaxy checkout.)
endif
ifndef GXFORMAT2_ROOT
	$(error GXFORMAT2_ROOT is not set. Point it at your gxformat2 checkout.)
endif
	$(MAKE) sync-golden sync-param-spec sync-schema-sources sync-workflow-fixtures sync-workflow-expectations sync-wfstate-fixtures sync-wfstate-expectations sync-wfstate-templates sync-glossary
	$(MAKE) generate-schemas build-glossary
	$(MAKE) verify-golden

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
