import { type RuntimeCustomSubagentDefinition } from "./run-store-public-types.js";
import type { RunExecutor } from "./executor-types.js";
import type { McpServerConfig, SandboxOptions, SettingSource } from "./options.js";
export interface LocalExecutorHandle {
    run: RunExecutor;
    reload(): Promise<void>;
    dispose(): Promise<void>;
}
export interface CreateLocalExecutorOptions {
    readonly workingDirectory?: string;
    /**
     * Additional workspace roots for multi-root local agents. When set (length
     * > 1), forwarded to the local workspace runtime so project settings and
     * request-context env cover every root. The primary root remains
     * {@link workingDirectory}.
     */
    readonly dirs?: readonly string[];
    readonly apiKey?: string;
    readonly settingSources?: readonly SettingSource[];
    readonly sandboxOptions?: SandboxOptions;
    readonly autoReview?: boolean;
    readonly devForceNextSmartModeClassifierBlockToken?: string;
    readonly mcpServers?: Record<string, McpServerConfig>;
    readonly customSubagents?: readonly RuntimeCustomSubagentDefinition[];
    readonly enableAgentRetries?: boolean;
}
export declare function createLocalExecutor(optionsOrWorkingDirectory?: CreateLocalExecutorOptions | string, apiKey?: string): Promise<LocalExecutorHandle>;
//# sourceMappingURL=local-executor.d.ts.map