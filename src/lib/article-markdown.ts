import type {} from "remark-parse";
import type { Components } from "hast-util-to-jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Processor } from "unified";

function remarkGfmTables(this: Processor) {
	const data = this.data();
	(data.micromarkExtensions ??= []).push(gfmTable());
	(data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}

// Article bodies are plain Markdown plus pipe tables. Rendering the syntax
// tree straight to React, rather than compiling MDX, never evaluates
// generated code, which Cloudflare Workers forbid at request time.
export function renderArticleMarkdown(
	markdown: string,
	{ tables = true, components }: { tables?: boolean; components?: Partial<Components> } = {},
): ReactNode {
	const processor = unified().use(remarkParse);
	if (tables) processor.use(remarkGfmTables);
	const tree = processor.use(remarkRehype).runSync(processor.parse(markdown));
	return toJsxRuntime(tree, { Fragment, jsx, jsxs, components });
}
