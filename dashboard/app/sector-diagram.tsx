'use client';

import type { KeyboardEvent } from 'react';
import type { TierKey } from '../lib/sector-data';

function activateOnKeyboard(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export default function SectorDiagram({
  onSelectTier,
}: {
  onSelectTier?: (tier: TierKey) => void;
}) {
  const selectable = Boolean(onSelectTier);

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

          <text x="150" y="20" className="d-label">Public funding</text>
          <text x="980" y="20" className="d-label">Professional capacity</text>

          <rect className="d-box" x="150" y="32" width="380" height="66" rx="4" />
          <text x="340" y="61" textAnchor="middle" className="d-t">Australian Government</text>
          <text x="340" y="82" textAnchor="middle" className="d-n">provides the $3.9b NAJP funding</text>

          <rect className="d-box" x="550" y="32" width="400" height="66" rx="4" />
          <text x="750" y="61" textAnchor="middle" className="d-t">State &amp; territory governments</text>
          <text x="750" y="82" textAnchor="middle" className="d-n">agreement parties · administrators · separate co-funders</text>

          <rect className="d-box d-box-pb" x="980" y="32" width="280" height="66" rx="4" />
          <text x="1120" y="59" textAnchor="middle" className="d-t">Private profession</text>
          <text x="1120" y="80" textAnchor="middle" className="d-n">firms · barristers · in-house teams</text>

          <path className="d-flow" d="M340 98 V136" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-by" d="M750 98 V116 H700 V136" markerEnd="url(#sd-arrow)" />
          <text x="758" y="122" className="d-n">agreement</text>

          <rect className="d-box d-box-key" x="150" y="138" width="800" height="76" rx="4" />
          <text x="550" y="169" textAnchor="middle" className="d-t d-t-lg">
            National Access to Justice Partnership
          </text>
          <text x="550" y="194" textAnchor="middle" className="d-n">
            2025–30 · $3.9 billion in Australian Government funding over five years
          </text>

          <path className="d-flow" d="M550 214 V244" />
          <path className="d-flow" d="M225 244 H865" />
          <path className="d-flow" d="M225 244 V278" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M435 244 V278" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M655 244 V278" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M805 244 V278" markerEnd="url(#sd-arrow)" />

          <g
            className={selectable ? 'd-node d-node-selectable' : 'd-node'}
            role={selectable ? 'button' : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={() => onSelectTier?.('legal_aid')}
            onKeyDown={(event) => activateOnKeyboard(event, () => onSelectTier?.('legal_aid'))}
          >
            <rect className="d-box" x="150" y="280" width="150" height="112" rx="4" />
            <text x="225" y="308" textAnchor="middle" className="d-t">Legal Aid</text>
            <text x="225" y="328" textAnchor="middle" className="d-t">Commissions</text>
            <text x="225" y="355" textAnchor="middle" className="d-num">8</text>
            <line className="d-rule" x1="166" y1="366" x2="284" y2="366" />
            <text x="225" y="384" textAnchor="middle" className="d-peak">National Legal Aid</text>
          </g>

          <g
            className={selectable ? 'd-node d-node-selectable' : 'd-node'}
            role={selectable ? 'button' : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={() => onSelectTier?.('clc')}
            onKeyDown={(event) => activateOnKeyboard(event, () => onSelectTier?.('clc'))}
          >
            <rect className="d-box" x="310" y="280" width="250" height="112" rx="4" />
            <text x="435" y="307" textAnchor="middle" className="d-t">Community Legal Centres</text>
            <text x="435" y="327" textAnchor="middle" className="d-t">+ Women&rsquo;s Legal Services</text>
            <text x="435" y="355" textAnchor="middle" className="d-num">154 represented*</text>
            <line className="d-rule" x1="326" y1="366" x2="544" y2="366" />
            <text x="435" y="384" textAnchor="middle" className="d-peak d-peak-compact">Community Legal Centres Australia</text>
          </g>

          <g
            className={selectable ? 'd-node d-node-selectable' : 'd-node'}
            role={selectable ? 'button' : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={() => onSelectTier?.('atsils')}
            onKeyDown={(event) => activateOnKeyboard(event, () => onSelectTier?.('atsils'))}
          >
            <rect className="d-box" x="570" y="280" width="170" height="112" rx="4" />
            <text x="655" y="318" textAnchor="middle" className="d-t">ATSILS</text>
            <text x="655" y="355" textAnchor="middle" className="d-num">7</text>
            <line className="d-rule" x1="586" y1="366" x2="724" y2="366" />
            <text x="655" y="384" textAnchor="middle" className="d-peak">NATSILS</text>
          </g>

          <g
            className={selectable ? 'd-node d-node-selectable' : 'd-node'}
            role={selectable ? 'button' : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={() => onSelectTier?.('fvpls')}
            onKeyDown={(event) => activateOnKeyboard(event, () => onSelectTier?.('fvpls'))}
          >
            <rect className="d-box" x="744" y="280" width="212" height="112" rx="4" />
            <text x="850" y="309" textAnchor="middle" className="d-t d-t-compact">Family Violence Prevention</text>
            <text x="850" y="329" textAnchor="middle" className="d-t">Legal Services</text>
            <text x="850" y="355" textAnchor="middle" className="d-num">15</text>
            <line className="d-rule" x1="760" y1="366" x2="940" y2="366" />
            <text x="850" y="384" textAnchor="middle" className="d-peak">FNAAFV</text>
          </g>

          <rect className="d-box" x="2" y="296" width="138" height="78" rx="4" />
          <text x="71" y="320" textAnchor="middle" className="d-t">Other funding</text>
          <text x="71" y="340" textAnchor="middle" className="d-n">state · statutory</text>
          <text x="71" y="358" textAnchor="middle" className="d-n">philanthropic</text>
          <path className="d-flow d-flow-by" d="M140 335 H148" markerEnd="url(#sd-arrow)" />

          <path className="d-flow d-flow-pb" d="M1120 98 V278" markerEnd="url(#sd-arrow)" />
          <text x="1102" y="151" textAnchor="end" className="d-n">National Pro Bono Target</text>
          <text x="1102" y="170" textAnchor="end" className="d-n">35 hrs · 20 hrs in-house</text>

          <rect className="d-box d-box-pb" x="980" y="280" width="280" height="112" rx="4" />
          <text x="1120" y="308" textAnchor="middle" className="d-t">Pro bono pathways</text>
          <text x="1120" y="334" textAnchor="middle" className="d-n">referrals · clinics</text>
          <text x="1120" y="353" textAnchor="middle" className="d-n">secondments · project support</text>
          <text x="1120" y="379" textAnchor="middle" className="d-peak d-peak-compact">some coordinated by referral bodies</text>

          <path className="d-flow" d="M225 392 V452" />
          <path className="d-flow" d="M435 392 V452" />
          <path className="d-flow" d="M655 392 V452" />
          <path className="d-flow" d="M850 392 V452" />
          <path className="d-flow" d="M225 452 H850" />
          <path className="d-flow" d="M550 452 V516" markerEnd="url(#sd-arrow)" />

          <path className="d-flow d-flow-pb" d="M980 336 H960 V430 H435 V394" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-pb" d="M1120 392 V480 H920 V516" markerEnd="url(#sd-arrow)" />
          <text x="736" y="424" textAnchor="middle" className="d-n">capacity can flow into legal assistance organisations</text>

          <rect className="d-box d-box-out" x="150" y="518" width="1110" height="64" rx="4" />
          <text x="705" y="556" textAnchor="middle" className="d-t d-t-lg">
            People and communities with legal need
          </text>

          <text x="150" y="608" className="d-n">
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
