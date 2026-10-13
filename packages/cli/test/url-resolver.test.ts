import { describe, it, expect } from "vitest";

import { expandedNative } from "@galaxy-tool-util/schema";
import { createDefaultResolver } from "../src/commands/url-resolver.js";

const TRS_BASE = "https://dockstore.org/api/ga4gh/trs/v2/tools";
const TRS_URL = `${TRS_BASE}/#workflow/github.com/iwc-workflows/rnaseq-pe/main/versions/v1.5`;
const DESCRIPTOR_URL = `${TRS_BASE}/%23workflow%2Fgithub.com%2Fiwc-workflows%2Frnaseq-pe%2Fmain/versions/v1.5/GALAXY/descriptor`;

const NESTED = {
  a_galaxy_workflow: "true",
  "format-version": "0.1",
  name: "Nested",
  steps: { "0": { id: 0, type: "data_input", label: "inner_input", tool_state: "{}" } },
};

function recordingFetcher(body: unknown): { fetcher: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("createDefaultResolver", () => {
  it.each([
    ["unencoded tool id", TRS_URL],
    [
      "encoded tool id",
      `${TRS_BASE}/%23workflow%2Fgithub.com%2Fiwc-workflows%2Frnaseq-pe%2Fmain/versions/v1.5`,
    ],
    ["descriptor URL", `${TRS_URL}/GALAXY/descriptor`],
  ])("fetches the encoded GALAXY descriptor for a TRS URL (%s)", async (_name, ref) => {
    const { fetcher, calls } = recordingFetcher({ content: JSON.stringify(NESTED) });
    const result = await createDefaultResolver({ fetcher })(ref);
    expect(calls).toEqual([DESCRIPTOR_URL]);
    expect(result).toEqual(NESTED);
  });

  it("throws a clear error when the TRS response has no content", async () => {
    const { fetcher } = recordingFetcher([{ id: "#workflow/github.com/x/y" }]);
    await expect(createDefaultResolver({ fetcher })(TRS_URL)).rejects.toThrow(
      `TRS descriptor at ${DESCRIPTOR_URL} has no string 'content' field`,
    );
  });

  it("fetches plain URLs unchanged", async () => {
    const { fetcher, calls } = recordingFetcher(NESTED);
    const result = await createDefaultResolver({ fetcher })("https://example.org/inner.ga");
    expect(calls).toEqual(["https://example.org/inner.ga"]);
    expect(result).toEqual(NESTED);
  });

  it("expands a native workflow with a TRS-linked subworkflow step", async () => {
    const { fetcher, calls } = recordingFetcher({ content: JSON.stringify(NESTED) });
    const outer = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      name: "Outer",
      steps: {
        "0": {
          id: 0,
          type: "subworkflow",
          label: "linked",
          content_source: "trs_url",
          content_id: TRS_URL,
        },
      },
    };
    const expanded = await expandedNative(outer, { resolver: createDefaultResolver({ fetcher }) });
    expect(calls).toEqual([DESCRIPTOR_URL]);
    expect(expanded.steps["0"].subworkflow?.name).toBe("Nested");
  });
});
