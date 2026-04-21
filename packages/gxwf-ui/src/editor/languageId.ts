// Filename → language id. Three IDs are contributed by the Galaxy Workflows
// extension: `galaxyworkflow` (legacy .ga native JSON), `gxformat2` (YAML
// format2), and `gxwftests` (workflow test YAML). `plaintext` is the fallback
// — Monaco's built-in id for unknown files.

export const GXWF_LANGUAGE_IDS = ["galaxyworkflow", "gxformat2", "gxwftests"] as const;
export type GxwfLanguageId = (typeof GXWF_LANGUAGE_IDS)[number] | "plaintext";

const TEST_SUFFIX_RE = /-tests?\.ya?ml$/i;
const FORMAT2_SUFFIX_RE = /\.gxwf\.ya?ml$/i;

export function resolveLanguageId(fileName: string): GxwfLanguageId {
  const lower = fileName.toLowerCase();
  if (TEST_SUFFIX_RE.test(lower)) return "gxwftests";
  if (FORMAT2_SUFFIX_RE.test(lower)) return "gxformat2";
  if (lower.endsWith(".ga")) return "galaxyworkflow";
  return "plaintext";
}
