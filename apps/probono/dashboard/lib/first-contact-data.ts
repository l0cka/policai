import raw from './first-contact-services.json';
import { findFirstContact, parseQuery, validateServices, type Result, type Service } from './first-contact';

export const SERVICES = raw as unknown as Service[];

let checked = false;

function assertValid() {
  if (checked) return;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
  const problems = validateServices(SERVICES, today);
  if (problems.length) throw new Error(`first-contact-services.json is invalid: ${problems.join('; ')}`);
  checked = true;
}

export function lookup(input: unknown): { result: Result } | { error: string } {
  assertValid();
  const parsed = parseQuery(input);
  if ('error' in parsed) return parsed;
  return { result: findFirstContact(SERVICES, parsed.query) };
}
