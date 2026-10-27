/**
 * SHA-256 hex of the exact prompt string that drives `prompt_length`.
 * Empty or missing prompts are omitted so we never emit the well-known
 * empty-string digest.
 */
export declare function sdkPromptHashForAnalytics(prompt: string | undefined | null): string | undefined;
//# sourceMappingURL=analytics-prompt-hash.d.ts.map