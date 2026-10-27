import type { Options as RemarkParseOptions } from 'remark-parse';
export interface SlackifyMarkdownOptions {
    parseOptions?: RemarkParseOptions;
}
export declare const slackifyMarkdown: (markdown: string, options?: SlackifyMarkdownOptions) => string;
//# sourceMappingURL=index.d.ts.map