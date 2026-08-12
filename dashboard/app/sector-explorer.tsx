'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  RELATIONSHIP_EVIDENCE,
  RELATIONSHIP_LABELS,
  type RelationshipType,
} from '../lib/sector-relationships';
import {
  TIERS,
  isWomensLegalService,
  type ScoredOrg,
  type TierKey,
} from '../lib/sector-data';
import locationsRaw from '../lib/sector-locations.json';
import type { FitSignal, MapOrg } from './sector-map-view';
import SectorDiagram from './sector-diagram';

/* MapLibre needs the browser; the map pane loads client-side only. */
const SectorMapView = dynamic(() => import('./sector-map-view'), {
  ssr: false,
  loading: () => <div className="sector-maplibre is-loading" aria-hidden="true" />,
});

type View = 'map' | 'system';

const MAP_JURISDICTIONS = ['WA', 'NT', 'SA', 'QLD', 'NSW', 'VIC', 'TAS', 'ACT'] as const;
type MapJurisdiction = (typeof MAP_JURISDICTIONS)[number];

const STATE_NAMES: Record<MapJurisdiction, string> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory',
};

/*
 * Explorer categories are finer than the data's tiers: women's legal services
 * sit inside the CLC tier in every source directory and are split here by
 * their own names (see isWomensLegalService).
 */
type CategoryKey = 'legal_aid' | 'clc' | 'wls' | 'atsils' | 'fvpls';

const SERVICE_CATEGORIES: Array<{
  key: CategoryKey;
  label: string;
  match: (org: ScoredOrg) => boolean;
}> = [
  { key: 'legal_aid', label: 'Legal Aid', match: (org) => org.tier === 'legal_aid' },
  {
    key: 'clc',
    label: 'Community Legal Centres',
    match: (org) => org.tier === 'clc' && !isWomensLegalService(org),
  },
  { key: 'wls', label: 'Women’s Legal Services', match: (org) => isWomensLegalService(org) },
  { key: 'atsils', label: 'ATSILS', match: (org) => org.tier === 'atsils' },
  { key: 'fvpls', label: 'FVPLS', match: (org) => org.tier === 'fvpls' },
];

const categoryLabel = Object.fromEntries(
  SERVICE_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<CategoryKey, string>;

function categoryOf(org: ScoredOrg): CategoryKey | null {
  return SERVICE_CATEGORIES.find((c) => c.match(org))?.key ?? null;
}

/* The System diagram's delivery groups map onto explorer categories. */
const CATEGORY_FOR_TIER: Partial<Record<TierKey, CategoryKey>> = {
  legal_aid: 'legal_aid',
  clc: 'clc',
  atsils: 'atsils',
  fvpls: 'fvpls',
};

type OrgLocation = {
  name: string;
  suburb: string | null;
  state: string;
  lat: number;
  lon: number;
  precision: 'street' | 'locality';
  source_url: string | null;
};

const ORG_LOCATIONS = new Map(
  (locationsRaw.locations as OrgLocation[]).map((loc) => [loc.name, loc]),
);

const RELATIONSHIPS = Object.keys(RELATIONSHIP_LABELS) as RelationshipType[];
const tierLabel = Object.fromEntries(TIERS.map((tier) => [tier.key, tier.label])) as Record<
  TierKey,
  string
>;

function orgsFor(
  orgs: ScoredOrg[],
  jurisdiction: MapJurisdiction,
  category: CategoryKey | null,
) {
  return orgs
    .filter((org) => org.jurisdiction === jurisdiction)
    .filter((org) =>
      category
        ? SERVICE_CATEGORIES.find((c) => c.key === category)!.match(org)
        : SERVICE_CATEGORIES.some((c) => c.match(org)),
    )
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
  category: CategoryKey | null,
  relationship: RelationshipType,
) {
  const visible = orgsFor(orgs, jurisdiction, category);
  const evidenced = visible.find((org) => evidenceFor(org.name, relationship).length);
  const monitored = visible.find((org) => org.monitored);
  return evidenced ?? monitored ?? visible[0] ?? null;
}

export default function SectorExplorer({ orgs }: { orgs: ScoredOrg[] }) {
  const [view, setView] = useState<View>('map');
  const [jurisdiction, setJurisdiction] = useState<MapJurisdiction>('VIC');
  const [category, setCategory] = useState<CategoryKey | null>('clc');
  const [relationship, setRelationship] = useState<RelationshipType>('secondment');
  const [selectedName, setSelectedName] = useState(
    () => firstOrgFor(orgs, 'VIC', 'clc', 'secondment')?.name ?? '',
  );
  const [fit, setFit] = useState<FitSignal>({ seq: 0, target: 'australia' });

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

  // Per-state counts under the active category filter, shown on the map's
  // jurisdiction labels at country zoom.
  const mapCounts = useMemo(
    () =>
      Object.fromEntries(
        MAP_JURISDICTIONS.map((key) => [key, orgsFor(orgs, key, category).length]),
      ) as Record<MapJurisdiction, number>,
    [orgs, category],
  );

  const visibleOrgs = useMemo(
    () => orgsFor(orgs, jurisdiction, category),
    [orgs, jurisdiction, category],
  );
  const selectedOrg = visibleOrgs.find((org) => org.name === selectedName) ?? visibleOrgs[0] ?? null;
  const selectedIndex = selectedOrg ? visibleOrgs.indexOf(selectedOrg) : -1;
  const selectedEvidence = selectedOrg ? evidenceFor(selectedOrg.name, relationship) : [];

  const serviceCounts = useMemo(
    () =>
      SERVICE_CATEGORIES.map((entry) => ({
        ...entry,
        count: orgs.filter((org) => org.jurisdiction === jurisdiction && entry.match(org)).length,
      })),
    [orgs, jurisdiction],
  );
  const frontlineTotal = serviceCounts.reduce((sum, entry) => sum + entry.count, 0);

  // Sourced-evidence counts within the current jurisdiction and category scope.
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

  // Every located organisation in the current category scope, for the map.
  const mapOrgs = useMemo<MapOrg[]>(
    () =>
      MAP_JURISDICTIONS.flatMap((key) => orgsFor(orgs, key, category)).flatMap((org) => {
        const loc = ORG_LOCATIONS.get(org.name);
        if (!loc) return [];
        return [
          {
            name: org.name,
            jurisdiction: org.jurisdiction,
            category: categoryOf(org) ?? 'clc',
            lon: loc.lon,
            lat: loc.lat,
            precision: loc.precision,
            monitored: org.monitored,
          },
        ];
      }),
    [orgs, category],
  );

  const selectJurisdiction = (next: MapJurisdiction) => {
    if (next === jurisdiction) return;
    setJurisdiction(next);
    setSelectedName(firstOrgFor(orgs, next, category, relationship)?.name ?? '');
  };

  const selectCategory = (next: CategoryKey | null) => {
    setCategory(next);
    setSelectedName(firstOrgFor(orgs, jurisdiction, next, relationship)?.name ?? '');
  };

  const stepOrg = (delta: number) => {
    if (!visibleOrgs.length) return;
    const next = Math.min(Math.max(selectedIndex + delta, 0), visibleOrgs.length - 1);
    setSelectedName(visibleOrgs[next].name);
  };

  const drillFromSystem = (tier: TierKey) => {
    const next = CATEGORY_FOR_TIER[tier] ?? null;
    setCategory(next);
    setSelectedName(firstOrgFor(orgs, jurisdiction, next, relationship)?.name ?? '');
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
              ? 'Zoom to street level, select organisations on the map, or narrow by service category.'
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
          <div className="sector-map-toolbar">
            <div className="sector-zoom-toggle" role="group" aria-label="Fit map to">
              <button
                type="button"
                onClick={() => setFit((prev) => ({ seq: prev.seq + 1, target: 'australia' }))}
              >
                Australia
              </button>
              <button
                type="button"
                onClick={() => setFit((prev) => ({ seq: prev.seq + 1, target: jurisdiction }))}
              >
                {STATE_NAMES[jurisdiction]}
              </button>
            </div>
          </div>

          <div className="sector-map-stage">
            <SectorMapView
              orgs={mapOrgs}
              stateCounts={mapCounts}
              selectedName={selectedOrg?.name ?? ''}
              jurisdiction={jurisdiction}
              fit={fit}
              onSelectOrg={(name, orgJurisdiction) => {
                if (orgJurisdiction !== jurisdiction) {
                  setJurisdiction(orgJurisdiction as MapJurisdiction);
                }
                setSelectedName(name);
              }}
              onSelectJurisdiction={(next) => selectJurisdiction(next as MapJurisdiction)}
            />

            <aside className="sector-map-detail" aria-live="polite">
              <div className="sector-detail-swap" key={`${jurisdiction}-${category ?? 'all'}`}>
                <header className="sector-jurisdiction-head">
                  <p>{jurisdiction}</p>
                  <span className="sector-jurisdiction-name">{STATE_NAMES[jurisdiction]}</span>
                  <strong>{totals[jurisdiction]} organisations in the directory</strong>
                </header>

                <div className="sector-breakdown">
                  <p className="sector-panel-label">Filter by service category</p>
                  <button
                    type="button"
                    aria-pressed={category === null}
                    onClick={() => selectCategory(null)}
                  >
                    <span className="sector-key-dot sector-key-all" />
                    <span>All frontline services</span>
                    <strong>{frontlineTotal}</strong>
                  </button>
                  {serviceCounts.map((entry) => (
                    <button
                      type="button"
                      key={entry.key}
                      aria-pressed={category === entry.key}
                      onClick={() => selectCategory(entry.key)}
                    >
                      <span className={`sector-key-dot sector-key-${entry.key}`} />
                      <span>{entry.label}</span>
                      <strong>{entry.count}</strong>
                    </button>
                  ))}
                </div>

                <div className="sector-org-picker">
                  <div className="sector-org-picker-head">
                    <label htmlFor="sector-org-select">
                      {category ? categoryLabel[category] : 'Frontline services'} in {jurisdiction}
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
                      <span className={`sector-key-dot sector-key-${categoryOf(selectedOrg) ?? 'all'}`} />
                      <h3>{selectedOrg.name}</h3>
                    </div>
                    <dl>
                      <div>
                        <dt>Type</dt>
                        <dd>
                          {categoryOf(selectedOrg) === 'wls'
                            ? 'Women’s Legal Services'
                            : tierLabel[selectedOrg.tier]}
                        </dd>
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
                      <p className="sector-panel-label">Sourced relationships</p>
                      <div
                        className="sector-relationship-chips"
                        role="group"
                        aria-label="Relationship type"
                      >
                        {RELATIONSHIPS.map((type) => (
                          <button
                            type="button"
                            key={type}
                            className={relationshipCounts[type] === 0 ? 'sector-chip-empty' : undefined}
                            aria-pressed={relationship === type}
                            onClick={() => setRelationship(type)}
                          >
                            {RELATIONSHIP_LABELS[type]}
                            <span aria-label={`${relationshipCounts[type]} sourced in this view`}>
                              {relationshipCounts[type]}
                            </span>
                          </button>
                        ))}
                      </div>
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
                      <p className="sector-evidence-note">
                        Named links appear only when a published source describes that relationship.
                        Historical examples are labelled; general support is not converted into a
                        specific link. Counts cover the current map view.
                      </p>
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

          <div className="sector-map-foot">
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
            <p className="sector-map-source">
              Counts are directory records. Pins mark {mapOrgs.length} primary-office locations
              compiled from organisation and peak-body pages, geocoded with OpenStreetMap Nominatim
              (© OpenStreetMap contributors); faded pins are suburb-level. Select a pin to open its
              record; numbered circles are clusters that split apart as you zoom in.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
