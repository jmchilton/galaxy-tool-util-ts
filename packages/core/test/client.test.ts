import { describe, it, expect } from "vitest";
import { fetchFromToolShed, fetchFromGalaxy, ToolFetchError } from "../src/client/index.js";
import fastqcFixture from "./fixtures/fastqc-parsed-tool.json" with { type: "json" };

function mockFetch(responseBody: unknown, status = 200): typeof fetch {
  return async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function mockFetchError(status: number, body = "Not found"): typeof fetch {
  return async () => {
    return new Response(body, { status });
  };
}

describe.each([
  [
    "Tool Shed",
    (body: unknown, url = "https://example.org") =>
      fetchFromToolShed(url, "test~tool~id", "1.0", mockFetch(body)),
  ],
  [
    "Galaxy",
    (body: unknown, url = "https://example.org") =>
      fetchFromGalaxy(url, "tool", "1.0", mockFetch(body)),
  ],
] as const)("%s compact decode diagnostics", (_source, fetchTool) => {
  it.each([
    { name: "null payload", body: null, path: "[]" },
    { name: "null outputs", body: { ...fastqcFixture, outputs: null }, path: "[outputs]" },
    {
      name: "null output element",
      body: { ...fastqcFixture, outputs: [null] },
      path: "[outputs.0]",
    },
    {
      name: "invalid collection structure",
      body: {
        ...fastqcFixture,
        outputs: [{ name: "out", label: null, hidden: false, type: "collection", structure: 7 }],
      },
      path: "[outputs.0.structure]",
    },
    {
      name: "large invalid value",
      body: { ...fastqcFixture, id: Array(19000).fill("x") },
      path: "[id]",
    },
  ])("bounds $name without rendering declarations or payloads", async ({ body, path }) => {
    try {
      await fetchTool(body);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolFetchError);
      const message = (error as ToolFetchError).message;
      expect(message).toContain(path);
      expect(message).toContain("has invalid type");
      expect(message).not.toContain("readonly");
      expect(message).not.toContain('"x"');
      expect(message.length).toBeLessThan(500);
      expect((error as ToolFetchError).url).toMatch(/^https:\/\/example.org\/api\/tools\//);
    }
  });

  it("bounds a long source URL while preserving the field diagnostic and full error URL", async () => {
    const url = `https://example.org/${"long-path/".repeat(100)}`;
    try {
      await fetchTool({ ...fastqcFixture, id: null }, url);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolFetchError);
      const message = (error as ToolFetchError).message;
      expect(message).toContain("[id] has invalid type");
      expect(message).toContain("…");
      expect(message.length).toBeLessThan(500);
      expect((error as ToolFetchError).url).toContain(url);
    }
  });
});

describe("fetchFromToolShed", () => {
  it("decodes a valid response", async () => {
    const result = await fetchFromToolShed(
      "https://toolshed.g2.bx.psu.edu",
      "devteam~fastqc~fastqc",
      "0.74+galaxy0",
      mockFetch(fastqcFixture),
    );
    expect(result.id).toBe("fastqc");
    expect(result.name).toBe("FastQC");
    expect(result.inputs).toHaveLength(7);
  });

  it("throws ToolFetchError on 404", async () => {
    await expect(
      fetchFromToolShed(
        "https://toolshed.g2.bx.psu.edu",
        "nonexistent~tool~id",
        "1.0",
        mockFetchError(404),
      ),
    ).rejects.toThrow(ToolFetchError);
  });

  it("throws ToolFetchError on 500", async () => {
    try {
      await fetchFromToolShed(
        "https://toolshed.g2.bx.psu.edu",
        "devteam~fastqc~fastqc",
        "0.74+galaxy0",
        mockFetchError(500, "Internal Server Error"),
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolFetchError);
      expect((e as ToolFetchError).statusCode).toBe(500);
    }
  });

  it("raises a compact ToolFetchError on decode failure, not the full ParsedTool type", async () => {
    const malformed = { ...fastqcFixture, id: undefined };
    delete (malformed as Record<string, unknown>).id;
    try {
      await fetchFromToolShed(
        "https://toolshed.g2.bx.psu.edu",
        "devteam~fastqc~fastqc",
        "0.74+galaxy0",
        mockFetch(malformed),
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolFetchError);
      const message = (e as ToolFetchError).message;
      // Names the failing field and stays well short of the ~19,000-character
      // dump effect's default ParseError formatter produces for this schema.
      expect(message).toContain("id");
      expect(message).toContain("is missing");
      expect(message.length).toBeLessThan(500);
    }
  });

  it("constructs correct URL", async () => {
    let capturedUrl = "";
    const captureFetch: typeof fetch = async (url) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify(fastqcFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    await fetchFromToolShed(
      "https://toolshed.g2.bx.psu.edu",
      "devteam~fastqc~fastqc",
      "0.74+galaxy0",
      captureFetch,
    );
    expect(capturedUrl).toBe(
      "https://toolshed.g2.bx.psu.edu/api/tools/devteam~fastqc~fastqc/versions/0.74+galaxy0",
    );
  });
});

describe("fetchFromGalaxy", () => {
  it("decodes a valid response", async () => {
    const result = await fetchFromGalaxy(
      "https://usegalaxy.org",
      "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.74+galaxy0",
      null,
      mockFetch(fastqcFixture),
    );
    expect(result.id).toBe("fastqc");
  });

  it("constructs URL with tool_version param", async () => {
    let capturedUrl = "";
    const captureFetch: typeof fetch = async (url) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify(fastqcFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    await fetchFromGalaxy("https://usegalaxy.org", "cat1", "1.0.0", captureFetch);
    expect(capturedUrl).toBe("https://usegalaxy.org/api/tools/cat1/parsed?tool_version=1.0.0");
  });

  it("throws ToolFetchError on failure", async () => {
    await expect(
      fetchFromGalaxy("https://usegalaxy.org", "nonexistent", null, mockFetchError(404)),
    ).rejects.toThrow(ToolFetchError);
  });
});
