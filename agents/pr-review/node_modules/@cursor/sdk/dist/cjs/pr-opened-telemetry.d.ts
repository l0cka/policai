import type { SdkRuntime } from "@anysphere/analytics-types/sdk";
export interface MaybeEmitSdkPrOpenedArgs {
    apiKey: string | undefined;
    agentId: string;
    runId: string;
    requestId?: string;
    runtime: SdkRuntime;
    /** Workspace roots to probe (multi-root workspaces may have more than one). */
    cwds: string[];
}
/**
 * Best-effort: detect the open PR(s) for the current branch across GitHub and
 * Origin in each workspace root and emit `sdk.request.pr_opened` linking each to
 * the SDK session. Deduped per (agent, PR).
 */
export declare function maybeEmitSdkPrOpened(args: MaybeEmitSdkPrOpenedArgs): Promise<void>;
//# sourceMappingURL=pr-opened-telemetry.d.ts.map