import matter from "gray-matter";

function refuse(language: string) {
	return () => {
		throw new Error(`frontmatter must be YAML, not ${language}`);
	};
}

const YAML_ONLY = {
	language: "yaml",
	engines: {
		js: refuse("js"),
		javascript: refuse("javascript"),
		json: refuse("json"),
	},
};

export type FrontmatterFile = matter.GrayMatterFile<string>;

export function parseFrontmatter(source: string): FrontmatterFile {
	return matter(source, YAML_ONLY);
}
