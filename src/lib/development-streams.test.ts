import { describe, expect, it } from 'vitest';
import type { WatchSource } from '@/lib/pipeline/sources';
import {
  DEVELOPMENT_STREAMS,
  getDevelopmentStream,
  getDevelopmentStreamName,
} from '@/lib/development-streams';

const source = (id: string, category: WatchSource['category']): WatchSource =>
  ({
    id,
    name: id,
    jurisdiction: 'federal',
    category,
    url: `https://example.gov.au/${id}`,
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
  }) as WatchSource;

const sources = [
  source('court-src', 'court'),
  source('reg-src', 'regulator'),
  source('gov-src', 'government'),
];

describe('getDevelopmentStream', () => {
  it('lists streams in display order', () => {
    expect(DEVELOPMENT_STREAMS).toEqual([
      'consultation',
      'court',
      'regulator',
      'government',
    ]);
  });

  it('puts consultations and inquiries first, whatever the source', () => {
    expect(
      getDevelopmentStream({ sourceId: 'reg-src', title: 'OAIC consults on automated decision-making transparency' }, sources),
    ).toBe('consultation');
    expect(
      getDevelopmentStream({ sourceId: 'gov-src', title: 'Senate opens inquiry into artificial intelligence and data centres' }, sources),
    ).toBe('consultation');
    expect(
      getDevelopmentStream({ sourceId: 'gov-src', title: 'Current Joint Inquiries' }, sources),
    ).toBe('consultation');
  });

  it('falls back to the source category', () => {
    expect(getDevelopmentStream({ sourceId: 'court-src', title: 'Federal Court issues GPN-AI practice note' }, sources)).toBe('court');
    expect(getDevelopmentStream({ sourceId: 'reg-src', title: 'APRA calls for step-change in AI risk management' }, sources)).toBe('regulator');
    expect(getDevelopmentStream({ sourceId: 'gov-src', title: 'NSW AI Assessment Framework' }, sources)).toBe('government');
  });

  it('treats an unknown source as government', () => {
    expect(getDevelopmentStream({ sourceId: 'curated', title: 'Register entry' }, sources)).toBe('government');
  });

  it('has display names', () => {
    expect(getDevelopmentStreamName('consultation')).toBe('Consultations and inquiries');
    expect(getDevelopmentStreamName('court')).toBe('Courts and tribunals');
    expect(getDevelopmentStreamName('regulator')).toBe('Regulators');
    expect(getDevelopmentStreamName('government')).toBe('Government policy');
  });
});
