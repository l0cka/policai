#!/usr/bin/env node

/**
 * Build the state/territory GeoJSON overlay for the MapLibre sector map.
 *
 * Source: ABS ASGS 2021 State and Territory generalized boundaries, fetched
 * at 0.01-degree generalization — fine enough for boundary lines over vector
 * street tiles at any practical zoom, small enough to ship as one file.
 * Each feature carries its jurisdiction code and bounding box so the client
 * can fit the viewport to a state without recomputing geometry.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const sourceUrl =
  'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/FeatureServer/1/query?' +
  new URLSearchParams({
    where: "state_code_2021<'9'",
    outFields: 'state_code_2021,state_name_2021',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '3',
    maxAllowableOffset: '0.01',
    f: 'geojson',
  });

const jurisdictionByCode = {
  '1': 'NSW',
  '2': 'VIC',
  '3': 'QLD',
  '4': 'SA',
  '5': 'WA',
  '6': 'TAS',
  '7': 'NT',
  '8': 'ACT',
};

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`ABS boundary request failed: ${response.status} ${response.statusText}`);
}

const geojson = await response.json();
if (!Array.isArray(geojson.features) || geojson.features.length !== 8) {
  throw new Error(`Expected 8 state/territory features, received ${geojson.features?.length ?? 0}`);
}

function bboxOf(geometry) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const [lon, lat] of polygon[0]) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat].map((value) => Number(value.toFixed(3)));
}

const out = {
  type: 'FeatureCollection',
  attribution:
    'Australian Bureau of Statistics, ASGS Edition 3 (2021), State and Territory generalized boundaries',
  features: geojson.features.map((feature) => ({
    type: 'Feature',
    properties: {
      jurisdiction: jurisdictionByCode[feature.properties.state_code_2021],
      name: feature.properties.state_name_2021,
      bbox: bboxOf(feature.geometry),
    },
    geometry: feature.geometry,
  })),
};

const destination = path.resolve(process.cwd(), 'dashboard/public/data/australia-states.geojson');
await mkdir(path.dirname(destination), { recursive: true });
const body = JSON.stringify(out);
await writeFile(destination, body, 'utf8');
console.log(`Wrote ${out.features.length} features (${Math.round(body.length / 1024)} KB) to ${destination}`);
