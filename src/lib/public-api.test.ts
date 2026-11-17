/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { GET as agencies } from "@/app/api/agencies/route";
import { GET as courtRequirements } from "@/app/api/court-requirements/route";
import { GET as developments } from "@/app/api/developments/route";
import { GET as legislation } from "@/app/api/legislation/route";
import { GET as policies } from "@/app/api/policies/route";
import { GET as timeline } from "@/app/api/timeline/route";
import { enumParam } from "@/lib/public-api";

const JURISDICTION_MESSAGE =
  "Invalid jurisdiction. Allowed values: federal, nsw, vic, qld, wa, sa, tas, act, nt";

type Get = (request: Request) => Promise<Response>;

const routes: Record<string, Get> = {
  agencies,
  "court-requirements": courtRequirements,
  developments,
  legislation,
  policies,
  timeline,
};

const rejected: [string, string, string][] = [
  ["agencies", "jurisdiction=nz", JURISDICTION_MESSAGE],
  ["developments", "jurisdiction=nz", JURISDICTION_MESSAGE],
  [
    "developments",
    "status=dismissed",
    "Invalid status. Allowed values: detected, promoted",
  ],
  ["legislation", "jurisdiction=nz", JURISDICTION_MESSAGE],
  [
    "legislation",
    "stage=assented",
    "Invalid stage. Allowed values: before_parliament, made, in_force, ended",
  ],
  ["policies", "jurisdiction=nz", JURISDICTION_MESSAGE],
  [
    "policies",
    "type=treaty",
    "Invalid type. Allowed values: legislation, regulation, guideline, framework, standard, practice_note, policy, tool, funding_program",
  ],
  [
    "policies",
    "status=draft",
    "Invalid status. Allowed values: proposed, active, amended, superseded, closed, repealed",
  ],
  ["timeline", "jurisdiction=nz", JURISDICTION_MESSAGE],
  ["court-requirements", "jurisdiction=nz", JURISDICTION_MESSAGE],
  [
    "court-requirements",
    "modality=shall",
    "Invalid modality. Allowed values: must, must_not, should, should_not, may, will",
  ],
  [
    "policies",
    "jurisdiction=nz&type=treaty&status=draft",
    JURISDICTION_MESSAGE,
  ],
  [
    "policies",
    "type=treaty&status=draft",
    "Invalid type. Allowed values: legislation, regulation, guideline, framework, standard, practice_note, policy, tool, funding_program",
  ],
];

describe("public API enum query parameters", () => {
  it.each(rejected)(
    "/api/%s rejects ?%s with a 400 that lists the allowed values",
    async (route, query, message) => {
      const response = await routes[route](
        new Request(`https://example.com/api/${route}?${query}`),
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: message,
        success: false,
      });
    },
  );

  it("answers a trashed status filter on /api/policies with 404, not the allowed list", async () => {
    const response = await policies(
      new Request(
        "https://example.com/api/policies?status=trashed&type=treaty",
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
      success: false,
    });
  });
});

describe("enumParam", () => {
  const colours = ["red", "green", "hidden"] as const;

  it.each([
    ["colour=green", "green"],
    ["colour=", undefined],
    ["other=green", undefined],
  ])("reads ?%s as %s", (query, value) => {
    expect(enumParam(new URLSearchParams(query), "colour", colours)).toEqual({
      value,
    });
  });

  it("rejects a value outside the list with a 400 naming the parameter and every value", async () => {
    const { error, value } = enumParam(
      new URLSearchParams("colour=Green"),
      "colour",
      colours,
    );

    expect(value).toBeUndefined();
    expect(error?.status).toBe(400);
    await expect(error?.json()).resolves.toEqual({
      error: "Invalid colour. Allowed values: red, green, hidden",
      success: false,
    });
  });

  it("accepts a value it does not list when given a shorter list to show", async () => {
    const shown = colours.slice(0, -1);

    expect(
      enumParam(new URLSearchParams("colour=hidden"), "colour", colours, shown),
    ).toEqual({ value: "hidden" });
    await expect(
      enumParam(
        new URLSearchParams("colour=blue"),
        "colour",
        colours,
        shown,
      ).error?.json(),
    ).resolves.toEqual({
      error: "Invalid colour. Allowed values: red, green",
      success: false,
    });
  });
});
