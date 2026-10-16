import matter from "gray-matter";
import yaml from "js-yaml";

function refuse(language: string) {
	return () => {
		throw new Error(`frontmatter must be YAML, not ${language}`);
	};
}

export function parseYaml(source: string): unknown {
	return yaml.load(source, { schema: yaml.CORE_SCHEMA });
}

const YAML_ONLY = {
	language: "yaml",
	engines: {
		yaml: { parse: (source: string) => (parseYaml(source) ?? {}) as object },
		js: refuse("js"),
		javascript: refuse("javascript"),
		json: refuse("json"),
	},
};

export type FrontmatterFile = matter.GrayMatterFile<string>;

export function parseFrontmatter(source: string): FrontmatterFile {
	return matter(source, YAML_ONLY);
}
