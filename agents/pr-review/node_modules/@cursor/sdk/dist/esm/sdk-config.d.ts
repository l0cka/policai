import type { LocalAgentStore } from "./store/local-agent-store.js";
export interface CursorConfigureOptions {
    /**
     * Defaults for local-agent persistence. Fields on individual `Agent.*`
     * calls override these values.
     */
    local?: {
        /**
         * Default {@link LocalAgentStore} when a call omits `store` / `local.store`.
         * Pass `null` to clear a previous default. When unset, local routes use
         * on-disk SQLite when the optional `sqlite3` module is available; otherwise
         * configure {@link JsonlLocalAgentStore} or another {@link LocalAgentStore}.
         */
        store?: LocalAgentStore | null;
        /**
         * Force local agent backend streams to use HTTP/1.1 with SSE instead of
         * HTTP/2. Pass `null` to clear a previous default.
         */
        useHttp1ForAgent?: boolean | null;
        /**
         * How long a scan of the workspace for rules, skills, `AGENTS.md` and
         * ignore files stays reusable, in milliseconds. Defaults to 20s, which
         * suits an editor whose files change under it; every expiry costs a full
         * re-walk of the tree, which on a large repo is seconds.
         *
         * Raise it in a long-lived host serving a checkout that only changes on
         * deploy. The trade is freshness: a rule or `.cursorignore` added after
         * the process started can go unseen for this long. Pass `null` to clear a
         * previous override; `CURSOR_RIPWALK_CACHE_TTL_MS` sets the same dial from
         * the environment.
         */
        workspaceScanCacheTtlMs?: number | null;
    };
}
export declare function configureCursorSdk(options: CursorConfigureOptions): void;
export declare function getDefaultUseHttp1ForAgent(): boolean | undefined;
export declare function getDefaultWorkspaceScanCacheTtlMs(): number | undefined;
export declare function __clearDefaultNetworkConfigForTests(): void;
//# sourceMappingURL=sdk-config.d.ts.map