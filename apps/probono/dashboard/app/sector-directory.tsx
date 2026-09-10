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

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

export default function SectorDirectory({
  orgs,
  monitoringAvailable,
}: {
  orgs: ScoredOrg[];
  monitoringAvailable: boolean;
}) {
  const [q, setQ] = useState('');
  const [jurs, setJurs] = useState<Set<Jurisdiction>>(new Set());
  const [tiers, setTiers] = useState<Set<TierKey>>(new Set());
  const [onlyMonitored, setOnlyMonitored] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
          if (jurs.size && !jurs.has(org.jurisdiction)) return false;
          if (tiers.size && !tiers.has(org.tier)) return false;
          if (onlyMonitored && !org.monitored) return false;
          return true;
        })
        .map(({ org }) => org),
    [indexed, deferredQ, jurs, tiers, onlyMonitored],
  );

  const monitoredTotal = useMemo(() => orgs.filter((o) => o.monitored).length, [orgs]);
  const tierCounts = useMemo(() => {
    const m = new Map<TierKey, number>();
    for (const o of orgs) m.set(o.tier, (m.get(o.tier) ?? 0) + 1);
    return m;
  }, [orgs]);
  const jurCounts = useMemo(() => {
    const m = new Map<Jurisdiction, number>();
    for (const o of orgs) m.set(o.jurisdiction, (m.get(o.jurisdiction) ?? 0) + 1);
    return m;
  }, [orgs]);

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

  const activeFilterCount = jurs.size + tiers.size + (onlyMonitored ? 1 : 0);
  const clearFilters = () => {
    setJurs(new Set());
    setTiers(new Set());
    setOnlyMonitored(false);
  };

  return (
    <>
      <div className="sector-directory-search-row">
        <span className="ctrl-label">Search</span>
        <label className="sector-search">
          <Search />
          <span className="sr-only">Search the sector</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, acronym or what they do…"
          />
        </label>
      </div>

      <div className="sector-directory-layout">
        <aside className="sector-directory-sidebar" aria-label="Directory filters">
          <div className="sector-controls">
            <div className="sector-sidebar-summary">
              <span className="ctrl-label">Showing</span>
              <span className="sector-count" aria-live="polite">
                {visible.length} of {orgs.length} records
              </span>
            </div>

            <div className="sector-sidebar-actions">
              {monitoringAvailable ? (
                <button
                  type="button"
                  className="pill"
                  aria-pressed={onlyMonitored}
                  onClick={() => setOnlyMonitored((value) => !value)}
                >
                  On the radar<span className="pill-n">{monitoredTotal}</span>
                </button>
              ) : (
                <p className="sector-monitoring-unavailable">
                  Live radar coverage unavailable in this local preview
                </p>
              )}
              <button
                type="button"
                className="sector-filter-trigger"
                aria-expanded={filtersOpen}
                aria-controls="sector-filter-groups"
                onClick={() => setFiltersOpen((value) => !value)}
              >
                Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
              </button>
            </div>

            <div
              id="sector-filter-groups"
              className={`sector-filter-groups ${filtersOpen ? 'open' : ''}`}
            >
              <div className="ctrl-row" role="group" aria-labelledby="where-label">
                <span className="ctrl-label" id="where-label">Where</span>
                {JURISDICTIONS.map((jurisdiction) => (
                  <button
                    key={jurisdiction}
                    type="button"
                    className="pill"
                    aria-pressed={jurs.has(jurisdiction)}
                    onClick={() => setJurs((current) => toggle(current, jurisdiction))}
                  >
                    {jurisdictionLabel(jurisdiction)}
                    <span className="pill-n">{jurCounts.get(jurisdiction) ?? 0}</span>
                  </button>
                ))}
              </div>

              <div className="ctrl-row" role="group" aria-labelledby="kind-label">
                <span className="ctrl-label" id="kind-label">Kind</span>
                {TIERS.map((tier) => (
                  <button
                    key={tier.key}
                    type="button"
                    className="pill"
                    aria-pressed={tiers.has(tier.key)}
                    onClick={() => setTiers((current) => toggle(current, tier.key))}
                  >
                    {tier.label}
                    <span className="pill-n">{tierCounts.get(tier.key) ?? 0}</span>
                  </button>
                ))}
              </div>

              {activeFilterCount ? (
                <div className="sector-clear-row">
                  <button type="button" className="sector-clear" onClick={clearFilters}>
                    Clear all filters
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="sector-directory-results">
          {visible.length === 0 ? (
            <div className="empty-state">
              <p className="section-title">Nothing matches</p>
              <p>Clear a filter and try again.</p>
            </div>
          ) : null}

          {TIERS.map((t) => {
            const rows = grouped.get(t.key);
            if (!rows?.length) return null;
            const mon = rows.filter((r) => r.monitored).length;
            return (
              <section className="sector-tier" key={t.key} aria-label={t.label}>
                <header className="sector-tier-head">
                  <h3 className="day-heading">
                    {t.label}
                    <span className="day-count">{rows.length}</span>
                  </h3>
                  <p className="sector-tier-blurb">{t.blurb}</p>
                  {monitoringAvailable ? (
                    <p className="sector-tier-cov">
                      {mon} of {rows.length} on the radar
                    </p>
                  ) : null}
                </header>
                <ul className="sector-orgs">
                  {rows.map((o) => (
                    <li className="sector-org" key={`${o.tier}-${o.name}`}>
                      <div className="sector-org-head">
                        <span className={`jur jur-${o.jurisdiction}`}>
                          {jurisdictionLabel(o.jurisdiction)}
                        </span>
                        <h4>
                          {o.url ? (
                            <a href={o.url} target="_blank" rel="noopener noreferrer">
                              {o.name}
                            </a>
                          ) : (
                            o.name
                          )}
                          {o.abbrev ? <span className="sector-abbr">{o.abbrev}</span> : null}
                          {monitoringAvailable && o.monitored ? (
                            <span
                              className="radar-dot"
                              title="Already a Policai A2J source"
                              aria-label="Already a Policai A2J source"
                            >
                              ●
                            </span>
                          ) : null}
                        </h4>
                      </div>
                      <p className="sector-role">{o.role}</p>
                      {o.funded_by ? (
                        <p className="sector-funded">
                          <span>Funded by</span> {o.funded_by}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
