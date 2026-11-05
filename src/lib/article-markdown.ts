import type {} from "remark-parse";
import type { Components } from "hast-util-to-jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import type { ComponentProps, ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Processor } from "unified";

function remarkGfmTables(this: Processor) {
	const data = this.data();
	(data.micromarkExtensions ??= []).push(gfmTable());
	(data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}

const POLICY_LINK = /^\/policies\/([^/?#]+)/;

// A register record withheld during a source review answers 404, so a body
// link to one keeps its words and drops the anchor.
export function linkOnlyToPublicRecords(
	publicPolicyIds: ReadonlySet<string>,
): Partial<Components> {
	return {
		a({ href, node: _node, ...rest }: ComponentProps<"a"> & { node?: unknown }) {
			const id = href?.match(POLICY_LINK)?.[1];
			if (id && !publicPolicyIds.has(decodeURIComponent(id))) return rest.children;
			return jsx("a", { href, ...rest });
		},
	};
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
