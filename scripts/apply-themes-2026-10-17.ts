import { promises as fs } from 'node:fs';
import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { applyThemeMapping, type ThemeMapping } from '../src/lib/policy-themes-migration';

const POLICIES_FILE = path.join(process.cwd(), 'data', 'policies.json');
const MAPPING_FILE = path.join(process.cwd(), 'scripts', 'policy-themes-2026-10-17.json');

async function main(): Promise<void> {
  await withDataMutationLock(async () => {
    const [registerJson, mappingJson] = await Promise.all([
      fs.readFile(POLICIES_FILE, 'utf-8'),
      fs.readFile(MAPPING_FILE, 'utf-8'),
    ]);
    const output = applyThemeMapping(registerJson, JSON.parse(mappingJson) as ThemeMapping);
    if (output === registerJson) {
      console.log('apply-themes: data/policies.json already matches the mapping');
      return;
    }
    const temporaryPath = `${POLICIES_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, output, 'utf-8');
    await fs.rename(temporaryPath, POLICIES_FILE);
    console.log('apply-themes: wrote themes to data/policies.json');
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
