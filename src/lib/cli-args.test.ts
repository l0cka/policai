/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { parseCli, parseCliCommand } from './cli-args';

const FLAGS = {
  source: { type: 'string', value: '<id>', help: 'audit one source' },
  body: { type: 'string', value: '<id>', required: true, help: 'a body id' },
  json: { type: 'boolean', help: 'print JSON' },
} as const;

const USAGE = `Usage: npm run demo -- [--source=<id>] --body=<id> [--json] [--help]

  --source=<id>  audit one source
  --body=<id>    a body id
  --json         print JSON
  --help         print this text and exit`;

const COMMANDS = {
  propose: { 'dry-run': { type: 'boolean', help: 'write nothing' } },
  approve: { batch: { type: 'string', value: '<id>', required: true, help: 'the batch' } },
} as const;

const PROPOSE_USAGE = `Usage: npm run demo -- propose [--dry-run] [--help]

  --dry-run  write nothing
  --help     print this text and exit`;

const APPROVE_USAGE = `Usage: npm run demo -- approve --batch=<id> [--help]

  --batch=<id>  the batch
  --help        print this text and exit`;

describe('parseCli', () => {
  it.each([
    ['the = form', ['--body=ato', '--source=apra-rss', '--json'], { source: 'apra-rss', body: 'ato', json: true }],
    ['the space form', ['--body', 'ato'], { source: undefined, body: 'ato', json: false }],
    ['a repeated boolean', ['--json', '--body=ato', '--json'], { source: undefined, body: 'ato', json: true }],
  ])('reads %s', (_name, argv, values) => {
    expect(parseCli('npm run demo --', FLAGS, argv)).toEqual({ kind: 'run', values });
  });

  it.each([
    ['an unknown flag', ['--body=ato', '--jsno'], "Unknown option '--jsno'"],
    ['a positional argument', ['--body=ato', 'apra-rss'], 'apra-rss'],
    ['a flag with no value', ['--body=ato', '--source'], '--source'],
    ['a value on a boolean flag', ['--body=ato', '--json=yes'], '--json'],
    ['an empty value', ['--body=ato', '--source='], '--source needs a value'],
    ['an empty value before a full one', ['--body=ato', '--source=', '--source=apra-rss'], '--source was given more than once'],
    ['a repeated value', ['--body=ato', '--body=dta'], '--body was given more than once'],
    ['a missing required flag', ['--json'], '--body is required'],
  ])('rejects %s', (_name, argv, message) => {
    const result = parseCli('npm run demo --', FLAGS, argv);

    expect(result).toMatchObject({ kind: 'invalid', usage: USAGE });
    expect(result.kind === 'invalid' && result.message).toContain(message);
  });

  it('answers --help with the generated usage even when a required flag is missing', () => {
    expect(parseCli('npm run demo --', FLAGS, ['--help'])).toEqual({ kind: 'help', usage: USAGE });
  });
});

describe('parseCliCommand', () => {
  it('reads each subcommand with its own flags', () => {
    expect(parseCliCommand('npm run demo --', COMMANDS, ['propose', '--dry-run'])).toEqual({
      kind: 'run',
      command: 'propose',
      values: { 'dry-run': true },
    });
    expect(parseCliCommand('npm run demo --', COMMANDS, ['approve', '--batch=b1'])).toEqual({
      kind: 'run',
      command: 'approve',
      values: { batch: 'b1' },
    });
  });

  it('rejects a flag that belongs to the other subcommand', () => {
    const result = parseCliCommand('npm run demo --', COMMANDS, ['approve', '--batch=b1', '--dry-run']);

    expect(result).toMatchObject({ kind: 'invalid', usage: APPROVE_USAGE });
    expect(result.kind === 'invalid' && result.message).toContain("Unknown option '--dry-run'");
  });

  it.each([
    ['no subcommand', [], 'Expected one of: propose, approve'],
    ['an unknown subcommand', ['publish'], 'Expected one of: propose, approve (got publish)'],
    ['a flag before the subcommand', ['--dry-run', 'propose'], 'Expected one of: propose, approve (got --dry-run)'],
    ['an inherited property name', ['toString'], 'Expected one of: propose, approve (got toString)'],
  ])('rejects %s with every usage', (_name, argv, message) => {
    expect(parseCliCommand('npm run demo --', COMMANDS, argv)).toEqual({
      kind: 'invalid',
      message,
      usage: `${PROPOSE_USAGE}\n\n${APPROVE_USAGE}`,
    });
  });

  it('answers --help with every usage, and <subcommand> --help with its own', () => {
    expect(parseCliCommand('npm run demo --', COMMANDS, ['--help'])).toEqual({
      kind: 'help',
      usage: `${PROPOSE_USAGE}\n\n${APPROVE_USAGE}`,
    });
    expect(parseCliCommand('npm run demo --', COMMANDS, ['approve', '--help'])).toEqual({
      kind: 'help',
      usage: APPROVE_USAGE,
    });
  });
});
