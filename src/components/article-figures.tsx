import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { formatPolicyDate } from '@/lib/format-policy-date';
import type { ArticleCitation } from '@/lib/data-service';
import {
  FIGURE_KIND_NAMES,
  type ArticleFigure,
  type FlowFigure,
  type FlowStep,
  type MatrixFigure,
  type TimelineFigure,
} from '@/types';

const FIGURE_LINK = 'figure-link';

function hostName(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

function RecordLink({ policyId, citations }: { policyId: string; citations: readonly ArticleCitation[] }) {
  const citation = citations.find((entry) => entry.policyId === policyId);
  if (!citation || citation.state === 'not_public') {
    return <span>Register record under review</span>;
  }
  return (
    <Link href={`/policies/${policyId}`} className={FIGURE_LINK}>
      {citation.title ?? policyId}
    </Link>
  );
}

function SourceLine({ items }: { items: ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <p className="figure-sources">
      <span className="figure-sources-label">Sources</span>{' '}
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' · ' : null}
          {item}
        </span>
      ))}
    </p>
  );
}

function officialSources(sources: readonly string[]): ReactNode[] {
  return sources.map((url) => (
    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className={FIGURE_LINK}>
      {hostName(url)}
    </a>
  ));
}

function TimelineBody({ figure }: { figure: TimelineFigure }) {
  return (
    <ol className="figure-timeline">
      {figure.entries.map((entry) => (
        <li
          key={`${entry.date}-${entry.title}`}
          className="figure-timeline-entry"
          data-state={entry.date > figure.asAt ? 'upcoming' : 'past'}
        >
          <time className="figure-timeline-date" dateTime={entry.date.slice(0, entry.precision === 'day' ? 10 : entry.precision === 'month' ? 7 : 4)}>
            {formatPolicyDate({ type: 'effective', date: entry.date, precision: entry.precision }, { short: true })}
          </time>
          <span className="figure-timeline-marker" aria-hidden="true" />
          <div>
            <p className="figure-timeline-title">{entry.title}</p>
            {entry.detail ? <p className="figure-timeline-detail">{entry.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MatrixBody({ figure }: { figure: MatrixFigure }) {
  return (
    <table className="figure-matrix">
      <caption className="sr-only">{figure.title}</caption>
      <thead>
        <tr>
          {figure.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {figure.rows.map((row) => (
          <tr key={row.header}>
            <th scope="row">{row.header}</th>
            {row.cells.map((cell, index) => (
              <td
                key={index}
                data-label={figure.columns[index + 1]}
                data-emphasis={cell.kind === 'text' && cell.emphasis ? 'true' : undefined}
                data-empty={cell.kind === 'not_stated' ? 'true' : undefined}
              >
                {cell.kind === 'text' ? cell.text : 'Not stated'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FlowSteps({ steps, start }: { steps: readonly FlowStep[]; start: number }) {
  return steps.map((step, index) => (
    <li key={`${start + index}-${step.text}`} className="figure-flow-step" data-role={step.role}>
      <span className="figure-flow-label">{step.label ?? ''}</span>
      <span className="figure-flow-box">
        <span className="figure-flow-number">{start + index}</span>
        <span className="figure-flow-text">{step.text}</span>
      </span>
    </li>
  ));
}

function FlowBody({ figure }: { figure: FlowFigure }) {
  const { steps, branch } = figure;
  const columns = Math.max(steps.length, branch ? branch.from + branch.steps.length - 1 : 0);
  const style = { '--flow-columns': columns } as CSSProperties;
  return (
    <div className="figure-flow" style={style}>
      <ol className="figure-flow-main">
        <FlowSteps steps={steps} start={1} />
      </ol>
      {branch ? (
        <div className="figure-flow-branch" style={{ '--flow-from': branch.from } as CSSProperties}>
          <p className="figure-flow-branch-label">
            <span className="sr-only">From step {branch.from}: </span>
            {branch.label}
          </p>
          <ol className="figure-flow-branch-steps" start={steps.length + 1}>
            <FlowSteps steps={branch.steps} start={steps.length + 1} />
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function figureBody(figure: ArticleFigure): ReactNode {
  switch (figure.kind) {
    case 'timeline':
      return <TimelineBody figure={figure} />;
    case 'matrix':
      return <MatrixBody figure={figure} />;
    case 'flow':
      return <FlowBody figure={figure} />;
    case 'chart':
      return null;
  }
}

function sourceItems(figure: ArticleFigure, citations: readonly ArticleCitation[]): ReactNode[] {
  const records =
    figure.kind === 'chart'
      ? []
      : figure.cites.map((policyId) => <RecordLink key={policyId} policyId={policyId} citations={citations} />);
  return [...records, ...officialSources(figure.sources)];
}

export function ArticleFigureView({
  number,
  figure,
  citations,
}: {
  number: number;
  figure: ArticleFigure;
  citations: readonly ArticleCitation[];
}) {
  const id = `fig-${number}`;
  const wide = (figure.kind === 'matrix' || figure.kind === 'flow') && figure.wide;
  return (
    <figure
      className={`figure not-prose${wide ? ' figure-wide' : ''}`}
      data-kind={figure.kind}
      role="figure"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-alt`}
    >
      <p className="figure-label">
        Figure {number} · {FIGURE_KIND_NAMES[figure.kind]}
      </p>
      <p id={`${id}-title`} className="figure-title">
        {figure.title}
      </p>
      <p id={`${id}-alt`} className="sr-only">
        {figure.alt}
      </p>
      <div className="figure-body">{figureBody(figure)}</div>
      <figcaption className="figure-caption">
        <span className="figure-caption-text">{figure.caption}</span>
        <SourceLine items={sourceItems(figure, citations)} />
      </figcaption>
    </figure>
  );
}
