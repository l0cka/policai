/**
 * Dollar cost of billed usage, in float cents. Server-derived and eventually
 * consistent: cost can lag briefly after a run ends while billing events land.
 */
export interface UsageCost {
    /** Undiscounted model token cost. 0 for request-priced usage. */
    rawCostCents: number;
    /**
     * Amount actually charged, with discounts and the Cursor Token Fee
     * included. 0 for plan-included, BYOK, and credit-grant usage.
     */
    chargedCents: number;
}
/** Token usage and cost for one cloud run or local turn. */
export interface RunUsage {
    /**
     * The `run-<uuid>` run ID for a cloud agent, or the turn's usage UUID for a
     * local agent. This is also the value accepted by `GetUsageOptions.runId`.
     */
    runId: string;
    usage: TokenUsage;
    /** Absent when the backend does not report cost yet. */
    cost?: UsageCost;
}
/**
 * Usage and cost for an agent's runs, returned by `agent.getUsage()` and
 * `Agent.getUsage(agentId)`.
 */
export interface AgentUsage {
    /** Total billed token usage for the whole agent. */
    usage: TokenUsage;
    /** Total billed cost for the whole agent. Absent when not yet reported. */
    cost?: UsageCost;
    /**
     * Per-run entries for cloud agents. Local agent entries are per-turn groups
     * keyed by usage UUID. Local events without a usage UUID count toward
     * `usage` and `cost` only, so the totals can exceed the sum of these entries.
     */
    runs: RunUsage[];
}
/** Per-turn or cumulative token counts. `totalTokens` excludes `reasoningTokens` (a subset of output). */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
}
export type TurnUsageInput = {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens?: number;
};
/** Build a `TokenUsage` from a turn-ended payload, or `undefined` when usage was not reported. */
export declare function toTokenUsage(usage: TurnUsageInput | undefined): TokenUsage | undefined;
/** Field-wise sum of turn usages. `undefined` when no turn reported usage. */
export declare function sumTokenUsage(usages: ReadonlyArray<TurnUsageInput | undefined>): TokenUsage | undefined;
//# sourceMappingURL=usage-types.d.ts.map