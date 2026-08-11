'use client';

import { useMemo, useState } from 'react';
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
import {
  TIERS,
  jurisdictionLabel,
  type Jurisdiction,
  type ScoredOrg,
  type TierKey,
} from '../lib/sector-data';
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
  const preferred = visible.find((org) => org.name === 'Fitzroy Legal Service');
  return evidenced ?? preferred ?? visible[0] ?? null;
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

  const visibleOrgs = useMemo(
    () => orgsFor(orgs, jurisdiction, focusTier),
    [orgs, jurisdiction, focusTier],
  );
  const selectedOrg = visibleOrgs.find((org) => org.name === selectedName) ?? visibleOrgs[0] ?? null;
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
                  aria-pressed={relationship === type}
                  onClick={() => selectRelationship(type)}
                >
                  <span className={`sector-line-key sector-line-${type}`} />
                  {RELATIONSHIP_LABELS[type]}
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
              aria-label={`Australian access to justice organisations by jurisdiction. ${jurisdictionLabel(jurisdiction)} selected.`}
            >
              {AUSTRALIA_STATES.map((state) => {
                const key = state.jurisdiction as MapJurisdiction;
                const selected = key === jurisdiction;
                return (
                  <g
                    className={`sector-state ${selected ? 'selected' : ''}`}
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-label={`${state.name}, ${totals[key]} organisations`}
                    onClick={() => selectJurisdiction(key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectJurisdiction(key);
                      }
                    }}
                  >
                    <path d={state.path} fillRule="evenodd" />
                    <text x={state.labelX} y={state.labelY} textAnchor="middle">
                      {key}
                    </text>
                    <text
                      className="sector-state-count"
                      x={state.labelX}
                      y={state.labelY + 22}
                      textAnchor="middle"
                    >
                      {totals[key]}
                    </text>
                  </g>
                );
              })}
            </svg>

            <p className="sector-map-source">
              Map: <a href={AUSTRALIA_MAP_SOURCE_URL}>{AUSTRALIA_MAP_SOURCE}</a>. Counts are directory
              records, not service locations.
            </p>
          </div>

          <aside className="sector-map-detail" aria-live="polite">
            <header className="sector-jurisdiction-head">
              <p>{jurisdiction}</p>
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
              <label htmlFor="sector-org-select">
                {focusTier ? tierLabel[focusTier] : 'Frontline services'} in {jurisdiction}
              </label>
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
              <span>{visibleOrgs.length} records in this view</span>
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
                    <dd>{selectedOrg.monitored ? 'Active source' : 'Not currently monitored'}</dd>
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
          </aside>
        </div>
      )}
    </div>
  );
}
