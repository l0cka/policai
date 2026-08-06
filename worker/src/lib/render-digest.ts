export type DigestItem = { id: number; title: string; url: string; blurb: string | null; source_name: string };
export type DigestInput = {
  periodStart: Date;
  periodEnd: Date;
  dashboardUrl: string;
  opportunities: DigestItem[];
  byStream: Record<string, DigestItem[]>;
  deadlines: { date: string; label: string; itemTitle: string }[];
  failedSources: string[];
};

const STREAM_LABELS: Record<string, string> = {
  news: 'News & announcements',
  law_reform: 'Law reform & policy',
  funding: 'Funding & grants',
  tech_justice: 'Tech & innovation in justice',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtSydney = (d: Date) =>
  d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' });

function itemHtml(i: DigestItem): string {
  return `<li style="margin-bottom:10px">
    <a href="${esc(i.url)}"><strong>${esc(i.title)}</strong></a>
    <span style="color:#666"> — ${esc(i.source_name)}</span>
    ${i.blurb ? `<br>${esc(i.blurb)}` : ''}
  </li>`;
}

export function renderDigest(input: DigestInput): string {
  const parts: string[] = [];
  parts.push(`<h1 style="font-size:18px">Pro Bono Radar — week of ${fmtSydney(input.periodStart)} to ${fmtSydney(input.periodEnd)}</h1>`);
  if (input.opportunities.length) {
    parts.push(`<h2 style="font-size:15px">⚑ Opportunities</h2><ul>${input.opportunities.map(itemHtml).join('')}</ul>`);
  }
  for (const [stream, items] of Object.entries(input.byStream)) {
    if (!items.length) continue;
    parts.push(`<h2 style="font-size:15px">${esc(STREAM_LABELS[stream] ?? stream)}</h2><ul>${items.map(itemHtml).join('')}</ul>`);
  }
  if (input.deadlines.length) {
    parts.push(`<h2 style="font-size:15px">Upcoming deadlines</h2><ul>${input.deadlines
      .map((d) => `<li><strong>${esc(d.date)}</strong> — ${esc(d.label)} (${esc(d.itemTitle)})</li>`)
      .join('')}</ul>`);
  }
  parts.push(`<p><a href="${esc(input.dashboardUrl)}">Open the dashboard</a></p>`);
  if (input.failedSources.length) {
    parts.push(`<p style="color:#a00;font-size:12px">Sources that failed this week: ${input.failedSources.map(esc).join(', ')}</p>`);
  }
  return `<div style="font-family:Georgia,serif;max-width:640px">${parts.join('\n')}</div>`;
}
