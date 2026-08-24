const TRACKING = /^(utm_|fbclid|gclid|mc_cid|mc_eid)/;

export function canonicalizeUrl(raw: string): string {
  const u = URL.parse(raw.trim());
  if (!u) throw new TypeError('Invalid URL');
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.test(key)) u.searchParams.delete(key);
  }
  let s = u.toString();
  if (u.search === '' && s.includes('?')) s = s.replace(/\?$/, '');
  return s.replace(/\/$/, '');
}
