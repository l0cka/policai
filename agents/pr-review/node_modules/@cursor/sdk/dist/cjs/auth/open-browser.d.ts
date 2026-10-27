/**
 * Whether opening a browser is likely to reach the user: false in SSH
 * sessions, when `NO_OPEN_BROWSER` is set, or for non-web URLs. Callers fall
 * back to surfacing the URL (via `onLoginUrl`) when this is false.
 */
export declare function isLikelyToOpenBrowser(url: string): boolean;
/**
 * Open `url` in the system browser. Rejects when spawning the opener fails;
 * resolves once the opener process starts (not when the page loads).
 */
export declare function openBrowser(url: string): Promise<void>;
//# sourceMappingURL=open-browser.d.ts.map