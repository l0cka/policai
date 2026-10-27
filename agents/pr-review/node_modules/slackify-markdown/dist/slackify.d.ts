import type { Options } from 'mdast-util-to-markdown';
import type { DefinitionsMap } from './plugins.js';
/**
 * Creates options to be passed into a `remark-stringify` processor that tailor
 * the output for Slack Markdown.
 *
 * @param definitions - Record of `Definition`s in the Markdown document, keyed by identifier.
 */
declare const createOptions: (definitions: Readonly<DefinitionsMap>) => Options;
export default createOptions;
//# sourceMappingURL=slackify.d.ts.map