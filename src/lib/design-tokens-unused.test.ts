import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type App = { stylesheets: string[]; sources: string[] };

const ROOT = path.resolve(__dirname, '../..');
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', '.open-next', '.wrangler', 'test', 'public']);

const NOT_YET_ADOPTED: string[] = [];

const COLOUR_UTILITIES =
  'bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|shadow|placeholder';
const RADIUS_UTILITIES = 'rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?';
const THEME_UTILITIES: Record<string, string> = {
  '--color-': COLOUR_UTILITIES,
  '--radius-': RADIUS_UTILITIES,
};

const PLUGIN_CONSUMERS = [{ prefix: '--tw-prose-', className: 'prose' }];

const DECLARATION = /(?<![\w-])(--[A-Za-z][\w-]*)\s*:([^;{}]*)/g;
const VAR_REFERENCE = /var\(\s*(--[A-Za-z][\w-]*)/g;
const NAME = /(?<![\w-])(--[A-Za-z][\w-]*)/g;
const TEMPLATE_PREFIX = /(--[A-Za-z][\w-]*-)\$\{/g;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function themeBlocks(css: string): string {
  let found = '';
  for (const match of css.matchAll(/@theme[^{]*\{/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1;
      if (css[end] === '}') depth -= 1;
      end += 1;
    }
    found += css.slice(match.index, end);
  }
  return found;
}

function usesClass(text: string, pattern: string): boolean {
  return new RegExp(`(?<![\\w-])(?:${pattern})(?![\\w-])`).test(text);
}

function unreferencedIn(app: App): Set<string> {
  const css = app.stylesheets.map(stripComments).join('\n');
  const script = app.sources.join('\n');
  const everything = `${css}\n${script}`;

  const declared = new Map<string, string[]>();
  for (const [, name, value] of css.matchAll(DECLARATION)) {
    declared.set(name, [...(declared.get(name) ?? []), value]);
  }
  const themeNames = new Set([...themeBlocks(css).matchAll(DECLARATION)].map(([, name]) => name));

  const live = new Set<string>();
  for (const [, name] of css.replace(DECLARATION, '').matchAll(VAR_REFERENCE)) live.add(name);
  for (const [, name] of script.matchAll(NAME)) live.add(name);
  const templatePrefixes = [...script.matchAll(TEMPLATE_PREFIX)].map(([, prefix]) => prefix);
  for (const name of declared.keys()) {
    if (templatePrefixes.some((prefix) => name.startsWith(prefix))) live.add(name);
    for (const { prefix, className } of PLUGIN_CONSUMERS) {
      if (name.startsWith(prefix) && usesClass(script, className)) live.add(name);
    }
    if (!themeNames.has(name)) continue;
    for (const [prefix, utilities] of Object.entries(THEME_UTILITIES)) {
      if (name.startsWith(prefix) && usesClass(everything, `(?:${utilities})-${name.slice(prefix.length)}`)) {
        live.add(name);
      }
    }
  }

  const queue = [...live];
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    for (const value of declared.get(name) ?? []) {
      for (const [, referenced] of value.matchAll(VAR_REFERENCE)) {
        if (live.has(referenced)) continue;
        live.add(referenced);
        queue.push(referenced);
      }
    }
  }

  return new Set([...declared.keys()].filter((name) => !live.has(name)));
}

function unreferenced(apps: App[], sharedCss: string): string[] {
  const shared = new Set([...stripComments(sharedCss).matchAll(DECLARATION)].map(([, name]) => name));
  const perApp = apps.map(unreferencedIn);
  const names = new Set<string>();
  perApp.forEach((unused) => {
    for (const name of unused) {
      if (!shared.has(name) || perApp.every((other) => other.has(name))) names.add(name);
    }
  });
  return [...names].sort();
}

function files(directory: string, extension: RegExp): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : files(full, extension);
    return extension.test(entry.name) && !/\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

function loadApp(directory: string): App {
  const read = (file: string) => fs.readFileSync(file, 'utf8');
  return {
    stylesheets: files(path.join(ROOT, directory), /\.css$/).map(read),
    sources: files(path.join(ROOT, directory), /\.[cm]?[jt]sx?$/).map(read),
  };
}

describe('unused custom property detection', () => {
  const app = (css: string, ...sources: string[]): App => ({ stylesheets: [css], sources });

  it('reports a property that nothing reads', () => {
    expect(unreferenced([app(':root { --used: 1px; --dead: 2px; } a { width: var(--used); }')], '')).toEqual(['--dead']);
  });

  it('does not count a reference from a property that is itself unread', () => {
    const css = ':root { --base: red; --alias: var(--base); --dead-alias: var(--dead-base); --dead-base: blue; } a { color: var(--alias); }';
    expect(unreferenced([app(css)], '')).toEqual(['--dead-alias', '--dead-base']);
  });

  it('counts a theme variable only when a utility class uses it', () => {
    const css = '@theme inline { --color-ledger: var(--ledger); --color-margin: var(--margin); --radius-nib: 6px; --radius-quill: 12px; } :root { --ledger: white; --margin: grey; }';
    const source = '<div className="hover:bg-ledger/80 rounded-t-nib" />';
    expect(unreferenced([app(css, source)], '')).toEqual(['--color-margin', '--margin', '--radius-quill']);
  });

  it('counts names a script builds from a template or reads by name', () => {
    const css = ':root { --jd-nsw: teal; --jd-vic: purple; --offset: 0px; --other: 1px; }';
    const source = "const accent = `var(--jd-${id})`; element.style.setProperty('--offset', top);";
    expect(unreferenced([app(css, source)], '')).toEqual(['--other']);
  });

  it('counts typography plugin variables when the prose class is rendered', () => {
    const css = '.article { --tw-prose-body: black; }';
    expect(unreferenced([app(css, '<div className="prose" />')], '')).toEqual([]);
    expect(unreferenced([app(css, '<div className="plain" />')], '')).toEqual(['--tw-prose-body']);
  });

  it('reports a shared token only when no app reads it', () => {
    const shared = ':root { --shared-a: 1px; --shared-b: 2px; }';
    const first = app(`${shared} a { width: var(--shared-a); }`);
    const second = app(shared);
    expect(unreferenced([first, second], shared)).toEqual(['--shared-b']);
  });
});

describe('custom properties in both apps', () => {
  it('are all referenced, apart from shared tokens not yet adopted', () => {
    const unused = unreferenced(
      [loadApp('src'), loadApp('apps/probono/dashboard')],
      fs.readFileSync(path.join(ROOT, 'design/tokens.css'), 'utf8'),
    );
    expect(unused.filter((name) => !NOT_YET_ADOPTED.includes(name))).toEqual([]);
  });
});
