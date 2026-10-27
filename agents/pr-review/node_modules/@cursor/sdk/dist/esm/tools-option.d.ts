/**
 * Header carrying the run's built-in tool restriction. The backend restricts
 * the session's toolset to the listed agent proto tool names; an empty value
 * means no built-in tools. Must match CURSOR_AGENT_ALLOWED_TOOLS_HEADER_NAME
 * in `@anysphere/constants` (packages/constants/src/cloud-agent.ts), which the
 * backend's sessionBuilder reads.
 */
export declare const ALLOWED_TOOLS_HEADER_NAME = "x-cursor-agent-allowed-tools";
/**
 * Header carrying the run's built-in tool exclusions. The backend removes the
 * listed agent proto tool names from the session's toolset. Must match
 * CURSOR_AGENT_EXCLUDE_TOOLS_HEADER_NAME in `@anysphere/constants`
 * (packages/constants/src/cloud-agent.ts), which the backend's sessionBuilder
 * reads.
 */
export declare const EXCLUDE_TOOLS_HEADER_NAME = "x-cursor-agent-exclude-tools";
/**
 * Validate a caller-supplied `tools` option and resolve it to the agent proto
 * tool names sent in {@link ALLOWED_TOOLS_HEADER_NAME}. Returns `undefined`
 * when the caller did not restrict tools (default toolset) and an empty array
 * for `tools: []` (no built-in tools).
 */
export declare function resolveAllowedProtoToolNames(tools: readonly string[] | undefined): string[] | undefined;
/**
 * Validate a caller-supplied `disallowedTools` option and resolve it to the
 * agent proto tool names sent in {@link EXCLUDE_TOOLS_HEADER_NAME}. Returns
 * `undefined` when the caller did not exclude any tools; an empty array
 * (`disallowedTools: []`) is also a no-op.
 */
export declare function resolveDisallowedProtoToolNames(disallowedTools: readonly string[] | undefined): string[] | undefined;
//# sourceMappingURL=tools-option.d.ts.map