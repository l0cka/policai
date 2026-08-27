/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import { buildPolicy } from "@/test/factories";
import {
  handleSearchDevelopments,
  handleSearchCourtRequirements,
  handleSearchPolicies,
} from "./public-tool-handlers";

function client(response: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(response, { status }));
  return {
    fetch,
    options: {
      baseUrl: "https://example.test",
      fetch: fetch as unknown as typeof globalThis.fetch,
    },
  };
}

describe("public MCP tool handlers", () => {
  it("returns compact policy search results", async () => {
    const policy = buildPolicy({
      id: "policy-a",
      content: "Long policy content",
    });
    const { fetch, options } = client({
      data: [policy],
      total: 1,
      success: true,
    });

    const result = await handleSearchPolicies(
      { query: "assurance", limit: 10 },
      options,
    );

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://example.test/api/policies?search=assurance",
    );
    expect(result.total).toBe(1);
    expect(result.policies[0]).toMatchObject({
      id: "policy-a",
      title: policy.title,
    });
    expect(result.policies[0]).not.toHaveProperty("content");
    expect(result.policies[0]).not.toHaveProperty("verification");
  });

  it("forwards bounded development filters", async () => {
    const development = {
      id: "development-a",
      title: "New AI assurance guidance",
      jurisdiction: "federal",
      detectedAt: "2026-08-01T00:00:00.000Z",
      relevanceScore: 0.55,
      classification: "heuristic",
      status: "detected",
      url: "https://example.gov.au/guidance",
      verification: { status: "needs_review" },
    };
    const { fetch, options } = client({
      data: [development],
      total: 1,
      success: true,
    });

    const result = await handleSearchDevelopments(
      {
        query: "assurance",
        since: "2026-08-01",
        limit: 5,
      },
      options,
    );

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://example.test/api/developments?search=assurance&since=2026-08-01&limit=5",
    );
    expect(result.developments).toEqual([
      expect.objectContaining({
        id: "development-a",
        verificationStatus: "needs_review",
      }),
    ]);
  });

  it("returns source-anchored court requirements", async () => {
    const requirement = {
      id: "requirement-a",
      policyId: "policy-a",
      actor: "Judicial officers",
      modality: "must_not",
      action: "Use generative AI to formulate reasons.",
      source: {
        url: "https://example.gov.au/guidance",
        contentHash: "a".repeat(64),
        locator: "paragraph 4",
        quote: "Judicial officers must not use generative AI.",
      },
    };
    const { fetch, options } = client({
      data: [requirement],
      total: 1,
      success: true,
    });

    const result = await handleSearchCourtRequirements(
      { jurisdiction: "nsw", actor: "judicial", limit: 10 },
      options,
    );

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://example.test/api/court-requirements?jurisdiction=nsw&actor=judicial&limit=10",
    );
    expect(result).toEqual({
      total: 1,
      count: 1,
      requirements: [requirement],
    });
  });

  it("reports public API errors without leaking response bodies", async () => {
    const { options } = client(
      { error: "Invalid filter", success: false },
      400,
    );

    await expect(handleSearchPolicies({}, options)).rejects.toThrow(
      "Invalid filter",
    );
  });

  it("reports non-JSON upstream failures clearly", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("Bad gateway", { status: 502 }));

    await expect(
      handleSearchPolicies(
        {},
        {
          baseUrl: "https://example.test",
          fetch: fetch as unknown as typeof globalThis.fetch,
        },
      ),
    ).rejects.toThrow("invalid JSON (HTTP 502)");
  });
});
