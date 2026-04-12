#!/usr/bin/env tsx
/**
 * Scheduled Scraper Runner
 *
 * This script runs scrapers based on their configured schedules.
 * It should be executed periodically (e.g., every hour via cron).
 *
 * Usage:
 *   tsx scripts/run-scheduled-scrapers.ts
 *
 * Cron example (run every hour):
 *   0 * * * * cd /path/to/Policai && tsx scripts/run-scheduled-scrapers.ts >> logs/scraper.log 2>&1
 */

interface DataSource {
  id: string;
  name: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
  lastRun?: string;
}

// Data sources configuration
const DATA_SOURCES: DataSource[] = [
  {
    id: 'source-1',
    name: 'DTA AI Policy',
    schedule: 'daily',
    enabled: true,
  },
  {
    id: 'source-2',
    name: 'DISER AI Strategy',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-3',
    name: 'CSIRO Data61',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-4',
    name: 'AHRC AI Ethics',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-5',
    name: 'OAIC AI Guidance',
    schedule: 'monthly',
    enabled: true,
  },
  {
    id: 'source-6',
    name: 'NSW Digital AI',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-7',
    name: 'Victorian AI Strategy',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-8',
    name: 'ACCC Digital Platforms',
    schedule: 'monthly',
    enabled: true,
  },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const STATE_FILE = './data/scraper-state.json';

interface ScraperState {
  [sourceId: string]: {
    lastRun: string;
    lastStatus: 'success' | 'error';
    lastError?: string;
  };
}

/**
 * Load scraper state from file
 */
async function loadState(): Promise<ScraperState> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save scraper state to file
 */
async function saveState(state: ScraperState): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Ensure directory exists
    const dir = path.dirname(STATE_FILE);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

/**
 * Check if a source should run based on its schedule and last run time
 */
function shouldRun(source: DataSource, lastRun?: string): boolean {
  if (!source.enabled) {
    return false;
  }

  if (!lastRun) {
    return true; // Never run before
  }

  const now = new Date();
  const lastRunDate = new Date(lastRun);
  const hoursSinceLastRun = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);

  switch (source.schedule) {
    case 'daily':
      return hoursSinceLastRun >= 24;
    case 'weekly':
      return hoursSinceLastRun >= 24 * 7;
    case 'monthly':
      return hoursSinceLastRun >= 24 * 30;
    default:
      return false;
  }
}

/**
 * Run a single scraper
 */
async function runScraper(sourceId: string, sourceName: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running scraper: ${sourceName} (${sourceId})`);

  try {
    const response = await fetch(`${API_URL}/api/admin/run-scraper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sourceId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();

    console.log(`  ✓ Success:`);
    console.log(`    - Items found: ${result.data.itemsFound}`);
    console.log(`    - Items processed: ${result.data.itemsProcessed}`);
    console.log(`    - Auto-created: ${result.data.itemsCreated}`);
    console.log(`    - Pending review: ${result.data.itemsPending}`);
    console.log(`    - Skipped: ${result.data.itemsSkipped}`);

  } catch (error) {
    console.error(`  ✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Scheduled Scraper Runner');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Check if API key is configured
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Load state
  const state = await loadState();

  let sourcesRun = 0;
  let sourcesSkipped = 0;
  let sourcesErrored = 0;

  // Check each source
  for (const source of DATA_SOURCES) {
    const sourceState = state[source.id];

    if (shouldRun(source, sourceState?.lastRun)) {
      try {
        await runScraper(source.id, source.name);

        // Update state
        state[source.id] = {
          lastRun: new Date().toISOString(),
          lastStatus: 'success',
        };

        sourcesRun++;

        // Rate limiting - wait 5 seconds between scrapers
        if (sourcesRun < DATA_SOURCES.length) {
          console.log(`  Waiting 5 seconds before next scraper...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        // Update state with error
        state[source.id] = {
          lastRun: new Date().toISOString(),
          lastStatus: 'error',
          lastError: error instanceof Error ? error.message : 'Unknown error',
        };

        sourcesErrored++;
      }
    } else {
      console.log(`[${new Date().toISOString()}] Skipping ${source.name}: Not due to run yet`);
      sourcesSkipped++;
    }
  }

  // Save state
  await saveState(state);

  // Summary
  console.log('='.repeat(60));
  console.log('Summary:');
  console.log(`  - Sources run: ${sourcesRun}`);
  console.log(`  - Sources skipped: ${sourcesSkipped}`);
  console.log(`  - Sources errored: ${sourcesErrored}`);
  console.log(`Completed at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Exit with error code if any sources failed
  if (sourcesErrored > 0) {
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
