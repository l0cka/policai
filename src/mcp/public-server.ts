#!/usr/bin/env tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  handleGetPolicy,
  handleGetStatus,
  handleListAgencies,
  handleListTimeline,
  handleSearchDevelopments,
  handleSearchCourtRequirements,
  handleSearchPolicies,
  toPublicToolText,
} from "./public-tool-handlers";

const server = new McpServer({
  name: "policai-public",
  version: "0.1.0",
});

const jurisdiction = z.enum([
  "federal",
  "nsw",
  "vic",
  "qld",
  "wa",
  "sa",
  "tas",
  "act",
  "nt",
]);
const limit = z.number().int().min(1).max(100).optional();
const readOnlyAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  destructiveHint: false,
};

server.registerTool(
  "search_policies",
  {
    title: "Search Australian AI policies",
    description:
      "Search the verified public Policai register. Results contain compact summaries and official source URLs.",
    inputSchema: {
      query: z.string().max(200).optional(),
      jurisdiction: jurisdiction.optional(),
      type: z
        .enum([
          "legislation",
          "regulation",
          "guideline",
          "framework",
          "standard",
          "practice_note",
          "policy",
          "tool",
          "funding_program",
        ])
        .optional(),
      status: z
        .enum([
          "proposed",
          "active",
          "amended",
          "superseded",
          "closed",
          "repealed",
        ])
        .optional(),
      limit,
    },
    annotations: readOnlyAnnotations,
  },
  async (input) => toPublicToolText(await handleSearchPolicies(input)),
);

server.registerTool(
  "get_policy",
  {
    title: "Get an Australian AI policy",
    description: "Get one verified public policy record by its Policai ID.",
    inputSchema: { id: z.string().min(1).max(200) },
    annotations: readOnlyAnnotations,
  },
  async (input) => toPublicToolText(await handleGetPolicy(input)),
);

server.registerTool(
  "search_court_requirements",
  {
    title: "Search verified Australian court AI requirements",
    description:
      "Search reviewer-verified requirements extracted from court and tribunal AI instruments, with actor, modality, pinpoint quote and source hash.",
    inputSchema: {
      query: z.string().max(200).optional(),
      jurisdiction: jurisdiction.optional(),
      policyId: z.string().max(200).optional(),
      actor: z.string().max(200).optional(),
      modality: z
        .enum(["must", "must_not", "should", "should_not", "may", "will"])
        .optional(),
      topic: z.string().max(200).optional(),
      limit,
    },
    annotations: readOnlyAnnotations,
  },
  async (input) =>
    toPublicToolText(await handleSearchCourtRequirements(input)),
);

server.registerTool(
  "search_developments",
  {
    title: "Search Australian AI policy developments",
    description:
      "Search the public developments feed. Machine-classified items remain marked as needing review.",
    inputSchema: {
      query: z.string().max(200).optional(),
      jurisdiction: jurisdiction.optional(),
      status: z.enum(["detected", "promoted"]).optional(),
      since: z.string().max(40).optional(),
      limit,
    },
    annotations: readOnlyAnnotations,
  },
  async (input) => toPublicToolText(await handleSearchDevelopments(input)),
);

server.registerTool(
  "list_timeline",
  {
    title: "List Australian AI policy timeline events",
    description: "List verified public timeline events, newest first.",
    inputSchema: {
      jurisdiction: jurisdiction.optional(),
      limit,
    },
    annotations: readOnlyAnnotations,
  },
  async (input) => toPublicToolText(await handleListTimeline(input)),
);

server.registerTool(
  "list_agencies",
  {
    title: "List Australian agencies with AI policy information",
    description: "List public agency records and AI transparency information.",
    inputSchema: {
      level: z.enum(["federal", "state"]).optional(),
      jurisdiction: jurisdiction.optional(),
      commonwealth: z.boolean().optional(),
      limit,
    },
    annotations: readOnlyAnnotations,
  },
  async (input) => toPublicToolText(await handleListAgencies(input)),
);

server.registerTool(
  "get_status",
  {
    title: "Get Policai collection status",
    description: "Get public collection health and freshness timestamps.",
    inputSchema: {},
    annotations: readOnlyAnnotations,
  },
  async () => toPublicToolText(await handleGetStatus()),
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
