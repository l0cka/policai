/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDevelopments } = vi.hoisted(() => ({
  getDevelopments: vi.fn(),
}));

vi.mock("@/lib/data-service", () => ({
  getDevelopments,
}));

import { GET } from "./route";

describe("/api/developments", () => {
  beforeEach(() => {
    getDevelopments.mockReset();
  });

  it("returns bounded developments with supported filters", async () => {
    const developments = [
      {
        id: "development-a",
        title: "AI policy update",
        url: "https://example.gov.au/ai-policy",
        sourceId: "source-a",
        sourceName: "Example agency",
        jurisdiction: "federal",
        detectedAt: "2026-08-02T00:00:00.000Z",
        relevanceScore: 0.55,
        classification: "heuristic",
        assessment: {
          method: "heuristic",
          assessedAt: "2026-08-02T00:00:00.000Z",
          promptVersion: "test-v1",
        },
        verification: {
          status: "needs_review",
          source: { url: "https://example.gov.au/ai-policy" },
        },
        status: "detected",
      },
    ];
    getDevelopments.mockResolvedValue(developments);

    const response = await GET(
      new Request(
        "https://example.com/api/developments?jurisdiction=federal&status=detected&search=policy&since=2026-08-01&limit=25",
      ),
    );

    expect(getDevelopments).toHaveBeenCalledWith({
      jurisdiction: "federal",
      status: "detected",
      search: "policy",
      since: "2026-08-01",
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    await expect(response.json()).resolves.toEqual({
      data: developments,
      total: 1,
      success: true,
    });
  });

  it("reports the matching total, not the page size", async () => {
    getDevelopments.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);

    const response = await GET(
      new Request("https://example.com/api/developments?limit=2"),
    );
    const body = await response.json();

    expect(body.data.map((d: { id: string }) => d.id)).toEqual(["a", "b"]);
    expect(body.total).toBe(3);
  });

  it("rejects invalid public filters", async () => {
    const response = await GET(
      new Request(
        "https://example.com/api/developments?status=dismissed&limit=0",
      ),
    );

    expect(response.status).toBe(400);
    expect(getDevelopments).not.toHaveBeenCalled();
  });
});
