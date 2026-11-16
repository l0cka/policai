import { parseArgs } from 'node:util';

type CliFlag =
  | { type: 'boolean'; help: string }
  | { type: 'string'; value: string; help: string; required?: true };

type CliFlags = Record<string, CliFlag>;

export type CliValues<F extends CliFlags> = {
  [K in keyof F]: F[K] extends { type: 'boolean' }
    ? boolean
    : F[K] extends { required: true }
      ? string
      : string | undefined;
};

type CliExit =
  | { kind: 'help'; usage: string }
  | { kind: 'invalid'; message: string; usage: string };

type CliResult<F extends CliFlags> = { kind: 'run'; values: CliValues<F> } | CliExit;

type CliCommandResult<C extends Record<string, CliFlags>> =
  | { [K in keyof C]: { kind: 'run'; command: K; values: CliValues<C[K]> } }[keyof C]
  | CliExit;

const HELP_FLAG: CliFlag = { type: 'boolean', help: 'print this text and exit' };

function flagSyntax(name: string, flag: CliFlag): string {
  return flag.type === 'boolean' ? `--${name}` : `--${name}=${flag.value}`;
}

function cliUsage(invocation: string, flags: CliFlags): string {
  const rows = Object.entries<CliFlag>({ ...flags, help: HELP_FLAG }).map(([name, flag]) => ({
    syntax: flagSyntax(name, flag),
    required: flag.type === 'string' && flag.required === true,
    help: flag.help,
  }));
  const width = Math.max(...rows.map((row) => row.syntax.length));
  return [
    `Usage: ${invocation} ${rows.map((row) => (row.required ? row.syntax : `[${row.syntax}]`)).join(' ')}`,
    '',
    ...rows.map((row) => `  ${row.syntax.padEnd(width)}  ${row.help}`),
  ].join('\n');
}

export function parseCli<const F extends CliFlags>(
  invocation: string,
  flags: F,
  argv: string[],
): CliResult<F> {
  const usage = cliUsage(invocation, flags);
  const invalid = (message: string): CliExit => ({ kind: 'invalid', message, usage });
  let parsed: Record<string, boolean | string[] | undefined>;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        ...Object.fromEntries(
          Object.entries(flags).map(([name, flag]) => [
            name,
            flag.type === 'boolean' ? { type: 'boolean' as const } : { type: 'string' as const, multiple: true },
          ]),
        ),
        help: { type: 'boolean' },
      },
    }).values;
  } catch (error) {
    return invalid((error as Error).message);
  }
  if (parsed.help) return { kind: 'help', usage };

  const values: Record<string, boolean | string | undefined> = {};
  for (const [name, flag] of Object.entries(flags)) {
    const given = parsed[name];
    if (flag.type === 'boolean') {
      values[name] = given === true;
      continue;
    }
    const occurrences = Array.isArray(given) ? given : [];
    if (occurrences.length > 1) return invalid(`--${name} was given more than once`);
    if (occurrences[0] === '') return invalid(`--${name} needs a value`);
    if (occurrences.length === 0 && flag.required) return invalid(`--${name} is required`);
    values[name] = occurrences[0];
  }
  return { kind: 'run', values: values as CliValues<F> };
}

export function parseCliCommand<const C extends Record<string, CliFlags>>(
  invocation: string,
  commands: C,
  argv: string[],
): CliCommandResult<C> {
  const [command, ...rest] = argv;
  if (command !== undefined && Object.hasOwn(commands, command)) {
    const result = parseCli(`${invocation} ${command}`, commands[command], rest);
    return (result.kind === 'run' ? { ...result, command } : result) as CliCommandResult<C>;
  }
  const names = Object.keys(commands);
  const usage = names.map((name) => cliUsage(`${invocation} ${name}`, commands[name])).join('\n\n');
  if (command === '--help') return { kind: 'help', usage };
  return {
    kind: 'invalid',
    message: `Expected one of: ${names.join(', ')}${command === undefined ? '' : ` (got ${command})`}`,
    usage,
  };
}

export function cliRun<R extends { kind: 'run' }>(result: R | CliExit): R {
  if (result.kind === 'run') return result;
  if (result.kind === 'help') {
    console.log(result.usage);
    process.exit(0);
  }
  console.error(`${result.message}\n\n${result.usage}`);
  process.exit(2);
}
