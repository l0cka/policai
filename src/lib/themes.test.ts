import { describe, expect, it } from 'vitest';
import {
  MAX_THEME_MESSAGE_VALUE_CHARS,
  MAX_THEMES_PER_RECORD,
  MIN_PUBLIC_RECORDS_PER_THEME,
  MIN_RECORDS_PER_THEME,
  MIN_THEMES_PER_RECORD,
  THEMES,
  formatThemeMessageLabel,
  formatThemeMessageValue,
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
    expect(MIN_RECORDS_PER_THEME).toBe(2);
    expect(MIN_PUBLIC_RECORDS_PER_THEME).toBe(MIN_RECORDS_PER_THEME);
  });
});

describe('formatThemeMessageValue', () => {
  it('quotes ordinary unknown ids like JSON.stringify', () => {
    expect(formatThemeMessageValue('courts')).toBe('"courts"');
    expect(formatThemeMessageValue('Generative AI')).toBe('"Generative AI"');
  });

  it('escapes non-printing characters JSON.stringify leaves literal', () => {
    expect(formatThemeMessageValue(`standards\u200b`)).toBe('"standards\\u200b"');
    expect(formatThemeMessageValue(`standards\u200d`)).toBe('"standards\\u200d"');
    expect(formatThemeMessageValue(`standards\ufeff`)).toBe('"standards\\ufeff"');
    expect(formatThemeMessageValue(`standards\u202e`)).toBe('"standards\\u202e"');
    expect(formatThemeMessageValue(`standards\u2028`)).toBe('"standards\\u2028"');
    expect(formatThemeMessageValue(`standards\u0085`)).toBe('"standards\\u0085"');
    expect(formatThemeMessageValue(`standards\u007f`)).toBe('"standards\\u007f"');
  });

  it('truncates long theme strings', () => {
    const long = 'x'.repeat(10_000);
    const formatted = formatThemeMessageValue(long);
    expect(formatted.length).toBe(MAX_THEME_MESSAGE_VALUE_CHARS + 2);
    expect(formatted.startsWith('"')).toBe(true);
    expect(formatted.endsWith('…"')).toBe(true);
    expect(formatted).not.toContain('x'.repeat(100));
  });

  it('keeps non-finite numbers readable', () => {
    expect(formatThemeMessageValue(1e999)).toBe('Infinity');
    expect(formatThemeMessageValue(Number.NaN)).toBe('NaN');
  });
});

describe('formatThemeMessageLabel', () => {
  it('escapes newlines so a second ERROR line cannot be faked', () => {
    expect(formatThemeMessageLabel('evil\nERROR fake-line')).toBe(
      'evil\\u000aERROR fake-line',
    );
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
