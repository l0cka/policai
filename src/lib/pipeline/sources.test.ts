import { describe, expect, it } from 'vitest';
import { isAllowedSourceHost } from '@/lib/source-url';
import { WATCH_SOURCES, getAutomaticSources, getManualSources } from './sources';

const STATE_LEGISLATION_SOURCES: Record<string, string> = {
  'vic-legislation-whats-new': 'vic',
  'qld-legislation-new': 'qld',
  'tas-legislation-statutory-rules': 'tas',
  'tas-legislation-acts': 'tas',
  'wa-legislation-as-made': 'wa',
  'wa-legislation-as-passed': 'wa',
};

// Pinned from the 2026-10-06 honest-UA audit; Daniel's E24 decision allows
// no other source to opt out of the declared identity.
const E24_IDENTITY_EXCEPTION_IDS = [
  'industry-ai-publications',
  'industry-ministers-media',
  'dta-media',
  'digital-gov-ai',
  'disr-news',
  'naic-news',
  'finance-news',
  'agd-ministers-media',
  'apsc-latest-news',
  'anao-performance-audits',
  'acma-media',
  'tga-media',
  'teqsa-news',
  'esafety-media',
  'fcfcoa-practice-directions',
  'art-practice-directions',
] as const;

describe('WATCH_SOURCES', () => {
  it('uses unique source ids', () => {
    const ids = WATCH_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every source at an allow-listed official HTTPS host', () => {
    for (const source of WATCH_SOURCES) {
      expect(isAllowedSourceHost(source.url), source.id).toBe(true);
    }
  });

  it('watches the verified state legislation registers daily and automatically', () => {
    for (const [id, jurisdiction] of Object.entries(STATE_LEGISLATION_SOURCES)) {
      const source = WATCH_SOURCES.find((candidate) => candidate.id === id);
      expect(source, id).toBeDefined();
      expect(source?.jurisdiction).toBe(jurisdiction);
      expect(source?.category).toBe('government');
      expect(source?.schedule).toBe('daily');
      expect(source?.automation).toBe('automatic');
      expect(source?.enabled).toBe(true);
      expect(new URL(source!.url).hostname).toMatch(/^(www\.)?legislation\./);
    }
  });

  it('tracks cyber.gov.au by hand and never fetches it automatically', () => {
    const cyberSources = WATCH_SOURCES.filter(
      (source) => new URL(source.url).hostname === 'www.cyber.gov.au',
    );
    expect(cyberSources.map((source) => source.id)).toEqual(['cyber-news']);
    const [source] = cyberSources;
    expect(source.url).toBe('https://www.cyber.gov.au/news');
    expect(source.automation).toBe('manual');
    expect(source.fetchStrategy).toBeUndefined();
    expect(getManualSources().map((s) => s.id)).toContain('cyber-news');
    expect(getAutomaticSources().map((s) => s.id)).not.toContain('cyber-news');
  });

  it('grants the time-boxed E24 identity exception to exactly the 16 refusing sources', () => {
    const exempt = WATCH_SOURCES.filter((source) => source.identityException);
    expect(exempt.map((source) => source.id).sort()).toEqual(
      [...E24_IDENTITY_EXCEPTION_IDS].sort(),
    );
    for (const source of exempt) {
      expect(source.identityException?.until, source.id).toBe('2026-10-21');
      expect(source.identityException?.reason, source.id).toMatch(/E24/);
      expect(source.fetchStrategy, source.id).toBe('browser');
      expect(source.automation, source.id).toBe('automatic');
    }
  });
});
