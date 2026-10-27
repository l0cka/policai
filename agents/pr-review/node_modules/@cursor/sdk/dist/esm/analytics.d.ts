import { type TokenProvider } from "@anysphere/analytics-client";
import type { SdkAnalyticsBaseProps, SdkAnalyticsEventSchema, SdkExecutorStartupProps, SdkRequestPrOpenedProps, SdkRunCompletedProps, SdkRunCreatedProps, SdkRunSendLatencyProps, SdkRuntime } from "@anysphere/analytics-types/sdk";
import { type CursorSdkError } from "./errors.js";
/**
 * Drains buffered SDK analytics events for every apiKey that has emitted
 * anything in this process. Called from `agent[Symbol.asyncDispose]()`.
 *
 * `timeoutMs` bounds the wait; if the RPC hangs, flush aborts via the
 * internal AbortController and returns. Never throws.
 */
export declare function flushSdkAnalytics(timeoutMs?: number): Promise<void>;
export declare function __resetAnalyticsForTests(): void;
export declare function trackSdkRunCreated(apiKey: string | undefined, props: SdkRunCreatedProps): void;
export declare function trackSdkRunCompleted(apiKey: string | undefined, props: SdkRunCompletedProps): void;
export declare function trackSdkOperationFailed({ apiKey, runtime, error, }: {
    apiKey: string | undefined;
    runtime: SdkRuntime;
    error: CursorSdkError;
}): void;
export declare function trackSdkRunSendLatency(apiKey: string | undefined, props: SdkRunSendLatencyProps): void;
export declare function trackSdkExecutorStartup(apiKey: string | undefined, props: SdkExecutorStartupProps): void;
export declare function trackSdkRequestPrOpened(apiKey: string | undefined, props: SdkRequestPrOpenedProps): void;
export type { SdkAnalyticsBaseProps, SdkAnalyticsEventSchema, SdkExecutorStartupProps, SdkRequestPrOpenedProps, SdkRunCompletedProps, SdkRunCreatedProps, SdkRunSendLatencyProps, SdkRuntime, TokenProvider, };
//# sourceMappingURL=analytics.d.ts.map