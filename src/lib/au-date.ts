/**
 * en-AU date text with "Sep" for September. ICU spells the short month
 * "Sept", the only four-letter abbreviation, which breaks the column of
 * three-letter months in lists and mono strips.
 */
export function auDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-AU', options).format(date).replace(/\bSept\b/, 'Sep');
}
