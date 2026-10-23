'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import {
  JURISDICTIONS,
  TIERS,
  jurisdictionLabel,
  type Jurisdiction,
  type ScoredOrg,
  type TierKey,
} from '../lib/sector-data';
import { Search } from './icons';

/* Rows each kind shows before its "Show all" button; a kind only a couple of
   rows longer than this is shown whole rather than hiding one or two. */
const PREVIEW_ROWS = 6;

function countBy<K>(orgs: ScoredOrg[], key: (org: ScoredOrg) => K) {
  const counts = new Map<K, number>();
  for (const org of orgs) counts.set(key(org), (counts.get(key(org)) ?? 0) + 1);
  return counts;
}

export default function SectorDirectory({
  orgs,
  monitoringAvailable,
}: {
  orgs: ScoredOrg[];
  monitoringAvailable: boolean;
}) {
  const [q, setQ] = useState('');
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | ''>('');
  const [tier, setTier] = useState<TierKey | ''>('');
  const [onlyMonitored, setOnlyMonitored] = useState(false);
  const [expanded, setExpanded] = useState<Set<TierKey>>(new Set());
  const deferredQ = useDeferredValue(q.trim().toLowerCase());

  // Built once: the searchable haystack per row, so typing does not re-lowercase
  // 382 records on every keystroke.
  const indexed = useMemo(
    () =>
      orgs.map((o) => ({
        org: o,
        hay: `${o.name} ${o.abbrev} ${o.role} ${o.jurisdiction}`.toLowerCase(),
      })),
    [orgs],
  );

  const visible = useMemo(
    () =>
      indexed
        .filter(({ org, hay }) => {
          if (deferredQ && !hay.includes(deferredQ)) return false;
          if (jurisdiction && org.jurisdiction !== jurisdiction) return false;
          if (tier && org.tier !== tier) return false;
          if (onlyMonitored && !org.monitored) return false;
          return true;
        })
        .map(({ org }) => org),
    [indexed, deferredQ, jurisdiction, tier, onlyMonitored],
  );

  const monitoredTotal = useMemo(() => orgs.filter((o) => o.monitored).length, [orgs]);
  const tierCounts = useMemo(() => countBy(orgs, (o) => o.tier), [orgs]);
  const jurCounts = useMemo(() => countBy(orgs, (o) => o.jurisdiction), [orgs]);

  const grouped = useMemo(() => {
    const m = new Map<TierKey, ScoredOrg[]>();
    for (const o of visible) {
      const bucket = m.get(o.tier);
      if (bucket) bucket.push(o);
      else m.set(o.tier, [o]);
    }
    for (const rows of m.values()) {
      rows.sort((a, b) => {
        const ja = JURISDICTIONS.indexOf(a.jurisdiction);
        const jb = JURISDICTIONS.indexOf(b.jurisdiction);
        return ja - jb || a.name.localeCompare(b.name);
      });
    }
    return m;
  }, [visible]);

  // A search or filter narrows the list enough to show every match.
  const narrowed = Boolean(deferredQ || jurisdiction || tier || onlyMonitored);

  const clearAll = () => {
    setQ('');
    setJurisdiction('');
    setTier('');
    setOnlyMonitored(false);
  };

  return (
    <>
      <div className="sector-directory-controls">
        <label className="sector-search">
          <Search />
          <span className="sr-only">Search the sector</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${orgs.length} organisations by name, acronym or what they do`}
          />
        </label>
        <div className="sector-directory-filters">
          <label>
            <span className="ctrl-label">Where</span>
            <select
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value as Jurisdiction | '')}
            >
              <option value="">Everywhere</option>
              {JURISDICTIONS.map((j) => (
                <option key={j} value={j}>
                  {jurisdictionLabel(j)} ({jurCounts.get(j) ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="ctrl-label">Kind</span>
            <select value={tier} onChange={(e) => setTier(e.target.value as TierKey | '')}>
              <option value="">All kinds</option>
              {TIERS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} ({tierCounts.get(t.key) ?? 0})
                </option>
              ))}
            </select>
          </label>
          {monitoringAvailable ? (
            <button
              type="button"
              className="sector-radar-toggle"
              aria-pressed={onlyMonitored}
              onClick={() => setOnlyMonitored((value) => !value)}
            >
              <span className="radar-dot" aria-hidden="true">●</span>
              On the radar ({monitoredTotal})
            </button>
          ) : null}
          <span className="sector-count" aria-live="polite">
            {visible.length} of {orgs.length}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state" role="status">
          <p className="section-title">Nothing matches</p>
          <p>Try a broader search or fewer filters.</p>
          <button type="button" className="button-primary" onClick={clearAll}>
            Clear search and filters
          </button>
        </div>
      ) : null}

      {TIERS.map((t) => {
        const rows = grouped.get(t.key);
        if (!rows?.length) return null;
        const whole = narrowed || expanded.has(t.key) || rows.length <= PREVIEW_ROWS + 2;
        const shown = whole ? rows : rows.slice(0, PREVIEW_ROWS);
        const mon = rows.filter((r) => r.monitored).length;
        return (
          <section className="sector-tier" key={t.key} aria-label={t.label}>
            <h3 className="day-heading">
              {t.label}
              <span className="day-count">{rows.length}</span>
            </h3>
            <p className="sector-tier-blurb">
              {t.blurb}
              {monitoringAvailable ? ` ${mon} of ${rows.length} on the radar.` : ''}
            </p>
            <ul className="sector-orgs">
              {shown.map((o) => (
                <li className="sector-org" key={`${o.tier}-${o.name}`}>
                  <details>
                    <summary>
                      <span className="sector-org-name">
                        {o.name}
                        {o.abbrev ? <span className="sector-abbr">{o.abbrev}</span> : null}
                        {monitoringAvailable && o.monitored ? (
                          <span className="radar-dot" title="Already a Policai A2J source">
                            ●<span className="sr-only">Already a Policai A2J source</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="sector-org-jur">{jurisdictionLabel(o.jurisdiction)}</span>
                      <span className="sector-role">{o.role}</span>
                    </summary>
                    <div className="sector-org-body">
                      {o.funded_by ? (
                        <p className="sector-funded">
                          <span>Funded by</span> {o.funded_by}
                        </p>
                      ) : null}
                      {o.url ? (
                        <a href={o.url} target="_blank" rel="noopener noreferrer">
                          Organisation site ↗
                        </a>
                      ) : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {whole ? null : (
              <button
                type="button"
                className="sector-tier-more"
                onClick={() => setExpanded((s) => new Set(s).add(t.key))}
              >
                Show all {rows.length}
              </button>
            )}
          </section>
        );
      })}
    </>
  );
}
