/**
 * Sweep tests: validate real IWC workflows against the TS validation code.
 *
 * Gated on GALAXY_TEST_IWC_DIRECTORY — skipped unless set.
 * Uses the default tool cache (~/.galaxy/tool_info_cache/) — skips steps
 * whose tools aren't cached (no auto-population from ToolShed).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ToolCache } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  checkStrictEncoding,
  checkStrictStructure,
  cleanWorkflow,
  SKIP_STATUSES,
  validateTestsFile,
} from "@galaxy-tool-util/schema";
import {
  validateNativeSteps,
  type StepValidationResult,
} from "../src/commands/validate-workflow.js";
import { validateNativeStepsJsonSchema } from "../src/commands/validate-workflow-json-schema.js";
import { lintWorkflowReport } from "../src/commands/lint.js";

const IWC_DIR = process.env.GALAXY_TEST_IWC_DIRECTORY;

async function discoverNativeWorkflows(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".ga")) {
      results.push(join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  return results.sort();
}

function workflowId(path: string): string {
  return relative(`${IWC_DIR}/workflows`, path);
}

function runSweep(
  label: string,
  validateFn: (data: Record<string, unknown>, cache: ToolCache) => Promise<StepValidationResult[]>,
) {
  describe.skipIf(!IWC_DIR)(`IWC sweep: ${label}`, { timeout: 300_000 }, () => {
    let workflows: string[];
    let cache: ToolCache;

    beforeAll(async () => {
      workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
      cache = makeNodeToolCache();
      await cache.index.load();
    });

    it("discovers IWC workflows", () => {
      expect(workflows.length).toBeGreaterThan(0);
    });

    it(`validates all native workflows (${label})`, async () => {
      const failures: Array<{ workflow: string; step: StepValidationResult }> = [];
      let validated = 0;
      let skipped = 0;
      let parseErrors = 0;

      for (const wfPath of workflows) {
        const raw = await readFile(wfPath, "utf-8");
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(raw);
        } catch {
          parseErrors++;
          continue;
        }

        const results = await validateFn(data, cache);

        for (const r of results) {
          if (SKIP_STATUSES.has(r.status)) {
            skipped++;
          } else if (r.status === "fail") {
            failures.push({ workflow: workflowId(wfPath), step: r });
          } else {
            validated++;
          }
        }
      }

      console.log(
        `\nIWC sweep (${label}): ${validated} steps validated, ${skipped} skipped, ${failures.length} failed`,
      );
      console.log(
        `  across ${workflows.length} workflows${parseErrors ? `, ${parseErrors} parse errors` : ""}`,
      );

      if (failures.length > 0) {
        const details = failures
          .map(
            (f) =>
              `  ${f.workflow} [${f.step.step}] ${f.step.tool_id}: ${f.step.errors.join("; ")}`,
          )
          .join("\n");
        expect.fail(`${failures.length} validation failures:\n${details}`);
      }
    });
  });
}

runSweep("native validation", validateNativeSteps);
runSweep("native JSON Schema validation", validateNativeStepsJsonSchema);

// --- Strict sweep suites ---

// Older IWC workflows with deprecated position sub-fields (bottom, height,
// right, width, x, y) intentionally dropped from the strict structure model.
// Keep in sync with test_iwc_sweep.py _STRICT_STRUCTURE_SKIP.
const STRICT_STRUCTURE_SKIP: ReadonlySet<string> = new Set([
  "computational-chemistry/fragment-based-docking-scoring/fragment-based-docking-scoring.ga",
  "computational-chemistry/protein-ligand-complex-parameterization/protein-ligand-complex-parameterization.ga",
  "sars-cov-2-variant-calling/sars-cov-2-ont-artic-variant-calling/ont-artic-variation.ga",
  "sars-cov-2-variant-calling/sars-cov-2-pe-illumina-wgs-variant-calling/pe-wgs-variation.ga",
]);

describe.skipIf(!IWC_DIR)("IWC sweep: strict-encoding", { timeout: 300_000 }, () => {
  let workflows: string[];

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
  });

  it("all IWC native workflows pass strict-encoding after clean", async () => {
    const failures: Array<{ workflow: string; errors: string[] }> = [];
    for (const wfPath of workflows) {
      const raw = readFileSync(wfPath, "utf-8");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      // Raw .ga stores each step's tool_state as a JSON string. Strict-encoding
      // (tool_state must be a parsed dict) is a post-clean invariant — clean
      // decodes the string. Mirrors Python TestIWCSweepStrictEncodingClean.
      await cleanWorkflow(data);
      const errors = checkStrictEncoding(data, "native");
      if (errors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), errors });
      }
    }

    if (failures.length > 0) {
      const details = failures.map((f) => `  ${f.workflow}: ${f.errors.join("; ")}`).join("\n");
      expect.fail(`${failures.length} encoding failures:\n${details}`);
    }
  });
});

describe.skipIf(!IWC_DIR)("IWC sweep: strict-structure", { timeout: 300_000 }, () => {
  let workflows: string[];

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
  });

  it("all IWC native workflows pass strict-structure", () => {
    const failures: Array<{ workflow: string; errors: string[] }> = [];
    for (const wfPath of workflows) {
      if (STRICT_STRUCTURE_SKIP.has(workflowId(wfPath))) continue;
      const raw = readFileSync(wfPath, "utf-8");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const errors = checkStrictStructure(data, "native");
      if (errors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), errors });
      }
    }

    if (failures.length > 0) {
      const details = failures.map((f) => `  ${f.workflow}: ${f.errors.join("; ")}`).join("\n");
      expect.fail(`${failures.length} structure failures:\n${details}`);
    }
  });
});

describe.skipIf(!IWC_DIR)("IWC sweep: strict (all)", { timeout: 300_000 }, () => {
  let workflows: string[];
  let cache: ToolCache;

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
    cache = makeNodeToolCache();
    await cache.index.load();
  });

  it("all IWC native workflows pass strict validation", async () => {
    const failures: Array<{ workflow: string; phase: string; errors: string[] }> = [];
    let skippedSteps = 0;

    for (const wfPath of workflows) {
      if (STRICT_STRUCTURE_SKIP.has(workflowId(wfPath))) continue;
      const raw = readFileSync(wfPath, "utf-8");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      // Structure on raw input (before clean mutates tool_state).
      const structErrors = checkStrictStructure(data, "native");
      if (structErrors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), phase: "structure", errors: structErrors });
        continue;
      }

      // Clean, then strict-encoding — clean decodes the JSON-string tool_state
      // into a dict, so strict-encoding is a post-clean invariant.
      await cleanWorkflow(data);
      const encErrors = checkStrictEncoding(data, "native");
      if (encErrors.length > 0) {
        failures.push({ workflow: workflowId(wfPath), phase: "encoding", errors: encErrors });
        continue;
      }

      // State: count steps strict-state would reject as skips.
      const results = await validateNativeSteps(data, cache);
      const skips = results.filter((r) => SKIP_STATUSES.has(r.status));
      skippedSteps += skips.length;
    }

    console.log(`\nIWC strict sweep: ${skippedSteps} steps would be skipped by strict-state`);

    if (failures.length > 0) {
      const details = failures
        .map((f) => `  ${f.workflow} [${f.phase}]: ${f.errors.join("; ")}`)
        .join("\n");
      expect.fail(`${failures.length} strict failures:\n${details}`);
    }
  });
});

// --- Lint-stateful sweep ---

// Run the unified lint pipeline (structural + best-practices + tool-state
// validation) over every IWC native workflow. Mirrors Python
// TestIWCSweepLintStateful: the bar is "lint runs to completion without
// crashing." Lint warnings/errors and uncached-tool state skips are expected
// on a real corpus and are reported, not failed.
describe.skipIf(!IWC_DIR)("IWC sweep: lint-stateful", { timeout: 600_000 }, () => {
  let workflows: string[];
  let cache: ToolCache;

  beforeAll(async () => {
    workflows = await discoverNativeWorkflows(join(IWC_DIR!, "workflows"));
    cache = makeNodeToolCache();
    await cache.index.load();
  });

  it("lints all native workflows without crashing", async () => {
    const crashes: Array<{ workflow: string; error: string }> = [];
    let lintErrors = 0;
    let lintWarnings = 0;
    let stateValidated = 0;
    let stateSkipped = 0;
    let stateFailed = 0;

    for (const wfPath of workflows) {
      const id = workflowId(wfPath);
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(readFileSync(wfPath, "utf-8"));
      } catch {
        continue;
      }
      try {
        const report = await lintWorkflowReport(wfPath, data, "native", { cache });
        lintErrors += report.structural.error_count + (report.bestPractices?.error_count ?? 0);
        lintWarnings += report.structural.warn_count + (report.bestPractices?.warn_count ?? 0);
        for (const r of report.stateValidation ?? []) {
          if (SKIP_STATUSES.has(r.status)) stateSkipped++;
          else if (r.status === "fail") stateFailed++;
          else stateValidated++;
        }
      } catch (err) {
        crashes.push({ workflow: id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    console.log(
      `\nIWC lint-stateful sweep: ${workflows.length} workflows, ${lintErrors} lint errors, ${lintWarnings} lint warnings`,
    );
    console.log(
      `  tool state: ${stateValidated} validated, ${stateSkipped} skipped, ${stateFailed} failed`,
    );

    if (crashes.length > 0) {
      const details = crashes.map((c) => `  ${c.workflow}: ${c.error}`).join("\n");
      expect.fail(`${crashes.length} workflow(s) crashed during lint:\n${details}`);
    }
  });
});

// --- Tests-file sweep ---

const TESTS_FILE_SUFFIXES = ["-tests.yml", "-tests.yaml", "-test.yml", "-test.yaml"];

async function discoverTestsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && TESTS_FILE_SUFFIXES.some((s) => entry.name.endsWith(s))) {
      results.push(join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  return results.sort();
}

// IWC tests files currently rejected by Galaxy's own `Tests` model (verified:
// this ajv validation and Python `model_validate` agree exactly). These are
// real IWC authoring-drift issues pending upstream fixes — duplicate YAML map
// keys, legacy/unknown fields, class-less collection assertions, and `type:`
// used as a `collection_type` alias. Excluded so the sweep flags only NEW
// drift and regressions. Keep in sync with test_iwc_sweep.py _TESTS_FILE_SKIP.
// TODO(iwc): fix these upstream and prune this list as fixes land.
const KNOWN_INVALID_TESTS_FILES: ReadonlySet<string> = new Set([
  "VGP-assembly-v2/Assembly-Hifi-HiC-phasing-VGP4/Assembly-Hifi-HiC-phasing-VGP4-tests.yml",
  "VGP-assembly-v2/Plot-Nx-Size/Generate-Nx-and-Size-plots-for-multiple-assemblies-tests.yml",
  "VGP-assembly-v2/Purge-duplicate-contigs-VGP6/Purge-duplicate-contigs-VGP6-tests.yml",
  "VGP-assembly-v2/Purge-duplicates-one-haplotype-VGP6b/Purging-duplicates-one-haplotype-VGP6b-tests.yml",
  "VGP-assembly-v2/Scaffolding-HiC-VGP8/Scaffolding-HiC-VGP8-tests.yml",
  "VGP-assembly-v2/hi-c-contact-map-for-assembly-manual-curation/hi-c-map-for-assembly-manual-curation-tests.yml",
  "VGP-assembly-v2/kmer-profiling-hifi-trio-VGP2/kmer-profiling-hifi-trio-VGP2-tests.yml",
  "amplicon/amplicon-mgnify/mgnify-amplicon-pipeline-v5-complete/mgnify-amplicon-pipeline-v5-complete-tests.yml",
  "amplicon/amplicon-mgnify/mgnify-amplicon-pipeline-v5-its/mgnify-amplicon-pipeline-v5-its-tests.yml",
  "amplicon/amplicon-mgnify/mgnify-amplicon-pipeline-v5-quality-control-paired-end/mgnify-amplicon-pipeline-v5-quality-control-paired-end-tests.yml",
  "amplicon/amplicon-mgnify/mgnify-amplicon-pipeline-v5-quality-control-single-end/mgnify-amplicon-pipeline-v5-quality-control-single-end-tests.yml",
  "amplicon/amplicon-mgnify/mgnify-amplicon-pipeline-v5-rrna-prediction/mgnify-amplicon-pipeline-v5-rrna-prediction-tests.yml",
  "amplicon/dada2/dada2_paired-tests.yml",
  "amplicon/qiime2/qiime2-III-VI-downsteam/QIIME2-VI-diversity-metrics-and-estimations-tests.yml",
  "bacterial_genomics/bacterial-quality-and-contamination-control-post-assembly/bacterial_quality_and_contamination_control_post_assembly-tests.yml",
  "comparative_genomics/hyphy/capheine-core-and-compare-tests.yml",
  "comparative_genomics/hyphy/hyphy-compare-tests.yml",
  "comparative_genomics/hyphy/hyphy-core-tests.yml",
  "comparative_genomics/hyphy/hyphy-preprocessing-tests.yml",
  "computational-chemistry/fragment-based-docking-scoring/fragment-based-docking-scoring-tests.yml",
  "computational-chemistry/gromacs-dctmd/gromacs-dctmd-tests.yml",
  "computational-chemistry/gromacs-mmgbsa/gromacs-mmgbsa-tests.yml",
  "data-fetching/parallel-accession-download/parallel-accession-download-tests.yml",
  "data-fetching/sra-manifest-to-concatenated-fastqs/sra-manifest-to-concatenated-fastqs-tests.yml",
  "epigenetics/atacseq/atacseq-tests.yml",
  "epigenetics/average-bigwig-between-replicates/average-bigwig-between-replicates-tests.yml",
  "epigenetics/chipseq-pe/chipseq-pe-tests.yml",
  "epigenetics/chipseq-sr/chipseq-sr-tests.yml",
  "epigenetics/consensus-peaks/consensus-peaks-atac-cutandrun-tests.yml",
  "epigenetics/consensus-peaks/consensus-peaks-chip-pe-tests.yml",
  "epigenetics/consensus-peaks/consensus-peaks-chip-sr-tests.yml",
  "epigenetics/cutandrun/cutandrun-tests.yml",
  "epigenetics/hic-hicup-cooler/chic-fastq-to-cool-hicup-cooler-tests.yml",
  "epigenetics/hic-hicup-cooler/hic-fastq-to-cool-hicup-cooler-tests.yml",
  "epigenetics/hic-hicup-cooler/hic-fastq-to-pairs-hicup-tests.yml",
  "epigenetics/hic-hicup-cooler/hic-juicermediumtabix-to-cool-cooler-tests.yml",
  "genome-assembly/bacterial-genome-assembly/bacterial_genome_assembly-tests.yml",
  "genome-assembly/quality-and-contamination-control-raw-reads/quality_and_contamination_control_raw_reads-tests.yml",
  "genome_annotation/annotation-braker3/Genome_annotation_with_braker3-tests.yml",
  "genome_annotation/annotation-helixer/Galaxy-Workflow-annotation_helixer-tests.yml",
  "genome_annotation/functional-annotation/functional-annotation-of-sequences/Functional_annotation_of_sequences-tests.yml",
  "genome_annotation/lncRNAs-annotation/Galaxy-Workflow-lncRNAs_annotation_workflow-tests.yml",
  "imaging/fluorescence-nuclei-segmentation-and-counting/segmentation-and-counting-tests.yml",
  "imaging/histological-staining-area-quantification/histological-staining-area-quantification-tests.yml",
  "imaging/tissue-microarray-analysis/multiplex-tissue-microarray-analysis/multiplex-tma-tests.yml",
  "imaging/tissue-microarray-analysis/tissue-microarray-analysis/tissue-micro-array-analysis-tests.yml",
  "metabolomics/mfassignr/mfassignr-tests.yml",
  "microbiome/binning-evaluation/MAGs-binning-evaluation-tests.yml",
  "microbiome/host-contamination-removal/host-contamination-removal-long-reads/host-or-contamination-removal-on-long-reads-tests.yml",
  "microbiome/host-contamination-removal/host-contamination-removal-short-reads/host-or-contamination-removal-on-short-reads-tests.yml",
  "microbiome/mags-building/MAGs-generation-tests.yml",
  "microbiome/mags-taxonomy-annotation/MAGs-taxonomy-annotation-tests.yml",
  "microbiome/metagenomic-genes-catalogue/metagenomic-genes-catalogue-tests.yml",
  "microbiome/metagenomic-raw-reads-amr-analysis/metagenomic-raw-reads-amr-analysis-tests.yml",
  "microbiome/pathogen-identification/nanopore-pre-processing/Nanopore-Pre-Processing-tests.yml",
  "microbiome/pathogen-identification/pathogen-detection-pathogfair-samples-aggregation-and-visualisation/Pathogen-Detection-PathoGFAIR-Samples-Aggregation-and-Visualisation-tests.yml",
  "microbiome/pathogen-identification/taxonomy-profiling-and-visualization-with-krona/Taxonomy-Profiling-and-Visualization-with-Krona-tests.yml",
  "proteomics/openms-metaprosip/metaprosip-tests.yml",
  "read-preprocessing/short-read-qc-trimming/short-read-quality-control-and-trimming-tests.yml",
  "sars-cov-2-variant-calling/sars-cov-2-ont-artic-variant-calling/ont-artic-variation-tests.yml",
  "sars-cov-2-variant-calling/sars-cov-2-pe-illumina-artic-ivar-analysis/pe-wgs-ivar-analysis-test.yml",
  "sars-cov-2-variant-calling/sars-cov-2-pe-illumina-artic-variant-calling/pe-artic-variation-tests.yml",
  "sars-cov-2-variant-calling/sars-cov-2-pe-illumina-wgs-variant-calling/pe-wgs-variation-tests.yml",
  "sars-cov-2-variant-calling/sars-cov-2-se-illumina-wgs-variant-calling/se-wgs-variation-tests.yml",
  "scRNAseq/baredsc/baredSC-1d-logNorm-tests.yml",
  "scRNAseq/baredsc/baredSC-2d-logNorm-tests.yml",
  "scRNAseq/fastq-to-matrix-10x/scrna-seq-fastq-to-matrix-10x-cellplex-tests.yml",
  "scRNAseq/fastq-to-matrix-10x/scrna-seq-fastq-to-matrix-10x-v3-tests.yml",
  "scRNAseq/pseudobulk-worflow-decoupler-edger/pseudo-bulk_edgeR-tests.yml",
  "scRNAseq/scanpy-clustering/Preprocessing-and-Clustering-of-single-cell-RNA-seq-data-with-Scanpy-tests.yml",
  "scRNAseq/velocyto/Velocyto-on10X-filtered-barcodes-tests.yml",
  "scRNAseq/velocyto/Velocyto-on10X-from-bundled-tests.yml",
  "transcriptomics/rnaseq-de/rnaseq-de-filtering-plotting-tests.yml",
  "transcriptomics/rnaseq-pe/rnaseq-pe-tests.yml",
  "transcriptomics/rnaseq-sr/rnaseq-sr-tests.yml",
  "variant-calling/generic-variant-calling-wgs-pe/Generic-variation-analysis-on-WGS-PE-data-tests.yml",
  "variant-calling/haploid-variant-calling-wgs-pe/WGS-PE-variant-calling-in-haploid-system-tests.yml",
  "variant-calling/ploidy-aware-genotype-calling/genotype-variant-calling-wgs-pe-test.yml",
  "variant-calling/variation-reporting/Generic-variation-analysis-reporting-tests.yml",
  "virology/generic-non-segmented-viral-variant-calling/pe-illumina-simple-virus-calling-and-consensus-test.yml",
  "virology/influenza-isolates-consensus-and-subtyping/influenza-consensus-and-subtyping-test.yml",
  "virology/pox-virus-amplicon/pox-virus-half-genome-tests.yml",
]);

// Schema-validate every IWC workflow-tests file against the Tests model.
// Mirrors Python TestIWCSweepValidateTests. Known-invalid files (above) are
// excluded; a failure here means a not-yet-known drift file or a regression.
describe.skipIf(!IWC_DIR)("IWC sweep: tests-file validation", { timeout: 300_000 }, () => {
  let testsFiles: string[];

  beforeAll(async () => {
    testsFiles = await discoverTestsFiles(join(IWC_DIR!, "workflows"));
  });

  it("discovers IWC tests files", () => {
    expect(testsFiles.length).toBeGreaterThan(0);
  });

  it("all IWC tests files pass schema validation", async () => {
    const failures: Array<{ file: string; errors: string[] }> = [];
    let knownInvalid = 0;

    for (const testsPath of testsFiles) {
      const id = relative(join(IWC_DIR!, "workflows"), testsPath);
      if (KNOWN_INVALID_TESTS_FILES.has(id)) {
        knownInvalid++;
        continue;
      }
      let parsed: unknown;
      try {
        // Default parse errors on duplicate map keys, matching Galaxy's
        // ordered_load (which raises ConstructorError on dup keys) — a
        // dup-key tests file is treated as a failure on both sides.
        parsed = parseYaml(await readFile(testsPath, "utf-8"));
      } catch (err) {
        failures.push({
          file: id,
          errors: [`YAML parse error: ${err instanceof Error ? err.message : String(err)}`],
        });
        continue;
      }

      const { valid, errors } = validateTestsFile(parsed);
      if (!valid) {
        failures.push({
          file: id,
          errors: errors.map((d) => `${d.path || "(root)"}: ${d.message}`),
        });
      }
    }

    const checked = testsFiles.length - knownInvalid;
    console.log(
      `\nIWC tests-file sweep: ${checked - failures.length}/${checked} files valid (${knownInvalid} known-invalid excluded)`,
    );

    if (failures.length > 0) {
      const details = failures
        .slice(0, 20)
        .map((f) => `  ${f.file}:\n    ${f.errors.slice(0, 5).join("\n    ")}`)
        .join("\n");
      const truncated = failures.length > 20 ? `\n  ... and ${failures.length - 20} more` : "";
      expect.fail(
        `${failures.length} tests file(s) failed schema validation:\n${details}${truncated}`,
      );
    }
  });
});
