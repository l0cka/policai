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
});
