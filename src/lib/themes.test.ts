import { describe, expect, it } from 'vitest';
import {
  MAX_THEMES_PER_RECORD,
  MIN_PUBLIC_RECORDS_PER_THEME,
  MIN_THEMES_PER_RECORD,
  THEMES,
  getThemeLabel,
  isThemeId,
} from './themes';

describe('THEMES', () => {
  it('lists the 22 approved themes with unique keys and labels', () => {
    expect(THEMES).toHaveLength(22);
    expect(new Set(THEMES.map((theme) => theme.key)).size).toBe(22);
    expect(new Set(THEMES.map((theme) => theme.label)).size).toBe(22);
  });

  it('states the record and coverage rules', () => {
    expect([MIN_THEMES_PER_RECORD, MAX_THEMES_PER_RECORD]).toEqual([1, 5]);
    expect(MIN_PUBLIC_RECORDS_PER_THEME).toBe(2);
  });
});

describe('isThemeId', () => {
  it('accepts listed keys only', () => {
    expect(isThemeId('courts-tribunals')).toBe(true);
    expect(isThemeId('Courts and tribunals')).toBe(false);
    expect(isThemeId('courts')).toBe(false);
    expect(isThemeId('toString')).toBe(false);
    expect(isThemeId(1)).toBe(false);
  });
});

describe('getThemeLabel', () => {
  it('returns the display label for a key', () => {
    expect(getThemeLabel('legal-practice')).toBe('Evidence and legal practice');
  });
});
