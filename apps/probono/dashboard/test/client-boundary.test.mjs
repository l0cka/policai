import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIRS = ['app', 'lib'];
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [full] : [];
  });
}

function parse(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function isClientModule(source) {
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use client'
  );
}

function resolveModule(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((suffix) => base + suffix);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function valueBindings(statement) {
  if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly) {
    const clause = statement.importClause;
    const names = clause.name ? [clause.name.text] : [];
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
      }
    }
    return { specifier: statement.moduleSpecifier.text, names };
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
    const names =
      statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => (element.propertyName ?? element.name).text)
        : ['*'];
    return { specifier: statement.moduleSpecifier.text, names };
  }
  return null;
}

describe('client module boundary', () => {
  it("server modules take only components from 'use client' modules", () => {
    const files = [
      ...SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))),
      path.join(ROOT, 'middleware.ts'),
    ];
    const client = new Set(files.filter((file) => isClientModule(parse(file))));
    assert.ok(client.size > 0, "the scan should find the dashboard's 'use client' modules");
    const violations = files
      .filter((file) => !client.has(file))
      .flatMap((file) =>
        parse(file).statements.flatMap((statement) => {
          const bindings = valueBindings(statement);
          const target = bindings && resolveModule(file, bindings.specifier);
          if (!bindings || !target || !client.has(target)) return [];
          return bindings.names
            .filter((name) => !COMPONENT_NAME.test(name))
            .map((name) => `${path.relative(ROOT, file)}: ${name} from ${path.relative(ROOT, target)}`);
        }),
      );
    assert.deepEqual(violations, []);
  });
});
