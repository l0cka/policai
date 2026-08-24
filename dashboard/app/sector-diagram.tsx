'use client';

import type { KeyboardEvent } from 'react';
import { SYSTEM_EVIDENCE } from '../lib/sector-relationships';

export type SystemGroup = 'legal_aid' | 'clc' | 'wls' | 'atsils' | 'fvpls';

type DeliveryGroup = {
  key: SystemGroup;
  label: string;
  lines: string[];
  representative: string;
  x: number;
  width: number;
};

const DELIVERY_GROUPS: DeliveryGroup[] = [
  {
    key: 'legal_aid',
    label: 'Legal Aid Commissions',
    lines: ['Legal Aid', 'Commissions'],
    representative: 'National Legal Aid',
    x: 48,
    width: 150,
  },
  {
    key: 'clc',
    label: 'Community Legal Centres',
    lines: ['Community Legal', 'Centres'],
    representative: 'CLCs Australia',
    x: 216,
    width: 156,
  },
  {
    key: 'wls',
    label: 'Women’s Legal Services',
    lines: ["Women’s Legal", 'Services'],
    representative: 'WLSA',
    x: 390,
    width: 150,
  },
  {
    key: 'atsils',
    label: 'Aboriginal and Torres Strait Islander Legal Services',
    lines: ['ATSILS'],
    representative: 'NATSILS',
    x: 558,
    width: 142,
  },
  {
    key: 'fvpls',
    label: 'Family Violence Prevention and Legal Services',
    lines: ['Family Violence', 'Prevention and', 'Legal Services'],
    representative: 'FNAAFV',
    x: 718,
    width: 156,
  },
];

const EVIDENCE_LINKS = [
  SYSTEM_EVIDENCE.najpOverview,
  SYSTEM_EVIDENCE.najpAgreement,
  SYSTEM_EVIDENCE.clsp,
  SYSTEM_EVIDENCE.legalAidNetwork,
  SYSTEM_EVIDENCE.clcNetwork,
  SYSTEM_EVIDENCE.wlsNetwork,
  SYSTEM_EVIDENCE.atsilsNetwork,
  SYSTEM_EVIDENCE.fvplsNetwork,
  SYSTEM_EVIDENCE.privateProfession,
  SYSTEM_EVIDENCE.proBonoTarget,
  SYSTEM_EVIDENCE.proBonoModels,
  SYSTEM_EVIDENCE.proBonoReferrals,
  SYSTEM_EVIDENCE.highCourtProtocol,
];

function activateOnKeyboard(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export default function SectorDiagram({
  onSelectGroupAction,
}: {
  onSelectGroupAction?: (group: SystemGroup) => void;
}) {
  const selectable = Boolean(onSelectGroupAction);

  const node = (group: DeliveryGroup) => ({
    className: selectable ? 'd-node d-node-selectable' : 'd-node',
    role: selectable ? ('button' as const) : undefined,
    tabIndex: selectable ? 0 : undefined,
    'aria-label': selectable ? `${group.label}. Open this group on the map.` : group.label,
    onClick: () => onSelectGroupAction?.(group.key),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) =>
      activateOnKeyboard(event, () => onSelectGroupAction?.(group.key)),
  });

  return (
    <figure className="diagram diagram-interactive">
      <p id="sector-system-description" className="sr-only">
        The Australian Government makes National Access to Justice Partnership payments to state
        and territory governments. Those governments are agreement parties, distribute and
        administer quarantined Commonwealth provider funding, and maintain their own real-terms
        investment in legal assistance. Five separate funding and reporting categories deliver
        services: Legal Aid Commissions, Community Legal Centres,
        Women&rsquo;s Legal Services, Aboriginal and Torres Strait Islander Legal Services, and
        Family Violence Prevention and Legal Services. Organisational memberships and service
        models may overlap even though the NAJP funding categories are separate. The legal
        profession contributes through paid legal-aid work assigned by Legal Aid Commissions and
        through pro bono legal services. The National Pro Bono Target is a voluntary benchmark, not
        a referral or funding pathway. Referral and coordination organisations include Justice
        Connect, LawRight, JusticeNet SA and Law Access. Separate Commonwealth programs and the
        wider access-to-justice ecosystem sit outside the core NAJP spine.
      </p>

      <div
        className="diagram-frame diagram-desktop"
        role="region"
        aria-label="Interactive funding, delivery and professional capacity diagram"
        aria-describedby="sector-system-description"
        tabIndex={0}
      >
        <svg viewBox="0 0 1440 780" role="group" aria-labelledby="sd-title sd-desc">
          <title id="sd-title">How Australia&rsquo;s legal assistance system connects</title>
          <desc id="sd-desc">
            A layered diagram separating government funding, funded service providers,
            representative bodies, paid legal-aid work, pro bono services and referral
            coordination.
          </desc>
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

          <text x="40" y="28" className="d-label">Funding and administration</text>
          <text x="950" y="28" className="d-label">Professional participation</text>

          <rect className="d-box" x="40" y="48" width="310" height="112" rx="4" />
          <text x="195" y="82" textAnchor="middle" className="d-t">Australian Government</text>
          <text x="195" y="107" textAnchor="middle" className="d-n">estimated $3.864b over five years</text>
          <text x="195" y="127" textAnchor="middle" className="d-n">GST exclusive · indexed</text>
          <text x="195" y="146" textAnchor="middle" className="d-n">rounded publicly to $3.9b</text>

          <path className="d-flow" d="M350 104 H406" markerEnd="url(#sd-arrow)" />
          <text x="378" y="88" textAnchor="middle" className="d-n">NAJP</text>

          <rect className="d-box d-box-key" x="410" y="48" width="480" height="112" rx="4" />
          <text x="650" y="80" textAnchor="middle" className="d-t">State &amp; territory governments</text>
          <text x="650" y="106" textAnchor="middle" className="d-n">agreement parties · distribute Commonwealth funding</text>
          <text x="650" y="127" textAnchor="middle" className="d-n">quarantined categories · provider administration</text>
          <text x="650" y="146" textAnchor="middle" className="d-n">maintain own real-terms legal-assistance investment</text>

          <path className="d-flow" d="M650 160 V224" markerEnd="url(#sd-arrow)" />
          <text x="668" y="196" className="d-n">provider allocations</text>

          <rect className="d-box d-box-pb" x="950" y="48" width="450" height="112" rx="4" />
          <text x="1175" y="82" textAnchor="middle" className="d-t">Legal profession</text>
          <text x="1175" y="108" textAnchor="middle" className="d-n">private practitioners · firms · barristers</text>
          <text x="1175" y="130" textAnchor="middle" className="d-n">corporate in-house · government lawyers</text>

          <path className="d-flow d-flow-profession" d="M1175 160 V208" />
          <path className="d-flow d-flow-profession" d="M1055 208 H1290" />
          <path className="d-flow d-flow-profession" d="M1055 208 V246" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-pb" d="M1290 208 V246" markerEnd="url(#sd-arrow)" />

          <rect className="d-box d-box-profession" x="950" y="250" width="210" height="92" rx="4" />
          <text x="1055" y="278" textAnchor="middle" className="d-t">Private lawyers</text>
          <text x="1055" y="301" textAnchor="middle" className="d-t">paid by Legal Aid</text>
          <text x="1055" y="328" textAnchor="middle" className="d-callout">not pro bono</text>

          <rect className="d-box d-box-pb" x="1180" y="250" width="220" height="92" rx="4" />
          <text x="1290" y="301" textAnchor="middle" className="d-t d-t-compact">Pro bono legal services</text>

          <rect className="d-referral-box" x="950" y="380" width="210" height="112" rx="4" />
          <text x="1055" y="407" textAnchor="middle" className="d-t d-t-compact">Referral &amp; coordination</text>
          <text x="1055" y="438" textAnchor="middle" className="d-n">Justice Connect</text>
          <text x="1055" y="458" textAnchor="middle" className="d-n">LawRight · JusticeNet SA</text>
          <text x="1055" y="478" textAnchor="middle" className="d-n">Law Access</text>

          <rect className="d-note-box" x="1180" y="380" width="220" height="112" rx="4" />
          <text x="1290" y="407" textAnchor="middle" className="d-t d-t-compact">National Pro Bono Target</text>
          <text x="1290" y="438" textAnchor="middle" className="d-n">voluntary benchmark</text>
          <text x="1290" y="458" textAnchor="middle" className="d-n">35h private practice</text>
          <text x="1290" y="478" textAnchor="middle" className="d-n">20h in-house / government</text>

          <text x="40" y="214" className="d-label">Five separate NAJP funding categories</text>
          <rect className="d-group-box" x="32" y="228" width="860" height="350" rx="6" />
          <text x="52" y="256" className="d-n">Select a provider stream to open its organisations on the map.</text>
          <text x="872" y="256" textAnchor="end" className="d-n">Memberships may overlap.</text>

          <path className="d-flow" d="M123 278 H796" />
          {DELIVERY_GROUPS.map((group) => {
            const centre = group.x + group.width / 2;
            const firstLineY = group.lines.length === 1 ? 356 : group.lines.length === 2 ? 343 : 330;
            return (
              <g key={group.key} {...node(group)}>
                <path className="d-flow" d={`M${centre} 278 V296`} markerEnd="url(#sd-arrow)" />
                <rect className="d-box" x={group.x} y="300" width={group.width} height="124" rx="4" />
                {group.lines.map((line, index) => (
                  <text
                    key={line}
                    x={centre}
                    y={firstLineY + index * 22}
                    textAnchor="middle"
                    className="d-t d-t-compact"
                  >
                    {line}
                  </text>
                ))}
                <text x={centre} y="408" textAnchor="middle" className="d-node-action">
                  Open map
                </text>
                <path className="d-flow d-flow-by" d={`M${centre} 424 V462`} />
                <rect className="d-peak-box" x={group.x} y="466" width={group.width} height="64" rx="3" />
                <text x={centre} y="488" textAnchor="middle" className="d-label">National</text>
                <text x={centre} y="502" textAnchor="middle" className="d-label">representative body</text>
                <text x={centre} y="521" textAnchor="middle" className="d-peak d-peak-compact">
                  {group.representative}
                </text>
              </g>
            );
          })}

          <path className="d-flow d-flow-pb" d="M1180 308 H1170 V436 H1164" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-pb" d="M950 436 H910 V430 H894" markerEnd="url(#sd-arrow)" />
          <text x="1055" y="520" textAnchor="middle" className="d-n">referrals and pro bono capacity</text>

          <path className="d-flow d-flow-by" d="M1290 342 V376" />

          <path className="d-flow" d="M123 610 H881" />
          {DELIVERY_GROUPS.map((group) => {
            const centre = group.x + group.width / 2;
            const sideRail = group.x + group.width + 7;
            return (
              <path
                key={group.key}
                className="d-flow"
                d={`M${centre} 424 H${sideRail} V610`}
              />
            );
          })}
          <path className="d-flow" d="M465 610 V676" markerEnd="url(#sd-arrow)" />

          <path
            className="d-flow d-flow-profession"
            d="M1055 342 V360 H930 V650 H1110 V676"
            markerEnd="url(#sd-arrow)"
          />
          <path className="d-flow d-flow-pb" d="M1400 308 H1420 V650 H1340 V676" markerEnd="url(#sd-arrow)" />

          <rect className="d-box d-box-out" x="40" y="680" width="1360" height="82" rx="4" />
          <text x="720" y="716" textAnchor="middle" className="d-t d-t-lg">
            People and communities experiencing legal need
          </text>
          <text x="720" y="744" textAnchor="middle" className="d-n">
            information · advice · representation · community education · systemic work
          </text>

        </svg>
      </div>

      <div className="diagram-mobile" aria-describedby="sector-system-description">
        <section className="diagram-mobile-step">
          <span>1</span>
          <div>
            <h3>Government funding</h3>
            <p>
              The Australian Government makes estimated $3.864b in indexed, GST-exclusive NAJP
              payments over five years (publicly rounded to $3.9b). States and territories
              distribute quarantined provider funding and maintain their own real-terms investment.
            </p>
          </div>
        </section>

        <section className="diagram-mobile-step">
          <span>2</span>
          <div>
            <h3>Funded provider streams</h3>
            <p>
              These are separate funding and reporting categories. Organisational memberships and
              service models may still overlap.
            </p>
            <div className="diagram-mobile-groups">
              {DELIVERY_GROUPS.map((group) => (
                <button
                  type="button"
                  key={group.key}
                  onClick={() => onSelectGroupAction?.(group.key)}
                  disabled={!selectable}
                >
                  <strong>{group.label}</strong>
                  <small>Represented or coordinated by {group.representative}</small>
                  {selectable ? <em>Open map</em> : null}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="diagram-mobile-step diagram-mobile-profession">
          <span>3</span>
          <div>
            <h3>Legal profession: two different routes</h3>
            <dl>
              <div>
                <dt>Paid legal-aid work</dt>
                <dd>
                  Legal Aid Commissions use salaried lawyers and assign grants or duty work to paid
                  private practitioners.
                </dd>
              </div>
              <div>
                <dt>Pro bono legal services</dt>
                <dd>
                  Advice, representation, referrals, clinics, secondments, law reform, legal
                  education and digital legal resources.
                </dd>
              </div>
            </dl>
            <p>
              Referral and court schemes assess and match matters. Examples include Justice
              Connect, LawRight, JusticeNet SA and Law Access. The National Pro Bono Target is a
              voluntary benchmark, not a service pathway.
            </p>
          </div>
        </section>

        <section className="diagram-mobile-step diagram-mobile-outcome">
          <span>4</span>
          <div>
            <h3>People and communities</h3>
            <p>
              Publicly funded services focus on people experiencing legal need and disadvantage.
              Pro bono adds capacity and may also assist eligible organisations and public-interest
              matters; it does not replace public funding.
            </p>
          </div>
        </section>
      </div>

      <figcaption>
        <span className="legend"><span className="legend-key legend-funded" /> public funding</span>
        <span className="legend"><span className="legend-key legend-profession" /> paid legal-aid work</span>
        <span className="legend"><span className="legend-key legend-pb" /> pro bono legal services</span>
        <span className="legend"><span className="legend-key legend-outside" /> representation / benchmark</span>
        {selectable ? <span className="diagram-action-hint">Select a provider stream to open the map.</span> : null}
      </figcaption>

      <div className="diagram-source-note">
        <strong>Evidence:</strong>{' '}
        {EVIDENCE_LINKS.map((item, index) => (
          <span key={item.url}>
            {index ? ' · ' : null}
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.label}
            </a>
          </span>
        ))}
      </div>
    </figure>
  );
}
