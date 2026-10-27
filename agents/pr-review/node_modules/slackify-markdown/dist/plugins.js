import { remove } from 'unist-util-remove';
import { visit } from 'unist-util-visit';
/**
 * Fills the provided record with `Definition`s contained in the mdast.
 * They are keyed by identifier for subsequent `Reference` lookups.
 */
export const collectDefinitions = (definitions) => (tree) => {
    visit(tree, 'definition', (node) => {
        definitions[node.identifier] = {
            title: node.title,
            url: node.url,
        };
    });
};
/**
 * Removes `Definition`s and their parent `Paragraph`s from the mdast.
 * This avoids unwanted negative space in stringified output.
 */
export const removeDefinitions = () => (tree) => {
    return remove(tree, { cascade: true }, 'definition');
};
/**
 * Removes HTML comments from the mdast tree.
 * This prevents HTML comments from appearing in Slack output where they
 * are not properly processed and cause rendering issues.
 */
export const removeHtmlComments = () => (tree) => {
    return remove(tree, (node) => {
        if (node.type !== 'html') {
            return false;
        }
        const htmlNode = node;
        const trimmed = htmlNode.value.trim();
        return trimmed.startsWith('<!--') && trimmed.endsWith('-->');
    });
};
