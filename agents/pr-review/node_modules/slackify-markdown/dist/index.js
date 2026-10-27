import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import { collectDefinitions, removeDefinitions, removeHtmlComments, } from './plugins.js';
import createSlackifyOptions from './slackify.js';
export const slackifyMarkdown = (markdown, options) => {
    const definitions = {};
    const slackifyOptions = createSlackifyOptions(definitions);
    return (unified()
        .use(remarkParse, options?.parseOptions)
        // Delete node is defined in GFM
        // https://github.com/syntax-tree/mdast/blob/main/readme.md#gfm
        .use(remarkGfm)
        .use(collectDefinitions, definitions)
        .use(removeDefinitions)
        .use(removeHtmlComments)
        .use(remarkStringify, slackifyOptions)
        .processSync(markdown)
        .toString());
};
