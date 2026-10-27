import type { Root } from 'mdast';
export interface Definition {
    title: string | null | undefined;
    url: string;
}
export type DefinitionsMap = Record<string, Definition>;
/**
 * Fills the provided record with `Definition`s contained in the mdast.
 * They are keyed by identifier for subsequent `Reference` lookups.
 */
export declare const collectDefinitions: (definitions: DefinitionsMap) => (tree: Root) => void;
/**
 * Removes `Definition`s and their parent `Paragraph`s from the mdast.
 * This avoids unwanted negative space in stringified output.
 */
export declare const removeDefinitions: () => (tree: Root) => Root | undefined;
/**
 * Removes HTML comments from the mdast tree.
 * This prevents HTML comments from appearing in Slack output where they
 * are not properly processed and cause rendering issues.
 */
export declare const removeHtmlComments: () => (tree: Root) => Root | undefined;
//# sourceMappingURL=plugins.d.ts.map