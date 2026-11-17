#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(root, 'src');

const arbitrary = (utility, value) => [utility, '-[', value, ']'].join('');

const RAW_SIZE = arbitrary('text', '11px');
const TOKEN_SIZE = arbitrary('text', 'length:var(--type-label)');
const LABEL_SIZES = [RAW_SIZE, TOKEN_SIZE];
const LABEL_CLASS_BY_TRACKING = new Map([
  [arbitrary('tracking', '0.08em'), 'label'],
  [arbitrary('tracking', '0.1em'), 'label-caps'],
  [arbitrary('tracking', '0.12em'), 'label-caps'],
  [arbitrary('tracking', '0.14em'), 'label-caps'],
]);
const EXACT_TRACKING = new Set([arbitrary('tracking', '0.08em'), arbitrary('tracking', '0.12em')]);
const STRING_LITERAL = /(["'`])((?:(?!\1)[^\\\n])*)\1/g;

function rewriteClasses(classes) {
  const parts = classes.split(/(\s+)/);
  const tokens = parts.filter((_, index) => index % 2 === 0);
  const size = tokens.find((token) => LABEL_SIZES.includes(token));
  if (!size) return null;
  const tracking = tokens.find((token) => LABEL_CLASS_BY_TRACKING.has(token));
  const isRecipe = tracking && tokens.includes('font-mono') && tokens.includes('uppercase');
  if (!isRecipe) {
    if (size !== RAW_SIZE) return null;
    return {
      category: 'size-token',
      after: parts.map((part) => (part === RAW_SIZE ? TOKEN_SIZE : part)).join(''),
    };
  }
  const labelClass = LABEL_CLASS_BY_TRACKING.get(tracking);
  const dropped = new Set([size, 'uppercase', tracking]);
  const kept = [];
  for (let index = 0; index < parts.length; index += 2) {
    if (dropped.has(parts[index])) continue;
    if (kept.length > 0) kept.push(parts[index - 1]);
    kept.push(parts[index] === 'font-mono' ? labelClass : parts[index]);
  }
  return {
    category: EXACT_TRACKING.has(tracking) ? 'equal-recipe' : 'tracking-collapse',
    after: kept.join(''),
  };
}

export function rewriteSource(source) {
  const edits = [];
  const output = source.replace(STRING_LITERAL, (literal, quote, classes, offset) => {
    const rewritten = rewriteClasses(classes);
    if (!rewritten) return literal;
    edits.push({
      line: source.slice(0, offset).split('\n').length,
      category: rewritten.category,
      before: classes,
      after: rewritten.after,
    });
    return `${quote}${rewritten.after}${quote}`;
  });
  return { output, edits };
}

function tsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return tsxFiles(path);
      return entry.name.endsWith('.tsx') ? [path] : [];
    })
    .sort();
}

function main() {
  const check = process.argv.includes('--check');
  const manifestPath = process.argv.find((arg) => arg.startsWith('--manifest='))?.slice('--manifest='.length);
  const manifest = [];
  const residual = [];
  for (const path of tsxFiles(SOURCE_DIR)) {
    const source = readFileSync(path, 'utf8');
    const { output, edits } = rewriteSource(source);
    const file = relative(root, path);
    for (const edit of edits) manifest.push({ file, ...edit });
    output.split('\n').forEach((text, index) => {
      if (text.includes(RAW_SIZE)) residual.push(`${file}:${index + 1}`);
    });
    if (!check && output !== source) writeFileSync(path, output);
  }
  for (const edit of manifest) {
    console.log(`${edit.file}:${edit.line} [${edit.category}]\n  - ${edit.before}\n  + ${edit.after}`);
  }
  for (const location of residual) console.error(`${location}: ${RAW_SIZE} is outside a class string the codemod can rewrite`);
  if (manifestPath) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${manifest.length} class string(s) ${check ? 'would change' : 'changed'}, ${residual.length} left unresolved.`);
  if (residual.length > 0 || (check && manifest.length > 0)) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
