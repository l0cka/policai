import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function parse(file: string) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function isClientModule(source: ts.SourceFile) {
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use client'
  );
}

function resolveModule(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  const candidates = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((suffix) => base + suffix);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function valueBindings(statement: ts.Statement): { specifier: string; names: string[] } | null {
  if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly) {
    const clause = statement.importClause;
    const names = clause.name ? [clause.name.text] : [];
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
      }
    }
    return { specifier: (statement.moduleSpecifier as ts.StringLiteral).text, names };
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
    const names =
      statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => (element.propertyName ?? element.name).text)
        : ['*'];
    return { specifier: (statement.moduleSpecifier as ts.StringLiteral).text, names };
  }
  return null;
}

describe('client module boundary', () => {
  it("server modules take only components from 'use client' modules", () => {
    const files = sourceFiles(SRC);
    const client = new Set(files.filter((file) => isClientModule(parse(file))));
    const violations = files
      .filter((file) => !client.has(file))
      .flatMap((file) =>
        parse(file).statements.flatMap((statement) => {
          const bindings = valueBindings(statement);
          const target = bindings && resolveModule(file, bindings.specifier);
          if (!bindings || !target || !client.has(target)) return [];
          return bindings.names
            .filter((name) => !COMPONENT_NAME.test(name))
            .map((name) => `${path.relative(SRC, file)}: ${name} from ${path.relative(SRC, target)}`);
        }),
      );
    expect(violations).toEqual([]);
  });
});
