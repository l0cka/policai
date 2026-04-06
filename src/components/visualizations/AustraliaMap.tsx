'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Jurisdiction } from '@/types';

interface JurisdictionData {
  count: number;
  active: number;
}

interface AustraliaMapProps {
  data: Record<Jurisdiction, JurisdictionData>;
  selectedJurisdiction: Jurisdiction | null;
  onJurisdictionClick: (jurisdiction: Jurisdiction) => void;
  onJurisdictionHover: (jurisdiction: Jurisdiction | null) => void;
}

// SVG paths for each jurisdiction
const jurisdictionPaths: Record<Jurisdiction, { paths: string[]; labelX: number; labelY: number }> = {
  wa: {
    paths: [
      `m 141,46.362183 -32,-6 -13,-4 -31,-28.0000004 -17,-7 -13,-7 -11,0 -8,6.00000002 3,10.00000038 -7,4 -4,-4 -22,8 -9,23 -11,-7 -23,11 -9,13 11,12 -3,0 -9,3 2,18 -13,-3 -16,12.999997 -3,8 2,10 5,8 -9,11 3,8 -19,-2 -12,-3 -9,3 3,8 -4,13 15,16 -3,10 -6,-6 -4,28 c 0,0 -10,-5 -13,-9 -3,-4 -19,-40 -19,-40 l 0,-5 -7,4 -20,24 -12,15 -2,16 6,17 6,14 -7,11 -20,18 -11,37 -13,17 -31,18 -10,8 -27,6 -8,7 -28,-6 -9,17 -5,4 -30,8 -7,6 -7,12 -20,7 -21,-3 -17,2 -14,9 -21,23 -19,24 -28,14 -11,10 -5,32 -9,5 -7,0 -4,-31 -8,2 -10,39 12,17 1,11 -3,27 -7,17 0,27 14,15 9,20 21,23 13,16 1,24 -15,-8 -28,-29 -3,13 17,17 10,14 -23,-3 4,9 32,35 12,21 3,17 32,38 17,25 5,27 1,16 12,26 30,43.00002 7,17 5,44 3,23 -1,13 -5,17 -7,2 -15,-6 0,11 3,24 6,10 11,-4 21,7 17,16 15,6 28,1 28,-3 29,-11 9,-8 14,-19 15,-5 11,-5 3,-16 19,-11 43,-7 27,-5 23,5 38,-7 7,0 9,2 18,-9 12,-17 5,-26 7,-5 20,-4 57,-37.00002 18,-3 38,2 21,-12 34,-18 18,-8 -34,-905.999997 z`
    ],
    labelX: -200, labelY: 450,
  },
  nt: {
    paths: [
      `m 150,54.362183 15,-3 15,4 1,-13 -15,-15 -1,-10 6,-11.0000004 11,-1 6,-30.9999996 9,3 11,-14 -6,-12 0,-10 9,0 3,-9 12,-7 2,-14 15,0 8,-11 21,6 22,-3 12,4 17,-10.000003 15,-4 -4,-20 -10,-9 -14,-2 -10,-11 24,-10 20,22 10,-7 12,19 24,6 13,-7 2,9 44,8 6,1 15,12.000003 8,1 8,-8.000003 14,2 3,7.000003 13,-3 6,13 9,1 7,-10 -7,-8.000003 14,-7 3,0 6,9.000003 7,2 5,2 5,8 -10,11 -7,11 -8,1 2,13 -6,9 -9,-3 -20,13 0,17 6,5.9999996 -9,16 1,5.0000004 -9,7 -12,20 -4,3 4,14 38,25 4,8 17,9 4,12.999997 19,-3 20,13 16,8 8,15 -18,505 -98,-3 -123,-2 -163,5 -44,1 z`,
      `m 193,-116.63782 20,4 16,-6 15,4 22,-13 8,-11 -1,-12 -11,-3 -27,10 -20,-6 -7,5 -9,11 1,5 z`,
      `m 536,17.362183 29,2 6,-7 -10,-8.0000004 3,-14 -20,-6.9999996 -2,6.9999996 -4,20.0000004 z`
    ],
    labelX: 350, labelY: 280,
  },
  qld: {
    paths: [
      `m 625,149.36218 15,5 22,8 12,9 10,21 18,7 19,15 17,-4 17,-2 11,-15 12,-21 13,-17 9,-30 2,-19 13,-33.999997 -6,-16 5,-27 -3,-12 -5,-12.0000004 8,-15 8,-11.9999996 -2,-22 10,-5 7,-9 -13,-12 22,-34.000003 8,-34 3,-9 11,-6 10,-10 5,2 -1,7 12,10 1,43 6,7.000003 8,5 -8,14 17,20 0,8 5,15 -3,35.9999996 7,25.0000004 4,18 12,6 13,-12 16,-3 4,17 21,18 10,8 -1,28.999997 5,24 -1,15 -2,14 23,48 7,13 -1,22 -7,16 13,5 -3,24 -1,10 14,17 21,14 21,2 4,12 4,14 23,4 10,21 9,-7 16,15 -5,12 11,24 11,25 4,38 0,20 14,3 4,4 2,-22 9,6 22,24 9,16 -5,32 24,33 14,3 9,14 3,17 18,13 4,13 5,13 8,7 -1,17 8,14 -2,7 -6,9 1,39 -1,10 -8,-1 5,13 9,20 -2,25 -24,2 -20,-8 -30,16 -2,15 -12,-1 -5,-1 -9,11 -5,1 2,-10 -7,-8 -5,-7 -13,-5 -13,0 -6,-10 -24,4 -15,-8 -14,5 -14,14 -157,-15 -86,-10 -117,-8 -11,-1 11,-160 -142,-7 z`,
      `m 682.5,156.86218 6.5,1 8,-2.5 11,-5.5 5.5,-1 1.5,-5.5 -2,-4.5 -15,-2.5 -8,2.5 -6.5,5 -4,5.5 -0.5,5.5 z`,
      `m 1329,683.36218 3,14 7,2 9,-13 4,-18 -11,-8 -7,5 z`
    ],
    labelX: 900, labelY: 450,
  },
  sa: {
    paths: [
      `m 700.5,1306.8622 -14,-2 -10.5,-12 -19,-34.5 -4,-13 4,-10 -5,-22 -3.5,-21.5 -13.5,-12 -14.5,-12 -11,1.5 -6.5,2 -13,-1.5 1,-6.5 12.5,-21 2.5,-11 -0.5,-11 -16.5,-26 -3.5,10 -11,37.5 -8.5,4 -23.5,0 -5,-11.5 5.5,-4 12.5,-0.5 2,-8 3,-26 5.5,-20 14,-12 3.5,-6 -0.5,-16 6.5,-3.5 2,-2.5 -11.5,-32 -4.5,1 -1,18 -7,7.5 -12.5,21.5 -6,12 -12,2 -18,12.5 -13.5,19.5 -11.5,18.5 -11.5,8.5 -11,-4.5 -11.5,-38.5 -0.5,-10 -14,-13.5 -9.5,-21.5 -12.5,-4.5 -9,-9 -4,-7.5 6,-11 -10,-5.50002 -5,-7.5 -6.5,-10.5 -9.5,-4.5 -15.5,5 -8,-6 -10.5,-5.5 -10.5,-2 -5,4 -8,0 -12,-8.5 -18,-11 -15.5,-7.5 -5.5,-1 -4.5,1 -7.5,4 -23.5,0.5 -58,4 -12.5,-297 181,-3.5 142.5,0.5 146.5,6 100,4 -37.5,644.00002 z`,
      `m 527,1164.3622 -1,11 8,6 10,0 28,-2 10,-10 -10,-11 -10,0 z`
    ],
    labelX: 450, labelY: 1050,
  },
  nsw: {
    paths: [
      `m 739,825.36218 146,12 107,10 120,13 15,-15 12,-3 10,3 21,-1 7,5 6,2 11,2 7,5 5,4 7,8 1,10 7,2 8,-4 5,-9 9,5 11,0 4,-10 -1,-9 24,-11 11,3 10,5 24,-5 -1,26 -13,24 -11,31 -13,29 0,18 -9,21 -11,24.00002 -10,12 -8,12 -5,14 -36,23 -28,33 -9,22 -11,20 -9,30 -13,13 -18,19 -10,25 -8,24 -6,36 -5,6 -66,-43 1,-15 -4,-10 0,-17 -18,-8 -21,3 -19,-4 -23,-1 -27,-9 -17,-7 -15,3 -1,6 1,6 -3,1 -7,-4 -11,-18 -12,-13 -16,-9 -5,-9 -7,-8 4,-17 -10,-4.5 -18.5,-6 -8.5,6.5 -7,-16 -1,-9 -19,-13 -9,-3 -9,5 -21,-8 z`
    ],
    labelX: 1000, labelY: 1000,
  },
  vic: {
    paths: [
      `m 721,1096.3622 -12,215 24,17 12,-8 17,7 26,14 22,16 43,-20 9,-8 13,-19 6,11 -6,14 -2,6 24,14 14,9 4,7 38,-8 31,-28 27,-9 34,-1 31,2 12,-12 -68,-45 -3,-8 3,-12 -4,-4 -2,-16 -9,-3 -12,-2 -9,4 -13,-4 -9,-4 -12,5 -9,-4 -29,-10 -10,-4 -12,0 -2,11 -6,3 -9.5,-1 -9.5,-15 -8,-14 -15,-12 -14,-5 -7.5,-13.5 -1,-14.5 -3,-10 -10,-3 -8.5,-2 -8,7 -8,-12 -5,-7 0,-9 -17,-10 -9,3 -11,-2 z`
    ],
    labelX: 870, labelY: 1250,
  },
  tas: {
    paths: [
      `m 924,1631.8622 9.5,-16 8,-3 10.5,-20.5 4.5,0 12,2 6,-7.5 8.5,-29 10,-9.5 2.5,-22.5 1,-19 4.5,-13 c 0,0 -10,-14 -12,-14 -2,0 -14.5,8.5 -14.5,8.5 l -26,0.5 -11,3 -18,4.5 -31,-15 -32,-16.5 -4.5,0.5 -3,10.5 -2.5,10.5 7.5,23.5 7.5,17.5 8.5,16 3.5,14 -3,9.5 -0.5,7.5 14.5,32 7.5,17 6,3 11,-1 10.5,6.5 z`,
      `m 985,1428.3622 6,-6 3.5,-0.5 6.5,9.5 5.5,10 -0.5,12.5 -9,2.5 -6.5,-11 -4.5,-12 z`,
      `m 823.5,1395.3622 -4.5,12 0,15.5 3.5,5.5 4.5,1 4.5,-5.5 4,-12 -0.5,-9.5 -1.5,-4 -3,-4 z`
    ],
    labelX: 920, labelY: 1530,
  },
  act: {
    paths: [
      `m 1057,1200.3622 9,-14 12,0 4,11 -9,11 -5,20 -9,-10 -3,-10 z`
    ],
    labelX: 1065, labelY: 1200,
  },
  federal: {
    paths: [],
    labelX: 100, labelY: 1550,
  },
};

const jurisdictionLabels: Record<Jurisdiction, string> = {
  wa: 'WA', nt: 'NT', sa: 'SA', qld: 'QLD',
  nsw: 'NSW', vic: 'VIC', tas: 'TAS', act: 'ACT', federal: 'FED',
};

const jurisdictionFullNames: Record<Jurisdiction, string> = {
  wa: 'Western Australia', nt: 'Northern Territory', sa: 'South Australia',
  qld: 'Queensland', nsw: 'New South Wales', vic: 'Victoria',
  tas: 'Tasmania', act: 'Australian Capital Territory', federal: 'Federal',
};

function getFillColor(count: number, maxCount: number): string {
  if (count === 0) return '#e8e5e0';
  const intensity = Math.min(count / maxCount, 1);
  // Warm institutional palette: light tan → deep navy
  if (intensity < 0.25) return '#c7d2e0';
  if (intensity < 0.5) return '#93aacc';
  if (intensity < 0.75) return '#5a7db5';
  return '#1e40af';
}

function getFillColorHover(count: number, maxCount: number): string {
  if (count === 0) return '#d4d0c8';
  const intensity = Math.min(count / maxCount, 1);
  if (intensity < 0.25) return '#aebdd4';
  if (intensity < 0.5) return '#7a96be';
  if (intensity < 0.75) return '#4468a0';
  return '#153296';
}

const renderOrder: Jurisdiction[] = ['wa', 'sa', 'nt', 'qld', 'nsw', 'vic', 'tas', 'act'];

export function AustraliaMap({
  data,
  selectedJurisdiction,
  onJurisdictionClick,
  onJurisdictionHover,
}: AustraliaMapProps) {
  const [hoveredJurisdiction, setHoveredJurisdiction] = useState<Jurisdiction | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const maxCount = Math.max(...Object.values(data).map((d) => d.count), 1);

  const handleMouseEnter = (jurisdiction: Jurisdiction) => {
    setHoveredJurisdiction(jurisdiction);
    onJurisdictionHover(jurisdiction);
  };

  const handleMouseLeave = () => {
    setHoveredJurisdiction(null);
    onJurisdictionHover(null);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, []);

  const tooltipData = hoveredJurisdiction ? data[hoveredJurisdiction] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onMouseMove={handleMouseMove}
    >
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes pulse-ring-lg {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes state-enter {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .state-path {
          animation: state-enter 0.6s ease-out both;
        }
        .pulse-circle {
          animation: pulse-ring 3s ease-out infinite;
          transform-origin: center;
        }
        .pulse-circle-lg {
          animation: pulse-ring-lg 3.5s ease-out infinite;
          animation-delay: 0.5s;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .state-path { animation: none; opacity: 1; }
          .pulse-circle, .pulse-circle-lg { animation: none; opacity: 0; }
        }
      `}</style>

      <svg
        viewBox="-603 -163 1955 1795"
        className="w-full h-full"
        role="img"
        aria-label="Interactive map of Australian jurisdictions showing AI policy density"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>Australian AI Policy Map</title>

        {/* Clean background */}
        <rect x="-603" y="-163" width="1955" height="1795" fill="#f0efed" />

        {/* Render each jurisdiction */}
        {renderOrder.map((jurisdiction, idx) => {
          const { paths, labelX, labelY } = jurisdictionPaths[jurisdiction];
          const jurisdictionData = data[jurisdiction] || { count: 0, active: 0 };
          const isSelected = selectedJurisdiction === jurisdiction;
          const isHovered = hoveredJurisdiction === jurisdiction;
          const isDimmed = selectedJurisdiction && !isSelected && !isHovered;

          if (paths.length === 0) return null;

          const fillColor = isHovered
            ? getFillColorHover(jurisdictionData.count, maxCount)
            : getFillColor(jurisdictionData.count, maxCount);

          return (
            <g
              key={jurisdiction}
              onClick={() => onJurisdictionClick(jurisdiction)}
              onMouseEnter={() => handleMouseEnter(jurisdiction)}
              onMouseLeave={handleMouseLeave}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${jurisdictionFullNames[jurisdiction]}: ${jurisdictionData.count} policies`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onJurisdictionClick(jurisdiction);
                }
              }}
              style={{
                opacity: isDimmed ? 0.35 : 1,
                transition: 'opacity 0.4s ease',
              }}
            >
              {/* Pulse rings for states with policies */}
              {jurisdictionData.count > 0 && !isDimmed && (
                <g>
                  <circle
                    cx={labelX}
                    cy={labelY}
                    r={20 + jurisdictionData.count * 4}
                    fill="none"
                    stroke={getFillColor(jurisdictionData.count, maxCount)}
                    strokeWidth="2"
                    className="pulse-circle"
                    style={{ animationDelay: `${idx * 0.4}s` }}
                  />
                  {jurisdictionData.count >= 3 && (
                    <circle
                      cx={labelX}
                      cy={labelY}
                      r={15 + jurisdictionData.count * 3}
                      fill="none"
                      stroke={getFillColor(jurisdictionData.count, maxCount)}
                      strokeWidth="1.5"
                      className="pulse-circle-lg"
                      style={{ animationDelay: `${idx * 0.4 + 1}s` }}
                    />
                  )}
                </g>
              )}

              {/* State paths */}
              {paths.map((pathD, index) => (
                <path
                  key={index}
                  d={pathD}
                  fill={fillColor}
                  stroke={isSelected ? '#1e40af' : '#a8a29e'}
                  strokeWidth={isSelected ? 4 : isHovered ? 3 : 1.5}
                  className="state-path"
                  style={{
                    animationDelay: `${idx * 0.08}s`,
                    transition: 'fill 0.3s ease, stroke 0.3s ease, stroke-width 0.3s ease',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                    transformOrigin: `${labelX}px ${labelY}px`,
                  }}
                />
              ))}

              {/* State label */}
              <g className="pointer-events-none">
                <text
                  x={labelX}
                  y={labelY - 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isSelected || isHovered ? '#1a1a1a' : '#57534e'}
                  fontSize="28"
                  fontWeight="700"
                  fontFamily="'IBM Plex Sans', sans-serif"
                  style={{ transition: 'fill 0.2s ease' }}
                >
                  {jurisdictionLabels[jurisdiction]}
                </text>
                <text
                  x={labelX}
                  y={labelY + 20}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isSelected || isHovered ? '#1e40af' : '#78716c'}
                  fontSize="16"
                  fontWeight={isSelected || isHovered ? '600' : '400'}
                  fontFamily="'IBM Plex Mono', monospace"
                  style={{ transition: 'fill 0.2s ease' }}
                >
                  {jurisdictionData.count} {jurisdictionData.count === 1 ? 'policy' : 'policies'}
                </text>
              </g>
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(-550, 1450)">
          <text x="0" y="10" fill="#57534e" fontSize="14" fontWeight="500" fontFamily="'IBM Plex Mono', monospace" letterSpacing="1" style={{ textTransform: 'uppercase' }}>
            Policy Density
          </text>
          <g transform="translate(0, 28)">
            {[
              { color: '#e8e5e0', label: 'None' },
              { color: '#c7d2e0', label: '' },
              { color: '#93aacc', label: '' },
              { color: '#5a7db5', label: '' },
              { color: '#1e40af', label: 'High' },
            ].map((item, i) => (
              <rect key={i} x={i * 44} width="40" height="20" rx="3" fill={item.color} stroke="#a8a29e" strokeWidth="0.5" />
            ))}
          </g>
          <text x="5" y="68" fill="#78716c" fontSize="12" fontFamily="'IBM Plex Mono', monospace">None</text>
          <text x="195" y="68" fill="#78716c" fontSize="12" fontFamily="'IBM Plex Mono', monospace">High</text>
        </g>
      </svg>

      {/* Federal Government bar */}
      <button
        onClick={() => onJurisdictionClick('federal')}
        onMouseEnter={() => handleMouseEnter('federal')}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'absolute bottom-10 left-4 right-4 px-5 py-3 flex items-center justify-between',
          'border rounded font-mono text-sm transition-all duration-300',
          selectedJurisdiction === 'federal'
            ? 'bg-[#1e40af] text-white border-[#1e40af]'
            : hoveredJurisdiction === 'federal'
              ? 'bg-[#1e40af]/10 border-[#1e40af]/40 text-foreground'
              : 'bg-white/80 backdrop-blur-sm border-border text-muted-foreground hover:border-[#1e40af]/30'
        )}
      >
        <span className="font-semibold font-sans">Federal Government (Commonwealth)</span>
        <span className={cn(
          'text-lg font-bold font-sans',
          selectedJurisdiction === 'federal' ? 'text-white' : 'text-[#1e40af]'
        )}>
          {data.federal?.count || 0} policies
        </span>
      </button>

      {/* Cursor-following tooltip */}
      {hoveredJurisdiction && tooltipData && hoveredJurisdiction !== 'federal' && (
        <div
          className="pointer-events-none absolute z-20 transition-opacity duration-150"
          style={{
            left: mousePos.x + 16,
            top: mousePos.y - 8,
            opacity: tooltipData ? 1 : 0,
          }}
        >
          <div className="bg-white border border-border rounded px-3 py-2 shadow-lg min-w-[160px]">
            <div className="font-sans text-sm font-semibold text-foreground">
              {jurisdictionFullNames[hoveredJurisdiction]}
            </div>
            <div className="font-mono text-xs text-muted-foreground mt-1 space-y-0.5">
              <div className="flex justify-between gap-4">
                <span>Total</span>
                <span className="font-semibold text-foreground">{tooltipData.count}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Active</span>
                <span className="font-semibold text-green-700">{tooltipData.active}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
