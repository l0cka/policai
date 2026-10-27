/**
 * Drop the TTL cache so the next resolution re-reads the auth file. Called
 * after `Cursor.auth.login()` / `logout()` mutate it, so a same-process
 * login is usable immediately.
 */
export declare function clearStoredLoginCache(): void;
/**
 * The stored login's API key, when it is usable for the current backend:
 * unexpired, and minted against the same API base URL this process resolves
 * (keys are backend-paired — a key minted against production 401s on a local
 * stack and vice versa).
 */
export declare function getStoredLoginApiKey(): string | undefined;
/**
 * Standard SDK credential precedence: explicit `apiKey` option, then
 * `CURSOR_API_KEY`, then the stored `Cursor.auth.login()` key. Preserves an
 * explicit empty string (the caller's no-auth signal) untouched.
 */
export declare function resolveDefaultApiKey(explicit?: string): string | undefined;
//# sourceMappingURL=stored-credentials.d.ts.map