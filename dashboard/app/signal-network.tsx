const COLLECTIONS: Record<string, string> = {
  news: 'News',
  law_reform: 'Law reform',
  funding: 'Funding',
  tech_justice: 'Tech & justice',
  unclassified: 'Unclassified',
};

export type SignalNetworkRow = {
  id: string | number;
  title: string;
  url: string;
  stream: string | null;
  opportunity: boolean;
  published_at: string | Date | null;
  created_at: string | Date;
  source_name: string;
  source_url: string;
  source_signal_count: number;
  collection_signal_count: number;
  total_signals: number;
};

type PositionedSignal = SignalNetworkRow & {
  collection: string;
  x: number;
  y: number;
};

type PositionedNode = {
  key: string;
  label: string;
  count: number;
  x: number;
  y: number;
  href: string;
};

const GRAPH = {
  width: 900,
  height: 470,
  sourceX: 178,
  signalX: 486,
  collectionX: 748,
  top: 54,
  bottom: 430,
};

function isSafeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function collectionKey(stream: string | null): string {
  return stream && Object.prototype.hasOwnProperty.call(COLLECTIONS, stream)
    ? stream
    : 'unclassified';
}

function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function splitLabel(value: string, maxLength = 23): [string, string?] {
  if (value.length <= maxLength) return [value];
  const words = value.split(/\s+/);
  let first = '';
  let index = 0;
  while (index < words.length && `${first} ${words[index]}`.trim().length <= maxLength) {
    first = `${first} ${words[index]}`.trim();
    index += 1;
  }
  const remainder = words.slice(index).join(' ');
  const second = remainder.length > maxLength ? `${remainder.slice(0, maxLength - 1)}…` : remainder;
  return [first || words[0], second || undefined];
}

function selectSignals(rows: SignalNetworkRow[]): SignalNetworkRow[] {
  const sourceCounts = new Map<string, number>();
  for (const row of rows) {
    sourceCounts.set(
      row.source_name,
      Math.max(sourceCounts.get(row.source_name) ?? 0, Number(row.source_signal_count) || 0),
    );
  }

  const sourceNames = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name]) => name);
  const sourceOrder = new Map(sourceNames.map((name, index) => [name, index]));
  const grouped = sourceNames.map((name) => rows.filter((row) => row.source_name === name));
  const selected = grouped.flatMap((group) => group.slice(0, 6));
  const selectedIds = new Set(selected.map((row) => String(row.id)));

  for (const row of rows) {
    if (selected.length >= 30) break;
    if (sourceOrder.has(row.source_name) && !selectedIds.has(String(row.id))) {
      selected.push(row);
      selectedIds.add(String(row.id));
    }
  }

  return selected.sort((a, b) => {
    const sourceDifference =
      (sourceOrder.get(a.source_name) ?? 99) - (sourceOrder.get(b.source_name) ?? 99);
    if (sourceDifference) return sourceDifference;
    return (
      new Date(b.published_at ?? b.created_at).getTime() -
      new Date(a.published_at ?? a.created_at).getTime()
    );
  });
}

function pathBetween(x1: number, y1: number, x2: number, y2: number): string {
  const bend = (x2 - x1) * 0.48;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function buildGraph(rows: SignalNetworkRow[]) {
  const selected = selectSignals(rows);
  const step = selected.length > 1 ? (GRAPH.bottom - GRAPH.top) / (selected.length - 1) : 0;
  const signals: PositionedSignal[] = selected.map((row, index) => ({
    ...row,
    collection: collectionKey(row.stream),
    x: GRAPH.signalX,
    y: selected.length === 1 ? (GRAPH.top + GRAPH.bottom) / 2 : GRAPH.top + index * step,
  }));

  const sourceGroups = new Map<string, PositionedSignal[]>();
  const collectionGroups = new Map<string, PositionedSignal[]>();
  for (const signal of signals) {
    sourceGroups.set(signal.source_name, [...(sourceGroups.get(signal.source_name) ?? []), signal]);
    collectionGroups.set(signal.collection, [
      ...(collectionGroups.get(signal.collection) ?? []),
      signal,
    ]);
  }

  const sources: PositionedNode[] = [...sourceGroups.entries()].map(([name, sourceSignals]) => {
    const first = sourceSignals[0];
    return {
      key: name,
      label: name,
      count: Number(first.source_signal_count) || sourceSignals.length,
      x: GRAPH.sourceX,
      y: sourceSignals.reduce((sum, signal) => sum + signal.y, 0) / sourceSignals.length,
      href: isSafeUrl(first.source_url) ? first.source_url : '/',
    };
  });

  const collections: PositionedNode[] = [...collectionGroups.entries()]
    .map(([key, collectionSignals]) => ({
      key,
      label: COLLECTIONS[key],
      count: Number(collectionSignals[0].collection_signal_count) || collectionSignals.length,
      x: GRAPH.collectionX,
      y: collectionSignals.reduce((sum, signal) => sum + signal.y, 0) / collectionSignals.length,
      href: key === 'unclassified' ? '/#radar-feed' : `/?stream=${key}#radar-feed`,
    }))
    .sort((a, b) => a.y - b.y);

  const minimumGap = 82;
  for (let index = 1; index < collections.length; index += 1) {
    collections[index].y = Math.max(collections[index].y, collections[index - 1].y + minimumGap);
  }
  const overflow = collections.at(-1)?.y ? Math.max(0, collections.at(-1)!.y - GRAPH.bottom) : 0;
  if (overflow) collections.forEach((collection) => (collection.y -= overflow));

  return { signals, sources, collections };
}

export function SignalNetwork({ rows }: { rows: SignalNetworkRow[] }) {
  const { signals, sources, collections } = buildGraph(rows);
  const sourceByName = new Map(sources.map((source) => [source.key, source]));
  const collectionByKey = new Map(collections.map((collection) => [collection.key, collection]));
  const selected = signals.find((signal) => signal.opportunity) ?? signals[0];
  const opportunityCount = rows.filter((row) => row.opportunity).length;
  const totalSignals = Number(rows[0]?.total_signals) || rows.length;
  const [selectedTitleOne, selectedTitleTwo] = splitLabel(selected?.title ?? '');

  return (
    <figure className="signal-network" aria-labelledby="signal-network-title" aria-describedby="signal-network-description">
      <figcaption className="signal-network-head">
        <span id="signal-network-title">Source <b aria-hidden="true">→</b> signal <b aria-hidden="true">→</b> collection</span>
        <span className="signal-network-range">Last 30 days</span>
        <span className="signal-network-legend" aria-hidden="true">
          <i className="network-key source" /> Source
          <i className="network-key signal" /> Signal
          <i className="network-key opportunity" /> Opportunity
          <i className="network-key collection" /> Collection
        </span>
        <span className="signal-network-hint">Scroll to trace the network</span>
      </figcaption>

      <p id="signal-network-description" className="sr-only">
        A network of {signals.length} recent access-to-justice signals from {sources.length} leading sources, connected to {collections.length} collections. {opportunityCount} signals in the last 30 days are opportunities.
      </p>

      {signals.length ? (
        <div className="signal-network-scroll" tabIndex={0} aria-label="Scrollable signal network">
          <svg
            className="signal-network-svg"
            viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
            role="group"
            aria-label="Source to signal to collection network"
          >
            <g className="network-edges" aria-hidden="true">
              {signals.map((signal) => {
                const source = sourceByName.get(signal.source_name)!;
                const collection = collectionByKey.get(signal.collection)!;
                return (
                  <g key={signal.id} className={signal.opportunity ? 'is-opportunity' : undefined}>
                    <path d={pathBetween(source.x + 10, source.y, signal.x - 7, signal.y)} />
                    <path d={pathBetween(signal.x + 7, signal.y, collection.x - 15, collection.y)} />
                  </g>
                );
              })}
            </g>

            <g className="network-sources">
              {sources.map((source) => {
                const [lineOne, lineTwo] = splitLabel(source.label, 22);
                return (
                  <a key={source.key} href={source.href} target="_blank" rel="noopener noreferrer" aria-label={`${source.label}, ${source.count} signals in the last 30 days`}>
                    <circle cx={source.x} cy={source.y} r="9" />
                    <text x={source.x - 18} y={source.y - (lineTwo ? 5 : 1)} textAnchor="end">
                      <tspan x={source.x - 18}>{lineOne}</tspan>
                      {lineTwo ? <tspan x={source.x - 18} dy="15">{lineTwo}</tspan> : null}
                      <tspan className="network-count" x={source.x - 18} dy="16">{source.count}</tspan>
                    </text>
                  </a>
                );
              })}
            </g>

            <g className="network-signals">
              {signals.map((signal) => {
                const label = `${signal.title}; ${signal.source_name}; ${COLLECTIONS[signal.collection]}; ${shortDate(signal.published_at ?? signal.created_at)}${signal.opportunity ? '; opportunity' : ''}`;
                return isSafeUrl(signal.url) ? (
                  <a key={signal.id} href={signal.url} target="_blank" rel="noopener noreferrer" aria-label={label}>
                    <circle className={signal.opportunity ? 'is-opportunity' : undefined} cx={signal.x} cy={signal.y} r={signal.opportunity ? 8 : 5.5} />
                    <circle className="network-hit-area" cx={signal.x} cy={signal.y} r="14" />
                  </a>
                ) : (
                  <g key={signal.id} aria-label={label} role="img">
                    <circle className={signal.opportunity ? 'is-opportunity' : undefined} cx={signal.x} cy={signal.y} r={signal.opportunity ? 8 : 5.5} />
                  </g>
                );
              })}
            </g>

            <g className="network-collections">
              {collections.map((collection) => (
                <a key={collection.key} href={collection.href} aria-label={`View ${collection.label}, ${collection.count} signals in the last 30 days`}>
                  <circle cx={collection.x} cy={collection.y} r="16" />
                  <text x={collection.x + 27} y={collection.y - 2}>
                    <tspan>{collection.label}</tspan>
                    <tspan className="network-count" x={collection.x + 27} dy="18">{collection.count} signals</tspan>
                  </text>
                </a>
              ))}
            </g>

            {selected ? (
              <g className="network-annotation" aria-hidden="true" transform={`translate(520 ${Math.max(64, Math.min(350, selected.y - 26))})`}>
                <path d="M -25 25 H -6" />
                <rect width="188" height={selectedTitleTwo ? 72 : 58} />
                <text x="13" y="21">
                  <tspan>{selectedTitleOne}</tspan>
                  {selectedTitleTwo ? <tspan x="13" dy="16">{selectedTitleTwo}</tspan> : null}
                  <tspan className="network-annotation-meta" x="13" dy="18">
                    {shortDate(selected.published_at ?? selected.created_at)}
                  </tspan>
                </text>
              </g>
            ) : null}
          </svg>
        </div>
      ) : (
        <p className="signal-network-empty">No signals were collected in the last 30 days.</p>
      )}

      <dl className="signal-network-summary">
        <div><dd>{sources.length}</dd><dt>sources shown</dt></div>
        <div><dd>{signals.length}</dd><dt>signals shown</dt></div>
        <div><dd>{opportunityCount}</dd><dt>opportunities</dt></div>
        <div><dd>{collections.length}</dd><dt>collections</dt></div>
        <div><dd>{totalSignals}</dd><dt>total signals</dt></div>
      </dl>

      <ul className="sr-only">
        {signals.map((signal) => (
          <li key={signal.id}>
            {signal.source_name}: {signal.title}; collection {COLLECTIONS[signal.collection]}
            {signal.opportunity ? '; opportunity' : ''}.
          </li>
        ))}
      </ul>
    </figure>
  );
}
