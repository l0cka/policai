/*
 * How help reaches someone: two channels that do not meet until the end.
 *
 * Hand-authored rather than generated, because the claim is structural — public
 * money runs through one agreement to four delivery arms, while pro bono is
 * unpaid capacity routed through clearing houses with no arrow into the funded
 * system. Colour carries that split (blue = money, amber = unpaid capacity) and
 * everything else inherits currentColor so both themes resolve.
 */
export default function SectorDiagram() {
  return (
    <figure className="diagram">
      <div className="diagram-frame">
        <svg
          viewBox="0 0 1100 470"
          role="img"
          aria-label="Diagram: the Commonwealth Attorney-General's Department and the eight state and territory Attorneys-General fund the National Access to Justice Partnership 2025 to 2030, worth 3.9 billion dollars over five years, which funds four delivery arms — 8 Legal Aid Commissions, about 154 Community Legal Centres, 7 ATSILS and 15 FVPLS, each with its own national peak. Public purpose funds and philanthropy reach those arms outside the Partnership. Separately, the legal profession supplies unpaid pro bono capacity under the National Pro Bono Target, routed through clearing houses and court referral schemes. Both channels converge only at the person with a legal problem."
        >
          <defs>
            <marker
              id="sd-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10z" fill="context-stroke" />
            </marker>
          </defs>

          <text x="190" y="16" className="d-label">
            Funded channel
          </text>
          <text x="820" y="16" className="d-label">
            Pro bono channel
          </text>

          <rect className="d-box" x="190" y="26" width="275" height="50" rx="4" />
          <text x="327" y="49" textAnchor="middle" className="d-t">
            Commonwealth Attorney-General&rsquo;s Dept
          </text>
          <text x="327" y="65" textAnchor="middle" className="d-n">
            sets national legal assistance policy
          </text>

          <rect className="d-box" x="485" y="26" width="275" height="50" rx="4" />
          <text x="622" y="49" textAnchor="middle" className="d-t">
            8 State &amp; Territory Attorneys-General
          </text>
          <text x="622" y="65" textAnchor="middle" className="d-n">
            match and administer
          </text>

          <rect className="d-box d-box-pb" x="820" y="26" width="260" height="50" rx="4" />
          <text x="950" y="49" textAnchor="middle" className="d-t">
            The legal profession
          </text>
          <text x="950" y="65" textAnchor="middle" className="d-n">
            333 Target signatories &middot; 19,900 lawyers
          </text>

          <path className="d-flow" d="M327 76 V96" />
          <path className="d-flow" d="M622 76 V96" />
          <path className="d-flow" d="M327 96 H622" />
          <path className="d-flow" d="M475 96 V112" markerEnd="url(#sd-arrow)" />

          <rect className="d-box d-box-key" x="190" y="114" width="570" height="60" rx="4" />
          <text x="475" y="139" textAnchor="middle" className="d-t">
            National Access to Justice Partnership 2025&ndash;30
          </text>
          <text x="475" y="158" textAnchor="middle" className="d-n">
            $3.9 billion over five years &mdash; replaced NLAP on 1 July 2025
          </text>

          <path className="d-flow" d="M475 174 V202" />
          <path className="d-flow" d="M257 202 H692" />
          <path className="d-flow" d="M257 202 V230" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M402 202 V230" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M547 202 V230" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M692 202 V230" markerEnd="url(#sd-arrow)" />

          <rect className="d-box" x="190" y="232" width="135" height="60" rx="4" />
          <text x="257" y="255" textAnchor="middle" className="d-t">
            Legal Aid
          </text>
          <text x="257" y="270" textAnchor="middle" className="d-t">
            Commissions
          </text>
          <text x="257" y="285" textAnchor="middle" className="d-s">
            8
          </text>

          <rect className="d-box" x="335" y="232" width="135" height="60" rx="4" />
          <text x="402" y="255" textAnchor="middle" className="d-t">
            Community
          </text>
          <text x="402" y="270" textAnchor="middle" className="d-t">
            Legal Centres
          </text>
          <text x="402" y="285" textAnchor="middle" className="d-s">
            ~154
          </text>

          <rect className="d-box" x="480" y="232" width="135" height="60" rx="4" />
          <text x="547" y="263" textAnchor="middle" className="d-t">
            ATSILS
          </text>
          <text x="547" y="285" textAnchor="middle" className="d-s">
            7
          </text>

          <rect className="d-box" x="625" y="232" width="135" height="60" rx="4" />
          <text x="692" y="263" textAnchor="middle" className="d-t">
            FVPLS
          </text>
          <text x="692" y="285" textAnchor="middle" className="d-s">
            15
          </text>

          <text x="257" y="311" textAnchor="middle" className="d-n">
            National Legal Aid
          </text>
          <text x="402" y="311" textAnchor="middle" className="d-n">
            CLCs Australia
          </text>
          <text x="547" y="311" textAnchor="middle" className="d-n">
            NATSILS
          </text>
          <text x="692" y="311" textAnchor="middle" className="d-n">
            FNAAFV
          </text>
          <text x="475" y="329" textAnchor="middle" className="d-label">
            each arm has a national peak &mdash; coordination, not delivery
          </text>

          <rect className="d-box" x="20" y="234" width="150" height="56" rx="4" />
          <text x="95" y="255" textAnchor="middle" className="d-t">
            Public purpose
          </text>
          <text x="95" y="270" textAnchor="middle" className="d-t">
            funds &middot; philanthropy
          </text>
          <text x="95" y="284" textAnchor="middle" className="d-s">
            outside the pact
          </text>
          <path className="d-flow d-flow-by" d="M170 262 H188" markerEnd="url(#sd-arrow)" />

          <path className="d-flow d-flow-pb" d="M950 76 V212" markerEnd="url(#sd-arrow)" />
          <text x="962" y="126" className="d-label">
            National Pro Bono Target
          </text>
          <text x="962" y="140" className="d-label">
            35 hrs / lawyer / year
          </text>
          <text x="962" y="154" className="d-label">
            845,000 hrs in 2024&ndash;25
          </text>

          <rect className="d-box d-box-pb" x="820" y="214" width="260" height="78" rx="4" />
          <text x="950" y="238" textAnchor="middle" className="d-t">
            Clearing houses &amp; court schemes
          </text>
          <text x="950" y="256" textAnchor="middle" className="d-n">
            Justice Connect &middot; LawRight &middot; JusticeNet SA
          </text>
          <text x="950" y="272" textAnchor="middle" className="d-n">
            Federal Court r 4.12 &middot; NSW UCPR r 7.36
          </text>
          <text x="950" y="286" textAnchor="middle" className="d-s">
            match need to a free lawyer
          </text>

          <path className="d-flow" d="M257 292 V346" />
          <path className="d-flow" d="M402 292 V346" />
          <path className="d-flow" d="M547 292 V346" />
          <path className="d-flow" d="M692 292 V346" />
          <path className="d-flow" d="M257 346 H692" />
          <path className="d-flow" d="M475 346 V392" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-pb" d="M950 292 V368 H700 V392" markerEnd="url(#sd-arrow)" />

          <rect className="d-box d-box-out" x="190" y="394" width="760" height="52" rx="4" />
          <text x="570" y="418" textAnchor="middle" className="d-t">
            A person with a legal problem they cannot solve alone
          </text>
          <text x="570" y="435" textAnchor="middle" className="d-n">
            the two channels never meet until here
          </text>
        </svg>
      </div>
      <figcaption>
        Money follows the solid blue path; unpaid capacity follows the amber one. The dashed
        inflow is money that never touches the Partnership &mdash; interest on solicitors&rsquo;
        trust accounts, which tops up the legal aid commissions, and philanthropy, which mostly
        reaches community legal centres. Note what the diagram does not show: any arrow from the
        profession into the funded arms. Pro bono supplements the system from outside it, which is
        why the clearing houses matter &mdash; they are the only routing layer between unmet need
        and a free lawyer.
      </figcaption>
    </figure>
  );
}
