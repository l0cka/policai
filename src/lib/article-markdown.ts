import type {} from "remark-parse";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import type { Processor } from "unified";

function remarkGfmTables(this: Processor) {
	const data = this.data();
	(data.micromarkExtensions ??= []).push(gfmTable());
	(data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}

export const articleMdxOptions = {
	format: "md" as const,
	remarkPlugins: [remarkGfmTables],
};
