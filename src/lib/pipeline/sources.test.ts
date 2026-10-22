import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAllowedSourceHost, sourceIdentityUrls, sourceUrlsEqual } from '@/lib/source-url';
import { buildManualDecision } from '@/test/factories';
import type { Policy } from '@/types';
import { WATCH_SOURCES, getAutomaticSources, getManualSources, refusedHosts } from './sources';

const STATE_LEGISLATION_SOURCES: Record<string, string> = {
  'vic-legislation-whats-new': 'vic',
  'qld-legislation-new': 'qld',
  'tas-legislation-statutory-rules': 'tas',
  'tas-legislation-acts': 'tas',
  'wa-legislation-as-made': 'wa',
  'wa-legislation-as-passed': 'wa',
};

const REGISTER_POLICIES = JSON.parse(
  readFileSync(join(process.cwd(), 'data', 'policies.json'), 'utf8'),
) as Policy[];

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

  it('watches the register sourceUrl of every record it matches', () => {
    for (const source of getAutomaticSources()) {
      if (source.kind !== 'document') continue;
      for (const policy of REGISTER_POLICIES) {
        const identity = sourceIdentityUrls(
          policy.sourceUrl,
          policy.verification?.source,
        );
        if (!identity.some((url) => sourceUrlsEqual(url, source.url))) continue;
        expect(
          sourceUrlsEqual(policy.sourceUrl, source.url),
          `${source.id} watches an alias of ${policy.id}`,
        ).toBe(true);
      }
    }
  });

  it('watches the canonical NT AI Assurance Framework URL', () => {
    const source = WATCH_SOURCES.find(({ id }) => id === 'nt-ai-assurance');
    const policy = REGISTER_POLICIES.find(
      ({ id }) => id === 'nt-artificial-intelligence-assurance-framework',
    );
    expect(source?.fetchStrategy).toBe('browser');
    expect(policy).toBeDefined();
    expect(sourceUrlsEqual(source?.url ?? '', policy?.sourceUrl ?? '')).toBe(true);
  });

  it('watches the PM&C rapid review page outside /office-ai', () => {
    const source = WATCH_SOURCES.find(({ id }) => id === 'pmc-rapid-review-ai-cyber');
    const officeAi = WATCH_SOURCES.find(({ id }) => id === 'pmc-office-ai');
    expect(source).toBeDefined();
    expect(source?.kind).toBe('document');
    expect(source?.automation).toBe('automatic');
    expect(source?.enabled).toBe(true);
    expect(source?.fetchStrategy).toBe('browser');
    expect(source?.url).toBe(
      'https://www.pmc.gov.au/domestic-policy/rapid-review-australian-government-arrangements-ai-driven-cyber-incident',
    );
    expect(officeAi?.url).toBe('https://www.pmc.gov.au/domestic-policy/office-ai');
    expect(sourceUrlsEqual(source!.url, officeAi!.url)).toBe(false);
    expect(getAutomaticSources().map((s) => s.id)).toContain('pmc-rapid-review-ai-cyber');
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
    expect(source.automation).toMatchObject({ mode: 'manual', because: 'identity_refused' });
    expect(source.fetchStrategy).toBeUndefined();
    expect(getManualSources().map((s) => s.id)).toContain('cyber-news');
    expect(getAutomaticSources().map((s) => s.id)).not.toContain('cyber-news');
  });

  it('derives refused hosts from identity_refused decisions only', () => {
    expect(Object.fromEntries(refusedHosts(WATCH_SOURCES))).toEqual({
      'www.industry.gov.au': 'industry-ai-publications',
      'www.minister.industry.gov.au': 'industry-ministers-media',
      'www.dta.gov.au': 'dta-media',
      'www.digital.gov.au': 'digital-gov-ai',
      'ministers.ag.gov.au': 'agd-ministers-media',
      'www.cyber.gov.au': 'cyber-news',
      'www.apsc.gov.au': 'apsc-latest-news',
      'www.accc.gov.au': 'accc-rss',
      'www.acma.gov.au': 'acma-media',
      'www.esafety.gov.au': 'esafety-media',
    });
  });

  it('skips an identity_refused source whose url does not parse', () => {
    const broken = {
      ...WATCH_SOURCES[0],
      id: 'broken-url',
      url: 'not-a-url',
      automation: buildManualDecision({ because: 'identity_refused' }),
    };
    expect(refusedHosts([broken]).size).toBe(0);
  });

  it('lets no source retrieve without the declared identity', () => {
    expect(
      WATCH_SOURCES.filter((source) => source.identityException).map((source) => source.id),
    ).toEqual([]);
  });
});
