const TRACKING = /^(utm_|fbclid|gclid|mc_cid|mc_eid)/;

export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
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
