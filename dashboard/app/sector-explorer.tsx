'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import {
  AUSTRALIA_MAP_SOURCE,
  AUSTRALIA_MAP_SOURCE_URL,
  AUSTRALIA_MAP_VIEWBOX,
  AUSTRALIA_STATES,
} from '../lib/australia-map-data';
import {
  RELATIONSHIP_EVIDENCE,
  RELATIONSHIP_LABELS,
  type RelationshipType,
} from '../lib/sector-relationships';
import { TIERS, type ScoredOrg, type TierKey } from '../lib/sector-data';
import SectorDiagram from './sector-diagram';

type View = 'map' | 'system';

const MAP_JURISDICTIONS = ['WA', 'NT', 'SA', 'QLD', 'NSW', 'VIC', 'TAS', 'ACT'] as const;
type MapJurisdiction = (typeof MAP_JURISDICTIONS)[number];

const SERVICE_CATEGORIES: Array<{ key: TierKey; label: string }> = [
  { key: 'legal_aid', label: 'Legal Aid' },
  { key: 'clc', label: 'CLCs + Women’s Legal Services' },
  { key: 'atsils', label: 'ATSILS' },
  { key: 'fvpls', label: 'FVPLS' },
];

/*
 * The ACT is a dozen viewBox units wide, so its label moves offshore on a
 * leader line and an invisible circle widens the click target. Victoria's
 * generated anchor sits low enough that the count lands on the coastline.
 */
const LABEL_NUDGES: Partial<Record<MapJurisdiction, { dx?: number; dy?: number }>> = {
  ACT: { dx: 56, dy: 10 },
  VIC: { dx: -14, dy: -14 },
  TAS: { dy: -6 },
};

const STATE_NAMES = Object.fromEntries(
  AUSTRALIA_STATES.map((state) => [state.jurisdiction, state.name]),
) as Record<MapJurisdiction, string>;

const RELATIONSHIPS = Object.keys(RELATIONSHIP_LABELS) as RelationshipType[];
const tierLabel = Object.fromEntries(TIERS.map((tier) => [tier.key, tier.label])) as Record<
  TierKey,
  string
>;

function orgsFor(
  orgs: ScoredOrg[],
  jurisdiction: MapJurisdiction,
  focusTier: TierKey | null,
) {
  return orgs
    .filter((org) => org.jurisdiction === jurisdiction)
    .filter((org) => (focusTier ? org.tier === focusTier : SERVICE_CATEGORIES.some((c) => c.key === org.tier)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function evidenceFor(name: string, relationship: RelationshipType) {
  return RELATIONSHIP_EVIDENCE.filter(
    (item) => item.type === relationship && item.organisations.includes(name),
  );
}

function firstOrgFor(
  orgs: ScoredOrg[],
  jurisdiction: MapJurisdiction,
  focusTier: TierKey | null,
  relationship: RelationshipType,
) {
  const visible = orgsFor(orgs, jurisdiction, focusTier);
  const evidenced = visible.find((org) => evidenceFor(org.name, relationship).length);
  const monitored = visible.find((org) => org.monitored);
  return evidenced ?? monitored ?? visible[0] ?? null;
}

export default function SectorExplorer({ orgs }: { orgs: ScoredOrg[] }) {
  const [view, setView] = useState<View>('map');
  const [jurisdiction, setJurisdiction] = useState<MapJurisdiction>('VIC');
  const [focusTier, setFocusTier] = useState<TierKey | null>('clc');
  const [relationship, setRelationship] = useState<RelationshipType>('secondment');
  const [selectedName, setSelectedName] = useState(
    () => firstOrgFor(orgs, 'VIC', 'clc', 'secondment')?.name ?? '',
  );

  const totals = useMemo(
    () =>
      Object.fromEntries(
        MAP_JURISDICTIONS.map((key) => [
          key,
          orgs.filter((org) => org.jurisdiction === key).length,
        ]),
      ) as Record<MapJurisdiction, number>,
    [orgs],
  );

  // The map recounts under the active category filter, so selecting a tier
  // redraws the density shading rather than only the side panel.
  const mapCounts = useMemo(
    () =>
      Object.fromEntries(
        MAP_JURISDICTIONS.map((key) => [key, orgsFor(orgs, key, focusTier).length]),
      ) as Record<MapJurisdiction, number>,
    [orgs, focusTier],
  );
  const maxMapCount = Math.max(1, ...MAP_JURISDICTIONS.map((key) => mapCounts[key]));

  const visibleOrgs = useMemo(
    () => orgsFor(orgs, jurisdiction, focusTier),
    [orgs, jurisdiction, focusTier],
  );
  const selectedOrg = visibleOrgs.find((org) => org.name === selectedName) ?? visibleOrgs[0] ?? null;
  const selectedIndex = selectedOrg ? visibleOrgs.indexOf(selectedOrg) : -1;
  const selectedEvidence = selectedOrg ? evidenceFor(selectedOrg.name, relationship) : [];

  const serviceCounts = useMemo(
    () =>
      SERVICE_CATEGORIES.map((category) => ({
        ...category,
        count: orgs.filter(
          (org) => org.jurisdiction === jurisdiction && org.tier === category.key,
        ).length,
      })),
    [orgs, jurisdiction],
  );

  // Sourced-evidence counts within the current jurisdiction and tier scope.
  // Funding counts directory attributions; the other types count named links.
  const relationshipCounts = useMemo(
    () =>
      Object.fromEntries(
        RELATIONSHIPS.map((type) => [
          type,
          type === 'funding'
            ? visibleOrgs.filter((org) => org.funded_by).length
            : visibleOrgs.filter((org) => evidenceFor(org.name, type).length).length,
        ]),
      ) as Record<RelationshipType, number>,
    [visibleOrgs],
  );

  const selectJurisdiction = (next: MapJurisdiction) => {
    setJurisdiction(next);
    setSelectedName(firstOrgFor(orgs, next, focusTier, relationship)?.name ?? '');
  };

  const selectTier = (next: TierKey | null) => {
    setFocusTier(next);
    setSelectedName(firstOrgFor(orgs, jurisdiction, next, relationship)?.name ?? '');
  };

  const selectRelationship = (next: RelationshipType) => {
    setRelationship(next);
    setSelectedName(firstOrgFor(orgs, jurisdiction, focusTier, next)?.name ?? '');
  };

  const stepOrg = (delta: number) => {
    if (!visibleOrgs.length) return;
    const next = Math.min(Math.max(selectedIndex + delta, 0), visibleOrgs.length - 1);
    setSelectedName(visibleOrgs[next].name);
  };

  const drillFromSystem = (tier: TierKey) => {
    setFocusTier(tier);
    setSelectedName(firstOrgFor(orgs, jurisdiction, tier, relationship)?.name ?? '');
    setView('map');
  };

  return (
    <div className="sector-explorer">
      <header className="sector-explorer-head">
        <div>
          <p className="sector-explorer-kicker">
            {view === 'map' ? 'Explore by jurisdiction' : 'How the system connects'}
          </p>
          <p className="sector-explorer-summary">
            {view === 'map'
              ? 'Select a state or territory, then inspect organisations and sourced relationships.'
              : 'Select a delivery group to open its organisations on the map.'}
          </p>
        </div>
        <div className="sector-view-tabs" role="tablist" aria-label="Sector explorer view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'map'}
            onClick={() => setView('map')}
          >
            Map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'system'}
            onClick={() => setView('system')}
          >
            System
          </button>
        </div>
      </header>

      {view === 'system' ? (
        <div role="tabpanel" aria-label="System view" className="sector-system-panel">
          <SectorDiagram onSelectTier={drillFromSystem} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Map view" className="sector-map-layout">
          <aside className="sector-map-key" aria-label="Map filters and legend">
            <p className="sector-panel-label">Service categories</p>
            <div className="sector-category-list">
              <button
                type="button"
                aria-pressed={focusTier === null}
                onClick={() => selectTier(null)}
              >
                <span className="sector-key-dot sector-key-all" />
                All frontline services
              </button>
              {SERVICE_CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category.key}
                  aria-pressed={focusTier === category.key}
                  onClick={() => selectTier(category.key)}
                >
                  <span className={`sector-key-dot sector-key-${category.key}`} />
                  {category.label}
                </button>
              ))}
            </div>

            <p className="sector-panel-label sector-key-section">Relationship type</p>
            <div className="sector-relationship-list">
              {RELATIONSHIPS.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={relationshipCounts[type] === 0 ? 'sector-relationship-empty' : undefined}
                  aria-pressed={relationship === type}
                  onClick={() => selectRelationship(type)}
                >
                  <span className={`sector-line-key sector-line-${type}`} />
                  {RELATIONSHIP_LABELS[type]}
                  <strong className="sector-count" aria-label={`${relationshipCounts[type]} sourced in this view`}>
                    {relationshipCounts[type]}
                  </strong>
                </button>
              ))}
            </div>

            <p className="sector-map-note">
              Named links appear only when a published source describes that relationship. Historical
              examples are labelled; general support is not converted into a specific link.
            </p>
          </aside>

          <div className="sector-map-canvas">
            <div className="sector-map-government" aria-label="National funding context">
              <div>
                <span>Australian Government</span>
                <small>NAJP 2025–30 · $3.9b over five years</small>
              </div>
              <div>
                <span>State and territory governments</span>
                <small>Agreement parties / administrators · separate co-funding may also apply</small>
              </div>
            </div>

            <svg
              className="australia-sector-map"
              viewBox={`0 0 ${AUSTRALIA_MAP_VIEWBOX.width} ${AUSTRALIA_MAP_VIEWBOX.height}`}
              role="img"
              aria-label={`Australian access to justice organisations by jurisdiction. ${STATE_NAMES[jurisdiction]} selected.`}
            >
              <defs>
                <pattern
                  id="sector-map-hatch"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="6" height="6" fill="var(--status-active-bg)" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--trust)" strokeOpacity="0.5" strokeWidth="1.1" />
                </pattern>
              </defs>
              {AUSTRALIA_STATES.map((state) => {
                const key = state.jurisdiction as MapJurisdiction;
                const selected = key === jurisdiction;
                const isAct = key === 'ACT';
                const labelX = state.labelX + (LABEL_NUDGES[key]?.dx ?? 0);
                const labelY = state.labelY + (LABEL_NUDGES[key]?.dy ?? 0);
                return (
                  <g
                    className={`sector-state ${selected ? 'selected' : ''}`}
                    style={{ '--map-density': mapCounts[key] / maxMapCount } as CSSProperties}
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-label={`${state.name}, ${mapCounts[key]} ${focusTier ? `${tierLabel[focusTier]} organisations` : 'organisations'}`}
                    onClick={() => selectJurisdiction(key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectJurisdiction(key);
                      }
                    }}
                  >
                    <path d={state.path} fillRule="evenodd" />
                    {isAct ? (
                      <>
                        <circle className="sector-state-hit" cx={state.labelX} cy={state.labelY + 4} r="15" />
                        <line
                          className="sector-state-leader"
                          x1={state.labelX + 8}
                          y1={state.labelY + 6}
                          x2={labelX - 7}
                          y2={labelY - 5}
                        />
                      </>
                    ) : null}
                    <text x={labelX} y={labelY} textAnchor={isAct ? 'start' : 'middle'}>
                      {key}
                    </text>
                    <text
                      className="sector-state-count"
                      x={labelX}
                      y={labelY + 22}
                      textAnchor={isAct ? 'start' : 'middle'}
                    >
                      {mapCounts[key]}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="sector-map-scale" aria-hidden="true">
              <span>0</span>
              <span className="sector-map-scale-ramp" />
              <span>{maxMapCount}</span>
              <span className="sector-map-scale-what">
                {focusTier ? tierLabel[focusTier] : 'frontline'} records per jurisdiction
              </span>
            </div>

            <p className="sector-map-source">
              Map: <a href={AUSTRALIA_MAP_SOURCE_URL}>{AUSTRALIA_MAP_SOURCE}</a>. Counts are directory
              records, not service locations.
            </p>
          </div>

          <aside className="sector-map-detail" aria-live="polite">
            <div className="sector-detail-swap" key={`${jurisdiction}-${focusTier ?? 'all'}`}>
              <header className="sector-jurisdiction-head">
                <p>{jurisdiction}</p>
                <span className="sector-jurisdiction-name">{STATE_NAMES[jurisdiction]}</span>
                <strong>{totals[jurisdiction]} organisations</strong>
              </header>

              <div className="sector-breakdown">
                <p className="sector-panel-label">Frontline service records</p>
                {serviceCounts.map((category) => (
                  <button
                    type="button"
                    key={category.key}
                    aria-pressed={focusTier === category.key}
                    onClick={() => selectTier(category.key)}
                  >
                    <span className={`sector-key-dot sector-key-${category.key}`} />
                    <span>{category.label}</span>
                    <strong>{category.count}</strong>
                  </button>
                ))}
              </div>

              <div className="sector-org-picker">
                <div className="sector-org-picker-head">
                  <label htmlFor="sector-org-select">
                    {focusTier ? tierLabel[focusTier] : 'Frontline services'} in {jurisdiction}
                  </label>
                  <div className="sector-org-step" role="group" aria-label="Step through organisations">
                    <button
                      type="button"
                      aria-label="Previous organisation"
                      disabled={selectedIndex <= 0}
                      onClick={() => stepOrg(-1)}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label="Next organisation"
                      disabled={selectedIndex < 0 || selectedIndex >= visibleOrgs.length - 1}
                      onClick={() => stepOrg(1)}
                    >
                      ›
                    </button>
                  </div>
                </div>
                <select
                  id="sector-org-select"
                  value={selectedOrg?.name ?? ''}
                  onChange={(event) => setSelectedName(event.target.value)}
                >
                  {visibleOrgs.map((org) => (
                    <option key={`${org.tier}-${org.name}`} value={org.name}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <span>
                  {selectedIndex >= 0 ? `${selectedIndex + 1} of ` : ''}
                  {visibleOrgs.length} records in this view
                </span>
              </div>

              {selectedOrg ? (
                <div className="sector-selected-org">
                  <div className="sector-selected-name">
                    <span className={`sector-key-dot sector-key-${selectedOrg.tier}`} />
                    <h3>{selectedOrg.name}</h3>
                  </div>
                  <dl>
                    <div>
                      <dt>Type</dt>
                      <dd>{tierLabel[selectedOrg.tier]}</dd>
                    </div>
                    <div>
                      <dt>Jurisdiction</dt>
                      <dd>{selectedOrg.jurisdiction}</dd>
                    </div>
                    <div>
                      <dt>Radar</dt>
                      <dd>
                        <span
                          className={`sector-radar-dot ${selectedOrg.monitored ? 'is-on' : ''}`}
                          aria-hidden="true"
                        />
                        {selectedOrg.monitored ? 'Active source' : 'Not currently monitored'}
                      </dd>
                    </div>
                  </dl>
                  <p className="sector-selected-role">{selectedOrg.role}</p>

                  <div className="sector-evidence">
                    <p className="sector-panel-label">
                      {RELATIONSHIP_LABELS[relationship]} evidence
                    </p>
                    {relationship === 'funding' ? (
                      <div className="sector-evidence-item">
                        <p>{selectedOrg.funded_by || 'No funding attribution recorded.'}</p>
                        <small>Directory attribution · indicative, not audited</small>
                      </div>
                    ) : selectedEvidence.length ? (
                      selectedEvidence.map((item) => (
                        <div className="sector-evidence-item" key={item.sourceUrl}>
                          <p>{item.summary}</p>
                          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                            {item.sourceLabel}
                          </a>
                          <small>
                            {item.status === 'documented-example' ? 'Documented example' : 'Current description'}
                            {' · '}
                            {item.evidenceDate} · checked {item.checkedAt}
                          </small>
                        </div>
                      ))
                    ) : (
                      <div className="sector-evidence-empty">
                        No named {RELATIONSHIP_LABELS[relationship].toLowerCase()} relationship has been
                        sourced for this organisation yet.
                      </div>
                    )}
                  </div>

                  {selectedOrg.url ? (
                    <a
                      className="sector-org-source-link"
                      href={selectedOrg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open organisation source
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="sector-evidence-empty">No organisations match this view.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
