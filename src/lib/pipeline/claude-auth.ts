/**
 * Raised when the classifier backend rejects or lacks credentials. Callers
 * treat this as an operational failure distinct from a source outage: the
 * remedy is a human fixing the key, so it must fail the run rather than being
 * absorbed into a per-candidate fallback. The name predates the HTTP
 * transport (the first AI path was the Claude Code CLI) and is kept so
 * existing call sites and logs stay stable.
 */
export class ClaudeAuthError extends Error {}