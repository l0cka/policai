'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  isWomensLegalService,
  type ScoredOrg,
  type TierKey,
} from '../lib/sector-data';
import locationsRaw from '../lib/sector-locations.json';
import SectorDiagram from './sector-diagram';

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

/* Keep in sync with the projection in scripts/build-sector-map.mjs. */
const MAP_BOUNDS = { minLon: 112, maxLon: 154, minLat: -44, maxLat: -9 };

function projectPoint(lon: number, lat: number): [number, number] {
  return [
    ((lon - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) *
      AUSTRALIA_MAP_VIEWBOX.width,
    ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) *
      AUSTRALIA_MAP_VIEWBOX.height,
  ];
}

type View = 'map' | 'system';

const MAP_JURISDICTIONS = ['WA', 'NT', 'SA', 'QLD', 'NSW', 'VIC', 'TAS', 'ACT'] as const;
type MapJurisdiction = (typeof MAP_JURISDICTIONS)[number];

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

type ZoomTransform = { k: number; tx: number; ty: number };

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
  const [zoom, setZoom] = useState<ZoomTransform | null>(null);
  // Fit/reset actions ease over the slow duration; wheel, pinch and drag
  // track the pointer with the transition suppressed.
  const [smooth, setSmooth] = useState(true);
  const [detailPaths, setDetailPaths] = useState<Record<string, string> | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const bboxCache = useRef<Partial<Record<MapJurisdiction, DOMRect>>>({});
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const MAX_ZOOM = 24;

  const svgPoint = (clientX: number, clientY: number): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [AUSTRALIA_MAP_VIEWBOX.width / 2, AUSTRALIA_MAP_VIEWBOX.height / 2];
    return [
      ((clientX - rect.left) / rect.width) * AUSTRALIA_MAP_VIEWBOX.width,
      ((clientY - rect.top) / rect.height) * AUSTRALIA_MAP_VIEWBOX.height,
    ];
  };

  // Multiply the scale by `factor`, keeping the map point under the anchor
  // (in base viewBox coordinates) fixed on screen.
  const zoomAt = (anchorX: number, anchorY: number, factor: number) => {
    setZoom((prev) => {
      const k0 = prev?.k ?? 1;
      const tx0 = prev?.tx ?? 0;
      const ty0 = prev?.ty ?? 0;
      const nextK = Math.min(Math.max(k0 * factor, 1), MAX_ZOOM);
      if (nextK <= 1.001) return null;
      const preX = (anchorX - tx0) / k0;
      const preY = (anchorY - ty0) / k0;
      return { k: nextK, tx: anchorX - nextK * preX, ty: anchorY - nextK * preY };
    });
  };

  const zoomFor = (key: MapJurisdiction): ZoomTransform | null => {
    let box = bboxCache.current[key];
    if (!box) {
      const path = svgRef.current?.querySelector<SVGPathElement>(
        `[data-jurisdiction="${key}"] path`,
      );
      if (!path) return null;
      box = path.getBBox();
      bboxCache.current[key] = box;
    }
    const pad = 0.14;
    const bw = box.width * (1 + pad);
    const bh = box.height * (1 + pad);
    const bx = box.x - (box.width * pad) / 2;
    const by = box.y - (box.height * pad) / 2;
    const k = Math.min(AUSTRALIA_MAP_VIEWBOX.width / bw, AUSTRALIA_MAP_VIEWBOX.height / bh, 6);
    return {
      k,
      tx: (AUSTRALIA_MAP_VIEWBOX.width - k * bw) / 2 - k * bx,
      ty: (AUSTRALIA_MAP_VIEWBOX.height - k * bh) / 2 - k * by,
    };
  };

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

  // The map recounts under the active category filter, so selecting a category
  // redraws the density shading rather than only the side panel.
  const mapCounts = useMemo(
    () =>
      Object.fromEntries(
        MAP_JURISDICTIONS.map((key) => [key, orgsFor(orgs, key, category).length]),
      ) as Record<MapJurisdiction, number>,
    [orgs, category],
  );
  const maxMapCount = Math.max(1, ...MAP_JURISDICTIONS.map((key) => mapCounts[key]));

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

  const selectJurisdiction = (next: MapJurisdiction) => {
    if (suppressClickRef.current) {
      // The pointer was dragging the map; this click is the drag's tail.
      suppressClickRef.current = false;
      return;
    }
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

  const k = zoom?.k ?? 1;

  // Pinch gestures arrive as ctrl-modified wheel events; plain scrolling is
  // left to the page. Attached natively because React's wheel listener is
  // passive and cannot preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setSmooth(false);
      const [x, y] = svgPoint(event.clientX, event.clientY);
      zoomAt(x, y, Math.exp(-event.deltaY * 0.008));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // The high-detail coastlines load once, the first time the map is close
  // enough for the base generalization to look blocky.
  useEffect(() => {
    if (k >= 3 && !detailPaths) {
      import('../lib/australia-map-detail')
        .then((module) => setDetailPaths(module.AUSTRALIA_STATE_DETAIL_PATHS))
        .catch(() => {});
    }
  }, [k, detailPaths]);

  const onMapPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!zoom || event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onMapPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / rect.width) * AUSTRALIA_MAP_VIEWBOX.width;
    const dy = ((event.clientY - drag.y) / rect.height) * AUSTRALIA_MAP_VIEWBOX.height;
    if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3) {
      drag.moved = true;
      suppressClickRef.current = true;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.moved) {
      setSmooth(false);
      setZoom((prev) => (prev ? { ...prev, tx: prev.tx + dx, ty: prev.ty + dy } : prev));
    }
  };

  const onMapPointerUp = () => {
    dragRef.current = null;
    // The suppressed click (if any) fires right after pointerup; clear the
    // flag on the next tick so future clicks land normally.
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const onMapDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    setSmooth(true);
    const [x, y] = svgPoint(event.clientX, event.clientY);
    zoomAt(x, y, 1.8);
  };

  // Approximate km scale at the centre of the current view, drawn in base
  // viewBox units so it is deterministic for server rendering.
  const centrePreY = (AUSTRALIA_MAP_VIEWBOX.height / 2 - (zoom?.ty ?? 0)) / k;
  const centreLat =
    MAP_BOUNDS.maxLat -
    (centrePreY / AUSTRALIA_MAP_VIEWBOX.height) * (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);
  const kmPerUnit =
    Math.cos((centreLat * Math.PI) / 180) *
    111.32 *
    ((MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) / AUSTRALIA_MAP_VIEWBOX.width);
  const scaleKm =
    [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2].find(
      (km) => (km / kmPerUnit) * k <= 150,
    ) ?? 2;
  const scaleUnits = (scaleKm / kmPerUnit) * k;

  // Pins: every located organisation in the current category scope, across all
  // jurisdictions. Co-located pins fan out on a small ring so none hide.
  const pins = useMemo(() => {
    const scoped = MAP_JURISDICTIONS.flatMap((key) => orgsFor(orgs, key, category));
    const located = scoped.flatMap((org) => {
      const loc = ORG_LOCATIONS.get(org.name);
      if (!loc) return [];
      const [x, y] = projectPoint(loc.lon, loc.lat);
      return [{ org, loc, x, y }];
    });
    const byCoord = new Map<string, typeof located>();
    for (const pin of located) {
      const coordKey = `${pin.x.toFixed(0)},${pin.y.toFixed(0)}`;
      byCoord.set(coordKey, [...(byCoord.get(coordKey) ?? []), pin]);
    }
    for (const group of byCoord.values()) {
      if (group.length < 2) continue;
      group.forEach((pin, index) => {
        const angle = (2 * Math.PI * index) / group.length;
        pin.x += Math.cos(angle) * 3;
        pin.y += Math.sin(angle) * 3;
      });
    }
    return located;
  }, [orgs, category]);

  const selectPin = (pin: (typeof pins)[number]) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const next = pin.org.jurisdiction as MapJurisdiction;
    if (next !== jurisdiction) setJurisdiction(next);
    setSelectedName(pin.org.name);
  };

  // Labels reveal progressively: a pin is named once no neighbour is within
  // ~18 on-screen px of it, so dense metro clusters stay clean until the
  // zoom separates them. The selected organisation is always named.
  const labelledPins = useMemo(() => {
    if (k < 8) return new Set<string>();
    const named = new Set<string>();
    for (const pin of pins) {
      let nearest = Infinity;
      for (const other of pins) {
        if (other === pin) continue;
        const d = Math.hypot(other.x - pin.x, other.y - pin.y);
        if (d < nearest) nearest = d;
      }
      if (nearest * k >= 18) named.add(pin.org.name);
    }
    return named;
  }, [pins, k]);

  return (
    <div className="sector-explorer">
      <header className="sector-explorer-head">
        <div>
          <p className="sector-explorer-kicker">
            {view === 'map' ? 'Explore by jurisdiction' : 'How the system connects'}
          </p>
          <p className="sector-explorer-summary">
            {view === 'map'
              ? 'Select a state or territory on the map, then narrow to a service category and organisation.'
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

            <div className="sector-zoom-row">
              <span className="sector-zoom-hint">
                Pinch or ⌘-scroll to zoom · double-click to zoom in · drag to pan
              </span>
              <div className="sector-zoom-toggle" role="group" aria-label="Map zoom">
                <button
                  type="button"
                  aria-pressed={!zoom}
                  onClick={() => {
                    setSmooth(true);
                    setZoom(null);
                  }}
                >
                  Australia
                </button>
                <button
                  type="button"
                  aria-pressed={Boolean(zoom)}
                  onClick={() => {
                    setSmooth(true);
                    setZoom(zoomFor(jurisdiction));
                  }}
                >
                  {STATE_NAMES[jurisdiction]}
                </button>
                <button
                  type="button"
                  aria-label="Zoom out"
                  disabled={!zoom}
                  onClick={() => {
                    setSmooth(true);
                    zoomAt(AUSTRALIA_MAP_VIEWBOX.width / 2, AUSTRALIA_MAP_VIEWBOX.height / 2, 1 / 1.6);
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Zoom in"
                  disabled={k >= MAX_ZOOM}
                  onClick={() => {
                    setSmooth(true);
                    zoomAt(AUSTRALIA_MAP_VIEWBOX.width / 2, AUSTRALIA_MAP_VIEWBOX.height / 2, 1.6);
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <svg
              ref={svgRef}
              className={`australia-sector-map ${zoom ? 'is-zoomed' : ''} ${smooth ? '' : 'is-live'}`}
              viewBox={`0 0 ${AUSTRALIA_MAP_VIEWBOX.width} ${AUSTRALIA_MAP_VIEWBOX.height}`}
              role="img"
              aria-label={`Australian access to justice organisations by jurisdiction. ${STATE_NAMES[jurisdiction]} selected${zoom ? ' and zoomed' : ''}.`}
              onPointerDown={onMapPointerDown}
              onPointerMove={onMapPointerMove}
              onPointerUp={onMapPointerUp}
              onPointerCancel={onMapPointerUp}
              onDoubleClick={onMapDoubleClick}
            >
              <defs>
                <pattern
                  id="sector-map-hatch"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform={`rotate(45) scale(${1 / k})`}
                >
                  <rect width="6" height="6" fill="var(--status-active-bg)" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--trust)" strokeOpacity="0.5" strokeWidth="1.1" />
                </pattern>
              </defs>
              <g
                className={`sector-map-states ${k >= 10 ? 'is-deep' : ''}`}
                style={{ transform: `translate(${zoom?.tx ?? 0}px, ${zoom?.ty ?? 0}px) scale(${k})` }}
              >
                {AUSTRALIA_STATES.map((state) => {
                  const key = state.jurisdiction as MapJurisdiction;
                  const selected = key === jurisdiction;
                  const isAct = key === 'ACT';
                  // Label metrics divide by the zoom scale so type and offsets
                  // hold a constant on-screen size at any zoom level.
                  const labelX = state.labelX + (LABEL_NUDGES[key]?.dx ?? 0) / k;
                  const labelY = state.labelY + (LABEL_NUDGES[key]?.dy ?? 0) / k;
                  return (
                    <g
                      className={`sector-state ${selected ? 'selected' : ''}`}
                      style={{ '--map-density': mapCounts[key] / maxMapCount } as CSSProperties}
                      key={key}
                      data-jurisdiction={key}
                      role="button"
                      tabIndex={0}
                      aria-label={`${state.name}, ${mapCounts[key]} ${category ? `${categoryLabel[category]} organisations` : 'organisations'}`}
                      onClick={() => selectJurisdiction(key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectJurisdiction(key);
                        }
                      }}
                    >
                      <path
                        d={k >= 3 && detailPaths?.[key] ? detailPaths[key] : state.path}
                        fillRule="evenodd"
                      />
                      {isAct ? (
                        <>
                          <circle
                            className="sector-state-hit"
                            cx={state.labelX}
                            cy={state.labelY + 4 / k}
                            r={15 / k}
                          />
                          <line
                            className="sector-state-leader"
                            x1={state.labelX + 8 / k}
                            y1={state.labelY + 6 / k}
                            x2={labelX - 7 / k}
                            y2={labelY - 5 / k}
                          />
                        </>
                      ) : null}
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor={isAct ? 'start' : 'middle'}
                        style={{ fontSize: 20 / k, strokeWidth: 4 / k }}
                      >
                        {key}
                      </text>
                      <text
                        className="sector-state-count"
                        x={labelX}
                        y={labelY + 22 / k}
                        textAnchor={isAct ? 'start' : 'middle'}
                        style={{ fontSize: 16 / k, strokeWidth: 4 / k }}
                      >
                        {mapCounts[key]}
                      </text>
                    </g>
                  );
                })}
                {/* Pins are a pointer shortcut; the same organisations remain
                    reachable through the accessible picker in the detail column. */}
                <g className="sector-map-pins" aria-hidden="true">
                  {pins.map((pin) => {
                    const isSelectedOrg = selectedOrg?.name === pin.org.name;
                    const inState = pin.org.jurisdiction === jurisdiction;
                    return (
                      <circle
                        key={pin.org.name}
                        className={[
                          'sector-pin',
                          `sector-pin-${categoryOf(pin.org) ?? 'all'}`,
                          pin.loc.precision === 'locality' ? 'is-locality' : '',
                          inState ? '' : 'is-dim',
                          isSelectedOrg ? 'is-current' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        cx={pin.x}
                        cy={pin.y}
                        r={(isSelectedOrg ? 5 : 3.4) / k}
                        style={{ strokeWidth: (isSelectedOrg ? 1.6 : 1) / k }}
                        onClick={() => selectPin(pin)}
                      >
                        <title>
                          {`${pin.org.name}${pin.loc.suburb ? ` — ${pin.loc.suburb}` : ''}${pin.loc.precision === 'locality' ? ' (suburb-level)' : ''}`}
                        </title>
                      </circle>
                    );
                  })}
                  {/* Close enough, the pins name themselves. */}
                  {pins
                    .filter(
                      (pin) =>
                        labelledPins.has(pin.org.name) ||
                        (k >= 8 && selectedOrg?.name === pin.org.name),
                    )
                    .map((pin) => (
                      <text
                        key={`label-${pin.org.name}`}
                        className="sector-pin-label"
                        x={pin.x + 6 / k}
                        y={pin.y + 3 / k}
                        style={{ fontSize: 9.5 / k, strokeWidth: 3 / k }}
                      >
                        {pin.org.name.length > 30 ? `${pin.org.name.slice(0, 29)}…` : pin.org.name}
                      </text>
                    ))}
                </g>
              </g>
              <g className="sector-map-kmscale" aria-hidden="true">
                <line x1="16" y1="584" x2={16 + scaleUnits} y2="584" />
                <line x1="16" y1="580" x2="16" y2="588" />
                <line x1={16 + scaleUnits} y1="580" x2={16 + scaleUnits} y2="588" />
                <text x={16 + scaleUnits / 2} y="574" textAnchor="middle">
                  {`≈ ${scaleKm} km`}
                </text>
              </g>
            </svg>

            <div className="sector-map-foot">
              <div className="sector-map-scale" aria-hidden="true">
                <span>0</span>
                <span className="sector-map-scale-ramp" />
                <span>{maxMapCount}</span>
                <span className="sector-map-scale-what">
                  {category ? categoryLabel[category] : 'frontline'} records per jurisdiction
                </span>
              </div>
              <p className="sector-map-source">
                Map: <a href={AUSTRALIA_MAP_SOURCE_URL}>{AUSTRALIA_MAP_SOURCE}</a>. Counts are
                directory records.
                {pins.length
                  ? ` Pins mark ${pins.length} primary-office locations compiled from organisation and peak-body pages, geocoded with OpenStreetMap Nominatim (© OpenStreetMap contributors); hollow pins are suburb-level. Select a pin to open its record.`
                  : ' Counts are not service locations.'}
              </p>
            </div>
          </div>

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
      )}
    </div>
  );
}
