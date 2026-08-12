'use client';

import type { KeyboardEvent } from 'react';
import type { TierKey } from '../lib/sector-data';

function activateOnKeyboard(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

/*
 * Fixed-geometry system diagram. Two rails: public funding flows down the
 * left three-quarters, professional capacity down the right quarter; the
 * dashed capacity rail joins the delivery bus once, below the boxes, so no
 * connector crosses a node or carries a label on top of another line.
 */
export default function SectorDiagram({
  onSelectTier,
}: {
  onSelectTier?: (tier: TierKey) => void;
}) {
  const selectable = Boolean(onSelectTier);

  const node = (tier: TierKey) => ({
    className: selectable ? 'd-node d-node-selectable' : 'd-node',
    role: selectable ? ('button' as const) : undefined,
    tabIndex: selectable ? 0 : undefined,
    onClick: () => onSelectTier?.(tier),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) =>
      activateOnKeyboard(event, () => onSelectTier?.(tier)),
  });

  return (
    <figure className="diagram diagram-interactive">
      <div
        className="diagram-frame"
        role="region"
        aria-label="Interactive funding, administration and pro bono capacity diagram"
        tabIndex={0}
      >
        <svg
          viewBox="0 0 1280 620"
          role="img"
          aria-label="The Australian Government provides 3.9 billion dollars over five years through the National Access to Justice Partnership 2025 to 2030. State and territory governments are agreement parties and administrators, and may provide separate co-funding. The Partnership funds Legal Aid Commissions, Community Legal Centres and Women's Legal Services, Aboriginal and Torres Strait Islander Legal Services, and Family Violence Prevention Legal Services. The private profession contributes capacity through referrals, clinics, secondments and project support. These channels help people and communities with legal need."
        >
          <defs>
            <marker
              id="sd-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5.5"
              markerHeight="5.5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10z" fill="context-stroke" />
            </marker>
          </defs>

          <text x="200" y="20" className="d-label">Public funding</text>
          <text x="990" y="20" className="d-label">Professional capacity</text>

          {/* Row 1 — sources */}
          <rect className="d-box" x="200" y="32" width="350" height="68" rx="4" />
          <text x="375" y="61" textAnchor="middle" className="d-t">Australian Government</text>
          <text x="375" y="83" textAnchor="middle" className="d-n">provides the $3.9b NAJP funding</text>

          <rect className="d-box" x="570" y="32" width="380" height="68" rx="4" />
          <text x="760" y="61" textAnchor="middle" className="d-t">State &amp; territory governments</text>
          <text x="760" y="83" textAnchor="middle" className="d-n">agreement parties · administrators · co-funders</text>

          <rect className="d-box d-box-pb" x="980" y="32" width="280" height="68" rx="4" />
          <text x="1120" y="61" textAnchor="middle" className="d-t">Private profession</text>
          <text x="1120" y="83" textAnchor="middle" className="d-n">firms · barristers · in-house teams</text>

          <path className="d-flow" d="M375 100 V148" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-by" d="M760 100 V148" markerEnd="url(#sd-arrow)" />
          <text x="772" y="130" className="d-n">agreement</text>

          {/* Row 2 — the partnership */}
          <rect className="d-box d-box-key" x="200" y="150" width="750" height="76" rx="4" />
          <text x="575" y="182" textAnchor="middle" className="d-t d-t-lg">
            National Access to Justice Partnership
          </text>
          <text x="575" y="207" textAnchor="middle" className="d-n">
            2025–30 · $3.9 billion in Australian Government funding over five years
          </text>

          {/* Funding bus into the four delivery groups */}
          <path className="d-flow" d="M575 226 V250" />
          <path className="d-flow" d="M275 250 H865" />
          <path className="d-flow" d="M275 250 V286" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M492 250 V286" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M692 250 V286" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M865 250 V286" markerEnd="url(#sd-arrow)" />

          {/* Capacity rail, annotated in the clear band beside the partnership */}
          <path className="d-flow d-flow-pb" d="M1120 100 V286" markerEnd="url(#sd-arrow)" />
          <text x="1108" y="243" textAnchor="end" className="d-n">National Pro Bono Target</text>
          <text x="1108" y="262" textAnchor="end" className="d-n">35 hrs · 20 hrs in-house</text>

          {/* Row 3 — delivery groups */}
          <g {...node('legal_aid')}>
            <rect className="d-box" x="200" y="290" width="150" height="122" rx="4" />
            <text x="275" y="318" textAnchor="middle" className="d-t">Legal Aid</text>
            <text x="275" y="338" textAnchor="middle" className="d-t">Commissions</text>
            <text x="275" y="372" textAnchor="middle" className="d-num">8</text>
            <line className="d-rule" x1="216" y1="384" x2="334" y2="384" />
            <text x="275" y="402" textAnchor="middle" className="d-peak">National Legal Aid</text>
          </g>

          <g {...node('clc')}>
            <rect className="d-box" x="370" y="290" width="245" height="122" rx="4" />
            <text x="492" y="318" textAnchor="middle" className="d-t">Community Legal Centres</text>
            <text x="492" y="338" textAnchor="middle" className="d-t">+ Women&rsquo;s Legal Services</text>
            <text x="492" y="372" textAnchor="middle" className="d-num">154*</text>
            <line className="d-rule" x1="386" y1="384" x2="599" y2="384" />
            <text x="492" y="402" textAnchor="middle" className="d-peak d-peak-compact">Community Legal Centres Australia</text>
          </g>

          <g {...node('atsils')}>
            <rect className="d-box" x="635" y="290" width="115" height="122" rx="4" />
            <text x="692" y="328" textAnchor="middle" className="d-t">ATSILS</text>
            <text x="692" y="372" textAnchor="middle" className="d-num">7</text>
            <line className="d-rule" x1="651" y1="384" x2="734" y2="384" />
            <text x="692" y="402" textAnchor="middle" className="d-peak">NATSILS</text>
          </g>

          <g {...node('fvpls')}>
            <rect className="d-box" x="770" y="290" width="190" height="122" rx="4" />
            <text x="865" y="318" textAnchor="middle" className="d-t d-t-compact">Family Violence Prevention</text>
            <text x="865" y="338" textAnchor="middle" className="d-t">Legal Services</text>
            <text x="865" y="372" textAnchor="middle" className="d-num">15</text>
            <line className="d-rule" x1="786" y1="384" x2="944" y2="384" />
            <text x="865" y="402" textAnchor="middle" className="d-peak">FNAAFV</text>
          </g>

          {/* Other funding into the delivery layer */}
          <rect className="d-box" x="35" y="308" width="140" height="86" rx="4" />
          <text x="105" y="334" textAnchor="middle" className="d-t">Other funding</text>
          <text x="105" y="356" textAnchor="middle" className="d-n">state · statutory</text>
          <text x="105" y="374" textAnchor="middle" className="d-n">philanthropic</text>
          <path className="d-flow d-flow-by" d="M175 351 H198" markerEnd="url(#sd-arrow)" />

          {/* Capacity pathways */}
          <rect className="d-box d-box-pb" x="980" y="290" width="280" height="122" rx="4" />
          <text x="1120" y="320" textAnchor="middle" className="d-t">Pro bono pathways</text>
          <text x="1120" y="346" textAnchor="middle" className="d-n">referrals · clinics</text>
          <text x="1120" y="366" textAnchor="middle" className="d-n">secondments · project support</text>
          <text x="1120" y="396" textAnchor="middle" className="d-peak d-peak-compact">some coordinated by referral bodies</text>

          {/* Delivery bus to people; capacity joins it once, below the boxes */}
          <path className="d-flow" d="M275 412 V446" />
          <path className="d-flow" d="M492 412 V446" />
          <path className="d-flow" d="M692 412 V446" />
          <path className="d-flow" d="M865 412 V446" />
          <path className="d-flow" d="M275 446 H865" />
          <path className="d-flow" d="M570 446 V503" markerEnd="url(#sd-arrow)" />

          <path className="d-flow d-flow-pb" d="M1010 412 V446 H872" markerEnd="url(#sd-arrow)" />
          <text x="700" y="472" textAnchor="middle" className="d-n">capacity flows into legal assistance organisations</text>
          <path className="d-flow d-flow-pb" d="M1120 412 V503" markerEnd="url(#sd-arrow)" />

          {/* Row 4 — the point of it all */}
          <rect className="d-box d-box-out" x="200" y="505" width="1050" height="64" rx="4" />
          <text x="725" y="543" textAnchor="middle" className="d-t d-t-lg">
            People and communities with legal need
          </text>

          <text x="200" y="606" className="d-n">
            * CLCs Australia describes 154 community legal centres and women&rsquo;s legal services together.
          </text>
        </svg>
      </div>
      <figcaption>
        <span className="diagram-hint">Scroll horizontally to explore the full diagram.</span>
        <span className="legend"><span className="legend-key legend-funded" /> Australian Government funding</span>
        <span className="legend"><span className="legend-key legend-outside" /> administration / other funding</span>
        <span className="legend"><span className="legend-key legend-pb" /> pro bono capacity</span>
        {selectable ? <span className="diagram-action-hint">Select a delivery group to open the map.</span> : null}
      </figcaption>
    </figure>
  );
}
