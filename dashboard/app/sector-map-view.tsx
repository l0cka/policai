'use client';

/*
 * The interactive sector map: MapLibre GL over OpenFreeMap vector tiles, so
 * the map carries real street-level detail at depth, with the ABS state
 * boundaries, the organisation pins and their labels drawn as overlays.
 * Clustering replaces any artificial offsetting of co-located organisations:
 * a cluster badge expands as the zoom separates its members.
 */

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/*
 * MapLibre's worker must load from a plain served file: the copy webpack
 * bundles into the Next chunk graph crashes silently on startup, leaving the
 * map wedged before its first frame (workers received messages, never
 * replied). predev/prebuild copy the worker and its shared chunk into
 * public/maplibre/.
 */
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export type MapOrg = {
  name: string;
  jurisdiction: string;
  category: string;
  lon: number;
  lat: number;
  precision: 'street' | 'locality';
  monitored: boolean;
};

export type FitSignal = { seq: number; target: 'australia' | string };
export type FlySignal = { seq: number; lon: number; lat: number };

const STYLE_URLS = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
} as const;

const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [
  [112, -44],
  [154, -9],
];

/* Anchor points for the jurisdiction labels shown at country zoom. */
const STATE_LABEL_POINTS: Record<string, [number, number]> = {
  NSW: [147.0, -32.4],
  VIC: [143.9, -36.8],
  QLD: [144.6, -22.5],
  SA: [135.2, -30.2],
  WA: [122.2, -25.6],
  TAS: [146.6, -42.1],
  NT: [133.4, -19.4],
  ACT: [149.0, -35.5],
};

const CATEGORY_COLORS: Record<'light' | 'dark', Record<string, string>> = {
  dark: {
    legal_aid: '#65d2b4',
    clc: '#e7b96c',
    wls: '#f5a0c8',
    atsils: '#b89aff',
    fvpls: '#fb923c',
  },
  light: {
    legal_aid: '#146b5a',
    clc: '#b7791f',
    wls: '#be185d',
    atsils: '#6d28d9',
    fvpls: '#c2410c',
  },
};

function themeNow(): 'light' | 'dark' {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function orgsToGeoJSON(orgs: MapOrg[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: orgs.map((org) => ({
      type: 'Feature',
      properties: {
        name: org.name,
        jurisdiction: org.jurisdiction,
        category: org.category,
        precision: org.precision,
      },
      geometry: { type: 'Point', coordinates: [org.lon, org.lat] },
    })),
  };
}

function categoryMatch(theme: 'light' | 'dark'): maplibregl.ExpressionSpecification {
  const palette = CATEGORY_COLORS[theme];
  return [
    'match',
    ['get', 'category'],
    'legal_aid',
    palette.legal_aid,
    'clc',
    palette.clc,
    'wls',
    palette.wls,
    'atsils',
    palette.atsils,
    'fvpls',
    palette.fvpls,
    palette.clc,
  ] as unknown as maplibregl.ExpressionSpecification;
}

export default function SectorMapView({
  orgs,
  stateCounts,
  selectedName,
  jurisdiction,
  fit,
  fly,
  onSelectOrg,
  onSelectJurisdiction,
}: {
  orgs: MapOrg[];
  stateCounts: Record<string, number>;
  selectedName: string;
  jurisdiction: string;
  fit: FitSignal;
  fly: FlySignal;
  onSelectOrg: (name: string, jurisdiction: string) => void;
  onSelectJurisdiction: (jurisdiction: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const bboxesRef = useRef<Record<string, [number, number, number, number]>>({});
  const stateMarkersRef = useRef<Record<string, maplibregl.Marker>>({});

  // Callback and data props are read through refs so map event handlers and
  // the style rebuild never need re-registration.
  const propsRef = useRef({ orgs, stateCounts, selectedName, jurisdiction, onSelectOrg, onSelectJurisdiction });
  propsRef.current = { orgs, stateCounts, selectedName, jurisdiction, onSelectOrg, onSelectJurisdiction };

  const fitPadding = () => ({ top: 40, left: 40, bottom: 40, right: 40 });

  // Deferred init: a map created while the tab is hidden or the container is
  // off-screen can wedge before its first frame (animation frames are paused
  // in background tabs), so creation waits until the container is actually
  // visible in a visible document.
  const [canInit, setCanInit] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || canInit) return;
    let intersecting = false;
    const tryInit = () => {
      if (intersecting && document.visibilityState === 'visible') setCanInit(true);
    };
    const observer = new IntersectionObserver((entries) => {
      intersecting = entries.some((entry) => entry.isIntersecting);
      tryInit();
    });
    observer.observe(container);
    document.addEventListener('visibilitychange', tryInit);
    tryInit();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', tryInit);
    };
  }, [canInit]);

  useEffect(() => {
    if (!canInit || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URLS[themeNow()],
      bounds: AUSTRALIA_BOUNDS,
      fitBoundsOptions: { padding: fitPadding() },
      attributionControl: false,
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as Record<string, unknown>).__sectorMap = map;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          'OpenFreeMap © OpenMapTiles · Boundaries: ABS ASGS 2021',
      }),
      'bottom-right',
    );

    const addOverlays = () => {
      const theme = themeNow();
      const halo = theme === 'dark' ? '#10141b' : '#faf8f2';
      const ink = theme === 'dark' ? '#edf2f7' : '#10213a';
      const trust = theme === 'dark' ? '#65d2b4' : '#146b5a';
      const muted = theme === 'dark' ? '#a7b2c3' : '#526176';

      map.addSource('states', { type: 'geojson', data: '/data/australia-states.geojson' });
      map.addLayer({
        id: 'state-fills',
        type: 'fill',
        source: 'states',
        paint: { 'fill-color': ink, 'fill-opacity': 0.02 },
      });
      map.addLayer({
        id: 'state-lines',
        type: 'line',
        source: 'states',
        paint: { 'line-color': muted, 'line-opacity': 0.5, 'line-width': 1 },
      });
      map.addLayer({
        id: 'state-selected',
        type: 'line',
        source: 'states',
        filter: ['==', ['get', 'jurisdiction'], propsRef.current.jurisdiction],
        paint: { 'line-color': trust, 'line-width': 2 },
      });

      map.addSource('orgs', {
        type: 'geojson',
        data: orgsToGeoJSON(propsRef.current.orgs),
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 34,
      });
      map.addLayer({
        id: 'org-clusters',
        type: 'circle',
        source: 'orgs',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': halo,
          'circle-stroke-color': trust,
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 12, 5, 15, 15, 19],
        },
      });
      map.addLayer({
        id: 'org-cluster-counts',
        type: 'symbol',
        source: 'orgs',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': ink },
      });
      map.addLayer({
        id: 'org-circles',
        type: 'circle',
        source: 'orgs',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': categoryMatch(theme),
          'circle-radius': 6,
          'circle-stroke-color': halo,
          'circle-stroke-width': 1.5,
          'circle-opacity': ['case', ['==', ['get', 'precision'], 'locality'], 0.55, 1],
        },
      });
      map.addLayer({
        id: 'org-selected',
        type: 'circle',
        source: 'orgs',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'name'], propsRef.current.selectedName]],
        paint: {
          'circle-color': categoryMatch(theme),
          'circle-radius': 9,
          'circle-stroke-color': trust,
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'org-labels',
        type: 'symbol',
        source: 'orgs',
        filter: ['!', ['has', 'point_count']],
        minzoom: 8,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'left',
          'text-offset': [0.9, 0],
          'text-optional': true,
          'text-max-width': 24,
        },
        paint: {
          'text-color': ink,
          'text-halo-color': halo,
          'text-halo-width': 1.4,
        },
      });
      readyRef.current = true;
    };

    map.on('style.load', addOverlays);

    // One click handler; the topmost relevant feature wins, so selecting an
    // organisation never also reselects the state beneath it.
    map.on('click', (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ['org-circles', 'org-clusters', 'state-fills'],
      });
      const top = features[0];
      if (!top) return;
      if (top.layer.id === 'org-circles') {
        propsRef.current.onSelectOrg(
          top.properties.name as string,
          top.properties.jurisdiction as string,
        );
        return;
      }
      if (top.layer.id === 'org-clusters') {
        const clusterId = top.properties.cluster_id as number;
        const source = map.getSource('orgs') as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
          map.easeTo({
            center: (top.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom: zoom + 0.3,
          });
        });
        return;
      }
      if (map.getZoom() < 7) {
        propsRef.current.onSelectJurisdiction(top.properties.jurisdiction as string);
      }
    });

    for (const layer of ['org-circles', 'org-clusters']) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // Jurisdiction code + count labels are HTML markers so they render in the
    // site's monospace face; they hide once the map is close.
    for (const [code, point] of Object.entries(STATE_LABEL_POINTS)) {
      const el = document.createElement('div');
      el.className = 'sector-maplibre-state-label';
      el.addEventListener('click', () => propsRef.current.onSelectJurisdiction(code));
      const marker = new maplibregl.Marker({ element: el }).setLngLat(point).addTo(map);
      stateMarkersRef.current[code] = marker;
    }
    const syncStateLabels = () => {
      const hide = map.getZoom() >= 6.5;
      for (const [code, marker] of Object.entries(stateMarkersRef.current)) {
        const el = marker.getElement();
        el.classList.toggle('is-hidden', hide);
        el.classList.toggle('is-current', code === propsRef.current.jurisdiction);
        el.textContent = `${code} ${propsRef.current.stateCounts[code] ?? 0}`;
      }
    };
    map.on('zoom', syncStateLabels);
    map.on('load', syncStateLabels);

    fetch('/data/australia-states.geojson')
      .then((response) => response.json())
      .then((data) => {
        for (const feature of data.features) {
          bboxesRef.current[feature.properties.jurisdiction] = feature.properties.bbox;
        }
      })
      .catch(() => {});

    // Re-add every overlay when the site theme changes the base style.
    const applyTheme = () => {
      readyRef.current = false;
      map.setStyle(STYLE_URLS[themeNow()]);
    };
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);

    // Returning from a background tab, nudge the render loop back to life.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        map.resize();
        map.triggerRepaint();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', applyTheme);
      document.removeEventListener('visibilitychange', onVisible);
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      stateMarkersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInit]);

  // Data + selection updates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource('orgs') as maplibregl.GeoJSONSource | undefined)?.setData(orgsToGeoJSON(orgs));
  }, [orgs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer('org-selected')) {
      map.setFilter('org-selected', [
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'name'], selectedName],
      ]);
    }
  }, [selectedName]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer('state-selected')) {
      map.setFilter('state-selected', ['==', ['get', 'jurisdiction'], jurisdiction]);
    }
    for (const [code, marker] of Object.entries(stateMarkersRef.current)) {
      marker.getElement().classList.toggle('is-current', code === jurisdiction);
    }
  }, [jurisdiction]);

  useEffect(() => {
    for (const [code, marker] of Object.entries(stateMarkersRef.current)) {
      marker.getElement().textContent = `${code} ${stateCounts[code] ?? 0}`;
    }
  }, [stateCounts]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fit.seq === 0) return;
    if (fit.target === 'australia') {
      map.fitBounds(AUSTRALIA_BOUNDS, { padding: fitPadding() });
      return;
    }
    const bbox = bboxesRef.current[fit.target];
    if (bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: fitPadding() },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fly.seq === 0) return;
    map.flyTo({ center: [fly.lon, fly.lat], zoom: Math.max(map.getZoom(), 13.5) });
  }, [fly]);

  return <div ref={containerRef} className="sector-maplibre" />;
}
