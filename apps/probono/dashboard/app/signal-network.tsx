const COLLECTIONS: Record<string, string> = {
  news: 'News',
  law_reform: 'Law reform',
  funding: 'Funding',
  tech_justice: 'Tech & justice',
  unclassified: 'Unclassified',
};

/*
 * One row per source x collection across the window. Every figure the diagram
 * states is derived from this aggregate rather than from the rows we happen to
 * draw, so the counts cannot drift away from the population the way they did
 * when they were window functions over a LIMITed row set.
 */
export type NetworkPair = {
  source_name: string;
  source_url: string;
  collection: string;
  n: number;
  opportunities: number;
};

/* The individual signals, used for the density band and the featured item. */
export type NetworkSignal = {
  id: string | number;
  title: string;
  url: string;
  stream: string | null;
  opportunity: boolean;
  published_at: string | Date | null;
  created_at: string | Date;
  source_name: string;
};

type Node = {
  key: string;
  label: string;
  count: number;
  x: number;
  y: number;
  r: number;
  bandY: number;
  href: string;
  aggregate?: boolean;
};

const GRAPH = {
  width: 900,
  height: 470,
  sourceX: 188,
  bandX: 470,
  collectionX: 744,
  top: 58,
  bottom: 404,
};

/* Sources beyond this rank are folded into a single residual node so the left
 * column still totals the real population. */
const TOP_SOURCES = 5;
const DOT_GAP = 7;
const MIN_DOT_GAP = 3;
const MAX_BAND_WIDTH = 154;
const MAX_RIBBON = 26;

function isSafeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function splitLabel(value: string, maxLength: number): [string, string?] {
  if (value.length <= maxLength) return [value];
  const words = value.split(/\s+/);
  let first = '';
  let index = 0;
  while (index < words.length && `${first} ${words[index]}`.trim().length <= maxLength) {
    first = `${first} ${words[index]}`.trim();
    index += 1;
  }
  const rest = words.slice(index).join(' ');
  return [first || words[0], rest.length > maxLength ? `${rest.slice(0, maxLength - 1)}…` : rest || undefined];
}

function pathBetween(x1: number, y1: number, x2: number, y2: number): string {
  const bend = (x2 - x1) * 0.46;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

/*
 * How tall the dot band actually turns out to be. The grid takes as many rows
 * as fit and then as many columns as it needs, so the last row is rarely full
 * and the band almost never reaches GRAPH.bottom. Ribbons must aim at where the
 * dots really end, not at the space that was available for them — at 247
 * signals those two agreed to within 3px and the difference was invisible; at
 * 252 the column count ticked up, the band lost eight rows, and the bottom
 * ribbons started in mid-air below it.
 */
function bandGeometry(total: number) {
  const span = GRAPH.bottom - GRAPH.top;
  const n = Math.max(total, 1);

  // One dot per signal is the promise, so as volume grows the spacing gives way
  // before the lane does. At present volumes this exits on the first iteration
  // and the band keeps its full DOT_GAP.
  let gap = DOT_GAP;
  while (gap > MIN_DOT_GAP) {
    const rows = Math.floor(span / gap) + 1;
    const columns = Math.floor(MAX_BAND_WIDTH / gap) + 1;
    if (rows * columns >= n) break;
    gap -= 0.5;
  }

  const maxRows = Math.max(1, Math.floor(span / gap) + 1);
  const columns = Math.max(1, Math.ceil(n / maxRows));
  const usedRows = Math.max(1, Math.ceil(n / columns));
  return { gap, columns, usedRows, bottom: GRAPH.top + (usedRows - 1) * gap };
}

/*
 * Lay a column out top-to-bottom in descending order and give each node the
 * vertical centre of its own share of the band. Because both orders match, the
 * ribbons fan out without crossing.
 */
function layout(
  entries: Array<{ key: string; label: string; count: number; href: string; aggregate?: boolean }>,
  x: number,
  maxRadius: number,
  total: number,
  bandBottom: number,
): Node[] {
  const span = GRAPH.bottom - GRAPH.top;
  const bandSpan = bandBottom - GRAPH.top;
  const largest = Math.max(...entries.map((e) => e.count), 1);
  const step = entries.length > 1 ? span / (entries.length - 1) : 0;
  let cumulative = 0;

  return entries.map((entry, index) => {
    const share = (cumulative + entry.count / 2) / (total || 1);
    cumulative += entry.count;
    return {
      ...entry,
      x,
      y: entries.length === 1 ? GRAPH.top + span / 2 : GRAPH.top + index * step,
      // Area, not radius, carries the count: r scales with the square root.
      r: entry.aggregate ? 13 : Math.max(4, maxRadius * Math.sqrt(entry.count / largest)),
      bandY: GRAPH.top + share * bandSpan,
    };
  });
}

function buildGraph(pairs: NetworkPair[]) {
  const bySource = new Map<string, { count: number; url: string }>();
  const byCollection = new Map<string, number>();
  let total = 0;
  let opportunities = 0;

  for (const pair of pairs) {
    const n = Number(pair.n) || 0;
    const existing = bySource.get(pair.source_name);
    bySource.set(pair.source_name, {
      count: (existing?.count ?? 0) + n,
      url: existing?.url ?? pair.source_url,
    });
    byCollection.set(pair.collection, (byCollection.get(pair.collection) ?? 0) + n);
    total += n;
    opportunities += Number(pair.opportunities) || 0;
  }

  const ranked = [...bySource.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, TOP_SOURCES);
  const rest = ranked.slice(TOP_SOURCES);
  const restCount = rest.reduce((sum, [, value]) => sum + value.count, 0);

  const sourceEntries = top.map(([name, value]) => ({
    key: name,
    label: name,
    count: value.count,
    href: isSafeUrl(value.url) ? value.url : '/health',
  }));
  if (rest.length) {
    sourceEntries.push({
      key: '__rest__',
      label: `${rest.length} other source${rest.length === 1 ? '' : 's'}`,
      count: restCount,
      href: '/health',
      aggregate: true,
    } as (typeof sourceEntries)[number]);
  }

  const collectionEntries = [...byCollection.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({
      key,
      label: COLLECTIONS[key] ?? COLLECTIONS.unclassified,
      count,
      href: key === 'unclassified' ? '/#radar-feed' : `/?stream=${key}#radar-feed`,
    }));

  const band = bandGeometry(total);

  return {
    sources: layout(sourceEntries, GRAPH.sourceX, 11, total, band.bottom),
    collections: layout(collectionEntries, GRAPH.collectionX, 18, total, band.bottom),
    band,
    total,
    opportunities,
    sourceCount: bySource.size,
  };
}

export function SignalNetwork({ pairs, signals }: { pairs: NetworkPair[]; signals: NetworkSignal[] }) {
  const { sources, collections, band, total, opportunities, sourceCount } = buildGraph(pairs);

  if (!total) {
    return (
      <figure className="signal-network">
        <p className="signal-network-empty">No signals were collected in the last 30 days.</p>
      </figure>
    );
  }

  /* One ribbon pixel per signal, shared by both columns so the two sides of the
   * junction are drawn to the same scale. */
  const largest = Math.max(...sources.map((s) => s.count), ...collections.map((c) => c.count), 1);
  const ribbon = (count: number) => Math.max(1.2, (MAX_RIBBON * count) / largest);

  const { columns, gap } = band;
  const bandLeft = GRAPH.bandX - ((columns - 1) * gap) / 2;
  const bandRight = bandLeft + (columns - 1) * gap;

  /* The band is a quantity display: one mark per signal in the window. Marks
   * are decorative, but the opportunities among them stay individually
   * reachable because those are the ones worth acting on. */
  const dots = Array.from({ length: total }, (_, index) => {
    const signal = signals[index];
    return {
      index,
      signal,
      opportunity: Boolean(signal?.opportunity),
      x: bandLeft + (index % columns) * gap,
      y: GRAPH.top + Math.floor(index / columns) * gap,
    };
  });

  return (
    <figure
      className="signal-network"
      aria-labelledby="signal-network-title"
      aria-describedby="signal-network-description"
    >
      <figcaption className="signal-network-head">
        <span id="signal-network-title">
          Source <b aria-hidden="true">&rarr;</b> signal <b aria-hidden="true">&rarr;</b> collection
        </span>
        <span className="signal-network-range">Last 30 days</span>
        <span className="signal-network-legend" aria-hidden="true">
          <i className="network-key source" /> Source
          <i className="network-key aggregate" /> Remaining sources
          <i className="network-key signal" /> Signal
          <i className="network-key opportunity" /> Opportunity
          <i className="network-key collection" /> Collection
        </span>
        <span className="signal-network-hint">Scroll to trace the network</span>
      </figcaption>

      <p id="signal-network-description" className="sr-only">
        Every one of the {total} access-to-justice signals collected in the last 30 days, from{' '}
        {sourceCount} sources, sorted into {collections.length} collections. {opportunities} are
        opportunities. Ribbon thickness and circle area are both proportional to the number of
        signals, and the counts on each side total {total}.
      </p>

      <div className="signal-network-scroll" role="region" tabIndex={0} aria-label="Scrollable signal network">
        <svg
          className="signal-network-svg"
          viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
          role="group"
          aria-label={`${total} signals flowing from ${sourceCount} sources into ${collections.length} collections`}
        >
          <g className="network-ribbons" aria-hidden="true">
            {sources.map((source) => (
              <path
                key={`in-${source.key}`}
                className={source.aggregate ? 'is-aggregate' : undefined}
                strokeWidth={ribbon(source.count)}
                d={pathBetween(source.x + source.r, source.y, bandLeft - 5, source.bandY)}
              />
            ))}
            {collections.map((collection) => (
              <path
                key={`out-${collection.key}`}
                className="is-collection"
                strokeWidth={ribbon(collection.count)}
                d={pathBetween(bandRight + 5, collection.bandY, collection.x - collection.r, collection.y)}
              />
            ))}
          </g>

          {/* The band runs newest-first, so a cluster of amber near the top is
              a real statement about when opportunities landed, not an artifact.
              Say which way it reads or it looks like one. */}
          <text className="network-band-label" x={GRAPH.bandX} y="42" textAnchor="middle">
            every signal &middot; newest first
          </text>

          <g className="network-band" aria-hidden="true">
            {dots
              .filter((dot) => !dot.opportunity)
              .map((dot) => (
                <circle key={`d-${dot.index}`} cx={dot.x} cy={dot.y} r="1.9" />
              ))}
          </g>

          <g className="network-signals">
            {dots
              .filter((dot) => dot.opportunity)
              .map((dot) =>
                dot.signal && isSafeUrl(dot.signal.url) ? (
                  <a
                    key={`o-${dot.index}`}
                    href={dot.signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Opportunity: ${dot.signal.title}; ${dot.signal.source_name}; ${shortDate(
                      dot.signal.published_at ?? dot.signal.created_at,
                    )}`}
                  >
                    <circle className="is-opportunity" cx={dot.x} cy={dot.y} r="4" />
                    <circle className="network-hit-area" cx={dot.x} cy={dot.y} r="9" />
                  </a>
                ) : (
                  <circle key={`o-${dot.index}`} className="is-opportunity" cx={dot.x} cy={dot.y} r="4" />
                ),
              )}
          </g>

          <g className="network-sources">
            {sources.map((source) => {
              const [lineOne, lineTwo] = splitLabel(source.label, 22);
              return (
                <a
                  key={source.key}
                  href={source.href}
                  {...(isSafeUrl(source.href)
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  aria-label={`${source.label}, ${source.count} signals in the last 30 days`}
                >
                  <circle
                    className={source.aggregate ? 'is-aggregate' : undefined}
                    cx={source.x}
                    cy={source.y}
                    r={source.r}
                  />
                  <text x={source.x - source.r - 10} y={source.y - (lineTwo ? 5 : 1)} textAnchor="end">
                    <tspan x={source.x - source.r - 10}>{lineOne}</tspan>
                    {lineTwo ? (
                      <tspan x={source.x - source.r - 10} dy="15">
                        {lineTwo}
                      </tspan>
                    ) : null}
                    <tspan className="network-count" x={source.x - source.r - 10} dy="16">
                      {source.count}
                    </tspan>
                  </text>
                </a>
              );
            })}
          </g>

          <g className="network-collections">
            {collections.map((collection) => (
              <a
                key={collection.key}
                href={collection.href}
                aria-label={`View ${collection.label}, ${collection.count} signals in the last 30 days`}
              >
                <circle cx={collection.x} cy={collection.y} r={collection.r} />
                <text x={collection.x + collection.r + 11} y={collection.y - 2}>
                  <tspan>{collection.label}</tspan>
                  <tspan className="network-count" x={collection.x + collection.r + 11} dy="16">
                    {collection.count}
                  </tspan>
                </text>
              </a>
            ))}
          </g>

          {/* Both sides of the junction total the same population. Saying so on
              the drawing is the point of the whole layout. */}
          <g className="network-balance" aria-hidden="true">
            <line x1="60" y1="428" x2="840" y2="428" />
            <text className="network-balance-num" x={GRAPH.sourceX} y="452" textAnchor="middle">
              {total}
            </text>
            <text className="network-balance-eq" x={(GRAPH.sourceX + GRAPH.bandX) / 2} y="450" textAnchor="middle">
              =
            </text>
            <text className="network-balance-num" x={GRAPH.bandX} y="452" textAnchor="middle">
              {total}
            </text>
            <text
              className="network-balance-eq"
              x={(GRAPH.bandX + GRAPH.collectionX) / 2}
              y="450"
              textAnchor="middle"
            >
              =
            </text>
            <text className="network-balance-num" x={GRAPH.collectionX} y="452" textAnchor="middle">
              {total}
            </text>
          </g>
        </svg>
      </div>

      <dl className="signal-network-summary">
        <div>
          <dd>{sourceCount}</dd>
          <dt>sources</dt>
        </div>
        <div>
          <dd>{total}</dd>
          <dt>signals</dt>
        </div>
        <div>
          <dd>{opportunities}</dd>
          <dt>opportunities</dt>
        </div>
        <div>
          <dd>{collections.length}</dd>
          <dt>collections</dt>
        </div>
      </dl>

      {/* The structure, for anyone who cannot see the drawing. Counts rather
          than 247 headlines: the feed below already lists the items. */}
      <div className="sr-only">
        <p>Signals by collection:</p>
        <ul>
          {collections.map((collection) => (
            <li key={collection.key}>
              {collection.label}: {collection.count}
            </li>
          ))}
        </ul>
        <p>Signals by source:</p>
        <ul>
          {sources.map((source) => (
            <li key={source.key}>
              {source.label}: {source.count}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
