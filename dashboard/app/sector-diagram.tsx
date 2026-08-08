/*
 * Funding and referral structure of the legal assistance sector.
 *
 * Type is sized for reading at the rendered scale, not for fitting more words
 * in: every label is a name or a number, and anything that needed a sentence
 * was cut. Colour is the only encoding — blue for funding under the Partnership,
 * amber for pro bono capacity, dashed for funding outside it.
 *
 * Each delivery arm carries its own peak body inside its box. They were a
 * separate row below the boxes at first, which put the names directly on the
 * lines running down to the outcome bar.
 */
export default function SectorDiagram() {
  return (
    <figure className="diagram">
      <div
        className="diagram-frame"
        role="region"
        aria-label="Scrollable funding and referral structure diagram"
        tabIndex={0}
      >
        <svg
          viewBox="0 0 1280 590"
          role="img"
          aria-label="The Commonwealth Attorney-General's Department and the eight state and territory Attorneys-General fund the National Access to Justice Partnership 2025-30, worth $3.9 billion over five years. The Partnership funds four delivery arms: 8 Legal Aid Commissions, peak body National Legal Aid; about 154 Community Legal Centres, peak body CLCs Australia; 7 ATSILS, peak body NATSILS; and 15 FVPLS, peak body FNAAFV. Public purpose funds and philanthropy fund those arms outside the Partnership. Separately, the legal profession provides pro bono capacity under the National Pro Bono Target of 35 hours per lawyer per year, routed through clearing houses and court referral schemes. Both channels reach people with legal need."
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

          <text x="215" y="20" className="d-label">
            Funded
          </text>
          <text x="900" y="20" className="d-label">
            Pro bono
          </text>

          {/* funders */}
          <rect className="d-box" x="215" y="32" width="300" height="60" rx="4" />
          <text x="365" y="58" textAnchor="middle" className="d-t">
            Commonwealth
          </text>
          <text x="365" y="78" textAnchor="middle" className="d-t">
            Attorney-General&rsquo;s Dept
          </text>

          <rect className="d-box" x="535" y="32" width="300" height="60" rx="4" />
          <text x="685" y="58" textAnchor="middle" className="d-t">
            State &amp; Territory
          </text>
          <text x="685" y="78" textAnchor="middle" className="d-t">
            Attorneys-General (8)
          </text>

          <rect className="d-box d-box-pb" x="900" y="32" width="350" height="60" rx="4" />
          <text x="1075" y="58" textAnchor="middle" className="d-t">
            The legal profession
          </text>
          <text x="1075" y="79" textAnchor="middle" className="d-n">
            333 Target signatories
          </text>

          <path className="d-flow" d="M365 92 V116" />
          <path className="d-flow" d="M685 92 V116" />
          <path className="d-flow" d="M365 116 H685" />
          <path className="d-flow" d="M525 116 V140" markerEnd="url(#sd-arrow)" />

          {/* the agreement */}
          <rect className="d-box d-box-key" x="215" y="142" width="620" height="72" rx="4" />
          <text x="525" y="172" textAnchor="middle" className="d-t d-t-lg">
            National Access to Justice Partnership
          </text>
          <text x="525" y="196" textAnchor="middle" className="d-n">
            2025&ndash;30 &middot; $3.9 billion over five years
          </text>

          <path className="d-flow" d="M525 214 V244" />
          <path className="d-flow" d="M290 244 H761" />
          <path className="d-flow" d="M290 244 V274" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M447 244 V274" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M604 244 V274" markerEnd="url(#sd-arrow)" />
          <path className="d-flow" d="M761 244 V274" markerEnd="url(#sd-arrow)" />

          {/* delivery arms, each with its peak body */}
          <rect className="d-box" x="215" y="276" width="149" height="104" rx="4" />
          <text x="290" y="302" textAnchor="middle" className="d-t">
            Legal Aid
          </text>
          <text x="290" y="320" textAnchor="middle" className="d-t">
            Commissions
          </text>
          <text x="290" y="346" textAnchor="middle" className="d-num">
            8
          </text>
          <line className="d-rule" x1="231" y1="356" x2="348" y2="356" />
          <text x="290" y="372" textAnchor="middle" className="d-peak">
            National Legal Aid
          </text>

          <rect className="d-box" x="372" y="276" width="149" height="104" rx="4" />
          <text x="447" y="302" textAnchor="middle" className="d-t">
            Community
          </text>
          <text x="447" y="320" textAnchor="middle" className="d-t">
            Legal Centres
          </text>
          <text x="447" y="346" textAnchor="middle" className="d-num">
            ~154
          </text>
          <line className="d-rule" x1="388" y1="356" x2="505" y2="356" />
          <text x="447" y="372" textAnchor="middle" className="d-peak">
            CLCs Australia
          </text>

          <rect className="d-box" x="529" y="276" width="149" height="104" rx="4" />
          <text x="604" y="311" textAnchor="middle" className="d-t">
            ATSILS
          </text>
          <text x="604" y="346" textAnchor="middle" className="d-num">
            7
          </text>
          <line className="d-rule" x1="545" y1="356" x2="662" y2="356" />
          <text x="604" y="372" textAnchor="middle" className="d-peak">
            NATSILS
          </text>

          <rect className="d-box" x="686" y="276" width="149" height="104" rx="4" />
          <text x="761" y="311" textAnchor="middle" className="d-t">
            FVPLS
          </text>
          <text x="761" y="346" textAnchor="middle" className="d-num">
            15
          </text>
          <line className="d-rule" x1="702" y1="356" x2="819" y2="356" />
          <text x="761" y="372" textAnchor="middle" className="d-peak">
            FNAAFV
          </text>

          <text x="200" y="376" textAnchor="end" className="d-label">
            peaks
          </text>

          {/*
            Funding outside the agreement. Widened for the monospaced face:
            "funds · philanthropy" is 20 characters, which is exactly 180px at
            this size, so the old 170px box cut it off at both ends.
          */}
          <rect className="d-box" x="2" y="284" width="196" height="66" rx="4" />
          <text x="100" y="308" textAnchor="middle" className="d-t">
            Public purpose
          </text>
          <text x="100" y="326" textAnchor="middle" className="d-t">
            funds &middot; philanthropy
          </text>
          <text x="100" y="343" textAnchor="middle" className="d-n">
            outside NAJP
          </text>
          <path className="d-flow d-flow-by" d="M198 317 H213" markerEnd="url(#sd-arrow)" />

          {/* pro bono channel */}
          <path className="d-flow d-flow-pb" d="M1075 92 V250" markerEnd="url(#sd-arrow)" />
          <text x="1057" y="160" textAnchor="end" className="d-n">
            National Pro Bono Target
          </text>
          <text x="1057" y="180" textAnchor="end" className="d-n">
            35 hrs / lawyer / year
          </text>

          <rect className="d-box d-box-pb" x="900" y="252" width="350" height="88" rx="4" />
          <text x="1075" y="280" textAnchor="middle" className="d-t">
            Clearing houses &amp;
          </text>
          <text x="1075" y="300" textAnchor="middle" className="d-t">
            court referral schemes
          </text>
          <text x="1075" y="324" textAnchor="middle" className="d-n">
            Justice Connect &middot; LawRight &middot; JusticeNet SA
          </text>

          {/* both channels reach the same place */}
          <path className="d-flow" d="M290 380 V440" />
          <path className="d-flow" d="M447 380 V440" />
          <path className="d-flow" d="M604 380 V440" />
          <path className="d-flow" d="M761 380 V440" />
          <path className="d-flow" d="M290 440 H761" />
          <path className="d-flow" d="M525 440 V488" markerEnd="url(#sd-arrow)" />
          <path className="d-flow d-flow-pb" d="M1075 340 V464 H800 V488" markerEnd="url(#sd-arrow)" />

          <rect className="d-box d-box-out" x="215" y="490" width="1035" height="62" rx="4" />
          <text x="732" y="527" textAnchor="middle" className="d-t d-t-lg">
            People with legal need
          </text>
        </svg>
      </div>
      <figcaption>
        <span className="diagram-hint">Scroll horizontally to explore the full diagram.</span>
        <span className="legend">
          <span className="legend-key legend-funded" /> funding under the Partnership
        </span>
        <span className="legend">
          <span className="legend-key legend-outside" /> funding outside it
        </span>
        <span className="legend">
          <span className="legend-key legend-pb" /> pro bono capacity
        </span>
      </figcaption>
    </figure>
  );
}
