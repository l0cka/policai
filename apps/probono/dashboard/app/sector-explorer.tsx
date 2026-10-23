'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import {
  RELATIONSHIP_EVIDENCE,
  RELATIONSHIP_LABELS,
  type RelationshipType,
} from '../lib/sector-relationships';
import {
  TIERS,
  isWomenLegalService,
  type ScoredOrg,
  type TierKey,
} from '../lib/sector-data';
import locationsRaw from '../lib/sector-locations.json';
import type { FitSignal, FlySignal, MapOrg } from './sector-map-view';
import SectorDiagram, { type SystemGroup } from './sector-diagram';

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
 * Explorer categories are finer than the data's tiers. The WLS split follows
 * WLSA's verified 13-service directory; it is not inferred from organisation
 * names. Each map record still has one primary category even where network
 * memberships or service programs overlap.
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
    match: (org) => org.tier === 'clc' && !isWomenLegalService(org),
  },
  { key: 'wls', label: 'Women’s Legal Services', match: (org) => isWomenLegalService(org) },
  { key: 'atsils', label: 'ATSILS', match: (org) => org.tier === 'atsils' },
  { key: 'fvpls', label: 'FVPLS', match: (org) => org.tier === 'fvpls' },
];

const categoryLabel = Object.fromEntries(
  SERVICE_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<CategoryKey, string>;

function categoryOf(org: ScoredOrg): CategoryKey | null {
  return SERVICE_CATEGORIES.find((c) => c.match(org))?.key ?? null;
}

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
        ? SERVICE_CATEGORIES.some((entry) => entry.key === category && entry.match(org))
        : SERVICE_CATEGORIES.some((entry) => entry.match(org)),
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

export default function SectorExplorer({
  orgs,
  monitoringAvailable,
}: {
  orgs: ScoredOrg[];
  monitoringAvailable: boolean;
}) {
  const [view, setView] = useState<View>('map');
  const [jurisdiction, setJurisdiction] = useState<MapJurisdiction>('VIC');
  const [category, setCategory] = useState<CategoryKey | null>('clc');
  const [relationship, setRelationship] = useState<RelationshipType>('secondment');
  const [selectedName, setSelectedName] = useState(
    () => firstOrgFor(orgs, 'VIC', 'clc', 'secondment')?.name ?? '',
  );
  const [fit, setFit] = useState<FitSignal>({ seq: 0, target: 'australia' });
  const [fly, setFly] = useState<FlySignal>({ seq: 0, lon: 0, lat: 0 });

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
  const selectedLocation = selectedOrg ? ORG_LOCATIONS.get(selectedOrg.name) : undefined;

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

  const drillFromSystem = (next: SystemGroup) => {
    setCategory(next);
    setSelectedName(firstOrgFor(orgs, jurisdiction, next, relationship)?.name ?? '');
    setView('map');
  };

  /* Roving tabindex + selection follows focus, as the tablist pattern
     expects: the two views are the only tabs, so arrows move both focus and
     selection; Home/End land on the first/last tab. */
  const handleTablistKeys = (
    event: KeyboardEvent<HTMLButtonElement>,
    self: View,
    other: View,
  ) => {
    const go = (target: View) => {
      event.preventDefault();
      setView(target);
      document.getElementById(`sector-view-tab-${target}`)?.focus();
    };
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Home') go(self === 'map' ? 'system' : 'map');
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') go(other);
    else if (event.key === 'End') go(self === 'map' ? 'map' : 'system');
  };

  return (
    <div className="sector-explorer">
      <div className="sector-explorer-bar">
        {view === 'map' ? (
          <div className="sector-category-chips" role="group" aria-label="Provider category">
            <button type="button" aria-pressed={category === null} onClick={() => selectCategory(null)}>
              <span className="sector-key-dot sector-key-all" aria-hidden="true" />
              All providers
            </button>
            {SERVICE_CATEGORIES.map((entry) => (
              <button
                type="button"
                key={entry.key}
                aria-pressed={category === entry.key}
                onClick={() => selectCategory(entry.key)}
              >
                <span className={`sector-key-dot sector-key-${entry.key}`} aria-hidden="true" />
                {entry.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="sector-explorer-summary">
            The NAJP funding spine, profession pathways and the wider access-to-justice ecosystem.
          </p>
        )}
        <div className="sector-view-tabs" role="tablist" aria-label="Sector explorer view">
          <button
            type="button"
            role="tab"
            id="sector-view-tab-map"
            aria-controls="sector-view-panel-map"
            aria-selected={view === 'map'}
            tabIndex={view === 'map' ? 0 : -1}
            onClick={() => setView('map')}
            onKeyDown={(event) => handleTablistKeys(event, 'map', 'system')}
          >
            Map
          </button>
          <button
            type="button"
            role="tab"
            id="sector-view-tab-system"
            aria-controls="sector-view-panel-system"
            aria-selected={view === 'system'}
            tabIndex={view === 'system' ? 0 : -1}
            onClick={() => setView('system')}
            onKeyDown={(event) => handleTablistKeys(event, 'system', 'map')}
          >
            How it connects
          </button>
        </div>
      </div>

      {view === 'system' ? (
        <div
          role="tabpanel"
          id="sector-view-panel-system"
          aria-labelledby="sector-view-tab-system"
          tabIndex={0}
          className="sector-system-panel"
        >
          <SectorDiagram onSelectGroupAction={drillFromSystem} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="sector-view-panel-map"
          aria-labelledby="sector-view-tab-map"
          tabIndex={0}
          className="sector-map-layout"
        >
          <div className="sector-map-stage">
            <SectorMapView
              orgs={mapOrgs}
              stateCounts={mapCounts}
              selectedName={selectedOrg?.name ?? ''}
              jurisdiction={jurisdiction}
              fit={fit}
              fly={fly}
              onSelectOrgAction={(name, orgJurisdiction) => {
                if (orgJurisdiction !== jurisdiction) {
                  setJurisdiction(orgJurisdiction as MapJurisdiction);
                }
                setSelectedName(name);
              }}
              onSelectJurisdictionAction={(next) => selectJurisdiction(next as MapJurisdiction)}
            />
            <p className="sector-map-caption">
              Dots are primary offices, not service areas, branches or outreach. Numbered circles
              are clusters; zoom in to split them. Faded dots are suburb-level. Addresses come from
              provider pages, geocoded with OpenStreetMap Nominatim; map data © OpenStreetMap
              contributors.
            </p>
          </div>

          {/* Live announcements stay short: the card is read by navigation,
              not re-announced on every selection change. */}
          <aside className="sector-map-card" aria-label="Selected organisation">
            <p className="sr-only" role="status">
              {selectedOrg ? `${selectedOrg.name} selected` : 'No organisations match this view.'}
            </p>
            <div className="sector-card-state">
              <label htmlFor="sector-state-select" className="ctrl-label">
                State or territory
              </label>
              <div className="sector-card-state-row">
                <select
                  id="sector-state-select"
                  value={jurisdiction}
                  onChange={(event) => {
                    const next = event.target.value as MapJurisdiction;
                    selectJurisdiction(next);
                    setFit((prev) => ({ seq: prev.seq + 1, target: next }));
                  }}
                >
                  {MAP_JURISDICTIONS.map((key) => (
                    <option key={key} value={key}>
                      {STATE_NAMES[key]} ({totals[key]} records)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setFit((prev) => ({ seq: prev.seq + 1, target: 'australia' }))}
                >
                  All of Australia
                </button>
              </div>
            </div>

            {selectedOrg ? (
              <div className="sector-card-org sector-detail-swap" key={selectedOrg.name}>
                <div className="sector-card-step">
                  <label htmlFor="sector-org-select" className="ctrl-label">
                    {selectedIndex + 1} of {visibleOrgs.length}{' '}
                    {category ? categoryLabel[category] : 'providers'} in {jurisdiction}
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
                <div className="sector-card-org-picker">
                  <span
                    className={`sector-key-dot sector-key-${categoryOf(selectedOrg) ?? 'all'}`}
                    aria-hidden="true"
                  />
                  <select
                    id="sector-org-select"
                    value={selectedOrg.name}
                    onChange={(event) => setSelectedName(event.target.value)}
                  >
                    {visibleOrgs.map((org) => (
                      <option key={`${org.tier}-${org.name}`} value={org.name}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
                <h2 className="sr-only">{selectedOrg.name}</h2>
                <p className="sector-card-meta">
                  {categoryOf(selectedOrg) === 'wls'
                    ? 'Women’s Legal Services'
                    : tierLabel[selectedOrg.tier]}
                  {selectedLocation?.suburb ? ` · ${selectedLocation.suburb}` : ''}
                  {selectedLocation?.precision === 'locality' ? ' (suburb-level)' : ''}
                  {monitoringAvailable && selectedOrg.monitored ? ' · on the radar' : ''}
                </p>
                <p className="sector-selected-role">{selectedOrg.role}</p>

                <div className="sector-evidence">
                  <p className="ctrl-label">Sourced relationships</p>
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
                      <small>Directory attribution · indicative, not provider-audited</small>
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
                    <p className="sector-evidence-empty">
                      No named {RELATIONSHIP_LABELS[relationship].toLowerCase()} link has been
                      sourced for this organisation yet.
                    </p>
                  )}
                  <p className="sector-evidence-note">
                    A link appears only when a published source describes it. Counts cover this
                    state and category.
                  </p>
                </div>

                <div className="sector-org-actions">
                  {selectedLocation ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFly((prev) => ({ seq: prev.seq + 1, lon: selectedLocation.lon, lat: selectedLocation.lat }));
                      }}
                    >
                      Show on map
                    </button>
                  ) : null}
                  {selectedOrg.url ? (
                    <a
                      className="sector-org-source-link"
                      href={selectedOrg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Organisation site ↗
                    </a>
                  ) : null}
                  {selectedLocation?.source_url ? (
                    <a
                      className="sector-org-source-link"
                      href={selectedLocation.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Address source ↗
                    </a>
                  ) : null}
                </div>
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
