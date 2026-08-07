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

export default function SectorDirectory({ orgs }: { orgs: ScoredOrg[] }) {
  const [q, setQ] = useState('');
  const [jurs, setJurs] = useState<Set<Jurisdiction>>(new Set());
  const [tiers, setTiers] = useState<Set<TierKey>>(new Set());
  const [onlyMonitored, setOnlyMonitored] = useState(false);
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

  return (
    <>
      <div className="sector-controls">
        <div className="ctrl-row">
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
          <button
            type="button"
            className="pill"
            aria-pressed={onlyMonitored}
            onClick={() => setOnlyMonitored((v) => !v)}
          >
            On the radar<span className="pill-n">{monitoredTotal}</span>
          </button>
          <span className="sector-count">
            {visible.length} of {orgs.length} shown
          </span>
        </div>

        <div className="ctrl-row">
          <span className="ctrl-label">Where</span>
          {JURISDICTIONS.map((j) => (
            <button
              key={j}
              type="button"
              className="pill"
              aria-pressed={jurs.has(j)}
              onClick={() => setJurs((s) => toggle(s, j))}
            >
              {jurisdictionLabel(j)}
              <span className="pill-n">{jurCounts.get(j) ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="ctrl-row">
          <span className="ctrl-label">Kind</span>
          {TIERS.map((t) => (
            <button
              key={t.key}
              type="button"
              className="pill"
              aria-pressed={tiers.has(t.key)}
              onClick={() => setTiers((s) => toggle(s, t.key))}
            >
              {t.label}
              <span className="pill-n">{tierCounts.get(t.key) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

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
              <h2 className="day-heading">
                {t.label}
                <span className="day-count">{rows.length}</span>
              </h2>
              <p className="sector-tier-blurb">{t.blurb}</p>
              <p className="sector-tier-cov">
                {mon} of {rows.length} on the radar
              </p>
            </header>
            <ul className="sector-orgs">
              {rows.map((o) => (
                <li className="sector-org" key={`${o.tier}-${o.name}`}>
                  <div className="sector-org-head">
                    <span className={`jur jur-${o.jurisdiction}`}>
                      {jurisdictionLabel(o.jurisdiction)}
                    </span>
                    <h3>
                      {o.url ? (
                        <a href={o.url} target="_blank" rel="noopener noreferrer">
                          {o.name}
                        </a>
                      ) : (
                        o.name
                      )}
                      {o.abbrev ? <span className="sector-abbr">{o.abbrev}</span> : null}
                      {o.monitored ? (
                        <span
                          className="radar-dot"
                          title="Already a Pro Bono Radar source"
                          aria-label="Already a Pro Bono Radar source"
                        >
                          ●
                        </span>
                      ) : null}
                    </h3>
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
    </>
  );
}
