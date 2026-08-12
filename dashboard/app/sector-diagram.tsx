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
 * connector crosses a node or carries a label on top of another line. The
 * viewBox is kept narrow so the diagram renders large, and rows are spaced
 * to breathe rather than packed.
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
          viewBox="0 0 1180 690"
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

          <text x="150" y="24" className="d-label">Public funding</text>
          <text x="925" y="24" className="d-label">Professional capacity</text>

          {/* Row 1 — sources */}
          <rect className="d-box" x="150" y="40" width="340" height="72" rx="4" />
          <text x="320" y="70" textAnchor="middle" className="d-t">Australian Government</text>
          <text x="320" y="93" textAnchor="middle" className="d-n">provides the $3.9b NAJP funding</text>

          <rect className="d-box" x="510" y="40" width="390" height="72" rx="4" />
          <text x="705" y="70" textAnchor="middle" className="d-t">State &amp; territory governments</text>
          <text x="705" y="93" textAnchor="middle" className="d-n">agreement parties · administrators · co-funders</text>

          <rect className="d-box d-box-pb" x="925" y="40" width="240" height="72" rx="4" />
          <text x="1045" y="70" textAnchor="middle" className="d-t">Private profession</text>
          <text x="1045" y="93" textAnchor="middle" className="d-n">firms · barristers · in-house</text>

          <path className="d-flow" d="M320 112 V166" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-by" d="M705 112 V166" markerEnd="url(#sd-arrow)" />
          <text x="717" y="145" className="d-n">agreement</text>

          {/* Row 2 — the partnership */}
          <rect className="d-box d-box-key" x="150" y="168" width="750" height="84" rx="4" />
          <text x="525" y="204" textAnchor="middle" className="d-t d-t-lg">
            National Access to Justice Partnership
          </text>
          <text x="525" y="231" textAnchor="middle" className="d-n">
            2025–30 · $3.9 billion in Australian Government funding over five years
          </text>

          {/* Funding bus into the four delivery groups */}
          <path className="d-flow" d="M525 252 V282" />
          <path className="d-flow" d="M220 282 H795" />
          <path className="d-flow" d="M220 282 V316" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M425 282 V316" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M615 282 V316" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M795 282 V316" markerEnd="url(#sd-arrow)" />

          {/* Capacity rail, annotated in the clear band beside the bus */}
          <path className="d-flow d-flow-pb" d="M1045 112 V316" markerEnd="url(#sd-arrow)" />
          <text x="1033" y="288" textAnchor="end" className="d-n">National Pro Bono Target</text>
          <text x="1033" y="307" textAnchor="end" className="d-n">35 hrs · 20 hrs in-house</text>

          {/* Row 3 — delivery groups */}
          <g {...node('legal_aid')}>
            <rect className="d-box" x="150" y="320" width="140" height="132" rx="4" />
            <text x="220" y="350" textAnchor="middle" className="d-t">Legal Aid</text>
            <text x="220" y="371" textAnchor="middle" className="d-t">Commissions</text>
            <text x="220" y="410" textAnchor="middle" className="d-num">8</text>
            <line className="d-rule" x1="166" y1="423" x2="274" y2="423" />
            <text x="220" y="442" textAnchor="middle" className="d-peak">National Legal Aid</text>
          </g>

          <g {...node('clc')}>
            <rect className="d-box" x="310" y="320" width="230" height="132" rx="4" />
            <text x="425" y="350" textAnchor="middle" className="d-t d-t-compact">Community Legal Centres</text>
            <text x="425" y="371" textAnchor="middle" className="d-t d-t-compact">+ Women&rsquo;s Legal Services</text>
            <text x="425" y="410" textAnchor="middle" className="d-num">154*</text>
            <line className="d-rule" x1="326" y1="423" x2="524" y2="423" />
            <text x="425" y="442" textAnchor="middle" className="d-peak d-peak-compact">Community Legal Centres Australia</text>
          </g>

          <g {...node('atsils')}>
            <rect className="d-box" x="560" y="320" width="110" height="132" rx="4" />
            <text x="615" y="361" textAnchor="middle" className="d-t">ATSILS</text>
            <text x="615" y="410" textAnchor="middle" className="d-num">7</text>
            <line className="d-rule" x1="576" y1="423" x2="654" y2="423" />
            <text x="615" y="442" textAnchor="middle" className="d-peak">NATSILS</text>
          </g>

          <g {...node('fvpls')}>
            <rect className="d-box" x="690" y="320" width="210" height="132" rx="4" />
            <text x="795" y="350" textAnchor="middle" className="d-t d-t-compact">Family Violence Prevention</text>
            <text x="795" y="371" textAnchor="middle" className="d-t">Legal Services</text>
            <text x="795" y="410" textAnchor="middle" className="d-num">15</text>
            <line className="d-rule" x1="706" y1="423" x2="884" y2="423" />
            <text x="795" y="442" textAnchor="middle" className="d-peak">FNAAFV</text>
          </g>

          {/* Other funding into the delivery layer */}
          <rect className="d-box" x="10" y="340" width="130" height="92" rx="4" />
          <text x="75" y="368" textAnchor="middle" className="d-t d-t-compact">Other funding</text>
          <text x="75" y="392" textAnchor="middle" className="d-n">state · statutory</text>
          <text x="75" y="411" textAnchor="middle" className="d-n">philanthropic</text>
          <path className="d-flow d-flow-by" d="M140 386 H148" markerEnd="url(#sd-arrow)" />

          {/* Capacity pathways */}
          <rect className="d-box d-box-pb" x="925" y="320" width="240" height="132" rx="4" />
          <text x="1045" y="352" textAnchor="middle" className="d-t">Pro bono pathways</text>
          <text x="1045" y="380" textAnchor="middle" className="d-n">referrals · clinics</text>
          <text x="1045" y="400" textAnchor="middle" className="d-n">secondments · project support</text>
          <text x="1045" y="430" textAnchor="middle" className="d-peak d-peak-compact">some coordinated by referral bodies</text>

          {/* Delivery bus to people; capacity joins it once, below the boxes */}
          <path className="d-flow" d="M220 452 V492" />
          <path className="d-flow" d="M425 452 V492" />
          <path className="d-flow" d="M615 452 V492" />
          <path className="d-flow" d="M795 452 V492" />
          <path className="d-flow" d="M220 492 H795" />
          <path className="d-flow" d="M505 492 V556" markerEnd="url(#sd-arrow)" />

          <path className="d-flow d-flow-pb" d="M965 452 V492 H802" markerEnd="url(#sd-arrow)" />
          <text x="795" y="522" textAnchor="middle" className="d-n">capacity flows into legal assistance organisations</text>
          <path className="d-flow d-flow-pb" d="M1045 452 V556" markerEnd="url(#sd-arrow)" />

          {/* Row 4 — the point of it all */}
          <rect className="d-box d-box-out" x="150" y="560" width="1015" height="68" rx="4" />
          <text x="657" y="600" textAnchor="middle" className="d-t d-t-lg">
            People and communities with legal need
          </text>

          <text x="150" y="666" className="d-n">
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
