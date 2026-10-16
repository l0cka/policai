'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import { StatusPill } from '@/components/policy-indicators';
import { cn } from '@/lib/utils';
import {
  JURISDICTION_NAMES,
  getPolicyTypeName,
} from '@/types';
import {
  COVERAGE_JURISDICTIONS,
  COVERAGE_JURISDICTION_ABBREVIATIONS,
  COVERAGE_LEVELS,
  coverageEmptySentence,
  coverageFootnote,
  coverageLevel,
  coverageTable,
  parseCoverageViewState,
  selectionKey,
  serializeCoverageViewState,
  type CoverageAxis,
  type CoverageData,
  type CoverageRow,
  type CoverageSelection,
  type CoverageViewState,
} from '@/lib/coverage-data';

const AXES: { axis: CoverageAxis; label: string }[] = [
  { axis: 'theme', label: 'By theme' },
  { axis: 'type', label: 'By instrument type' },
];

const DRILL_ID = 'coverage-drilldown';
const DRILL_HEADING_ID = 'coverage-drilldown-heading';

type Position = { r: number; c: number };

function recordsLabel(count: number): string {
  return `${count} ${count === 1 ? 'record' : 'records'}`;
}

function originPosition(rows: CoverageRow[], selection: CoverageSelection): Position | null {
  switch (selection.kind) {
    case 'none':
      return null;
    case 'column':
      return { r: 0, c: COVERAGE_JURISDICTIONS.indexOf(selection.column) + 1 };
    case 'row':
      return { r: rows.findIndex((row) => row.key === selection.row) + 1, c: 0 };
    case 'cell':
      return {
        r: rows.findIndex((row) => row.key === selection.row) + 1,
        c: COVERAGE_JURISDICTIONS.indexOf(selection.column) + 1,
      };
  }
}

function focusableGrid(rows: CoverageRow[]): boolean[][] {
  return [
    [false, ...COVERAGE_JURISDICTIONS.map(() => true)],
    ...rows.map((row) => [true, ...row.cells.map((cell) => cell.length > 0)]),
  ];
}

function firstFocusable(grid: boolean[][]): Position {
  for (let r = 1; r < grid.length; r += 1) {
    const c = grid[r].findIndex((ok, index) => index > 0 && ok);
    if (c > 0) return { r, c };
  }
  return { r: 0, c: 1 };
}

function step(grid: boolean[][], from: Position, dr: number, dc: number): Position {
  let r = from.r + dr;
  let c = from.c + dc;
  while (r >= 0 && r < grid.length && c >= 0 && c < grid[r].length) {
    if (grid[r][c]) return { r, c };
    r += dr;
    c += dc;
  }
  return from;
}

function edge(grid: boolean[][], from: Position, end: boolean): Position {
  const row = grid[from.r];
  const indexes = row.map((ok, c) => (ok ? c : -1)).filter((c) => c >= 0);
  return { r: from.r, c: end ? indexes[indexes.length - 1] : indexes[0] };
}

export function CoverageMap({
  data,
  initialState,
}: {
  data: CoverageData;
  initialState: CoverageViewState;
}) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(initialState);
  const [announcement, setAnnouncement] = useState('');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const mapRef = useRef<HTMLDivElement>(null);
  const drillRef = useRef<HTMLTableRowElement>(null);

  const table = coverageTable(data, state.axis);
  const { rows } = table;
  const grid = focusableGrid(rows);
  const firstCell = firstFocusable(grid);
  const [active, setActive] = useState<Position>(
    () => originPosition(rows, initialState.selection) ?? firstCell,
  );
  const activePosition =
    active.r < grid.length && grid[active.r][active.c] ? active : firstCell;

  const commit = useCallback((next: CoverageViewState, mode: 'push' | 'replace') => {
    stateRef.current = next;
    setState(next);
    const query = serializeCoverageViewState(next).toString();
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = parseCoverageViewState(new URLSearchParams(window.location.search), data);
      stateRef.current = next;
      setState(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [data]);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-site-header]');
    const map = mapRef.current;
    if (!header || !map) return;
    const observer = new ResizeObserver(() => {
      map.style.setProperty('--coverage-sticky-top', `${header.getBoundingClientRect().height}px`);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (initialState.selection.kind !== 'none') {
      drillRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [initialState.selection.kind]);

  const focusAt = useCallback((position: Position) => {
    setActive(position);
    buttons.current.get(`${position.r}:${position.c}`)?.focus();
  }, []);

  const clear = useCallback(() => {
    const current = stateRef.current;
    const origin = originPosition(coverageTable(data, current.axis).rows, current.selection);
    commit({ axis: current.axis, selection: { kind: 'none' } }, 'replace');
    setAnnouncement('Selection cleared.');
    if (origin) focusAt(origin);
  }, [commit, data, focusAt]);

  const select = useCallback(
    (selection: CoverageSelection) => {
      const current = stateRef.current;
      if (selectionKey(current.selection) === selectionKey(selection)) {
        clear();
        return;
      }
      commit({ axis: current.axis, selection }, current.selection.kind === 'none' ? 'replace' : 'push');
      const summary = summarise(coverageTable(data, current.axis).rows, selection, current.axis);
      setAnnouncement(`${summary.heading}: ${recordsLabel(summary.count)}, listed below.`);
    },
    [clear, commit, data],
  );

  const switchAxis = (axis: CoverageAxis) => {
    if (axis === stateRef.current.axis) return;
    commit({ axis, selection: { kind: 'none' } }, 'push');
    setAnnouncement('');
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLElement;
    const r = Number(target.dataset.r);
    const c = Number(target.dataset.c);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    const from = { r, c };
    const moves: Record<string, () => Position> = {
      ArrowRight: () => step(grid, from, 0, 1),
      ArrowLeft: () => step(grid, from, 0, -1),
      ArrowDown: () => step(grid, from, 1, 0),
      ArrowUp: () => step(grid, from, -1, 0),
      Home: () => edge(grid, from, false),
      End: () => edge(grid, from, true),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusAt(move());
  };

  const onRegionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && stateRef.current.selection.kind !== 'none') {
      event.preventDefault();
      clear();
    }
  };

  const gridButton = (position: Position, extra: { selected: boolean }) => ({
    ref: (element: HTMLButtonElement | null) => {
      const key = `${position.r}:${position.c}`;
      if (element) buttons.current.set(key, element);
      else buttons.current.delete(key);
    },
    'data-r': position.r,
    'data-c': position.c,
    tabIndex: activePosition.r === position.r && activePosition.c === position.c ? 0 : -1,
    onFocus: () => setActive(position),
    'aria-expanded': extra.selected,
    'aria-controls': extra.selected ? DRILL_ID : undefined,
  });

  const selection = state.selection;
  const selectedRow = 'row' in selection ? selection.row : null;
  const selectedColumn = 'column' in selection ? selection.column : null;
  const rowNoun = state.axis === 'theme' ? 'Theme' : 'Type';

  const drillRow =
    selection.kind === 'none' ? null : (
      <tr ref={drillRef} role="row" className="coverage-drill-row">
        <td role="cell" colSpan={COVERAGE_JURISDICTIONS.length + 2}>
          <Drilldown data={data} rows={rows} selection={selection} axis={state.axis} onClear={clear} />
        </td>
      </tr>
    );

  return (
    <div ref={mapRef} className="coverage-map" onKeyDown={onRegionKeyDown}>
      <div className="coverage-controls">
        <div role="group" aria-label="Chart rows" className="coverage-axis">
          {AXES.map(({ axis, label }) => (
            <button
              key={axis}
              type="button"
              aria-pressed={state.axis === axis}
              onClick={() => switchAxis(axis)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="coverage-legend" aria-hidden="true">
          <span>Records</span>
          {COVERAGE_LEVELS.map(({ level, label }) => (
            <span key={level} className="coverage-swatch" data-level={level}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {rows.length === 0 ? (
        <div className="coverage-empty">
          <p className="section-title">{coverageEmptySentence(table)}</p>
          <ul>
            {table.uncharted.map((entry) => (
              <li key={entry.key}>
                {entry.label}: {recordsLabel(entry.total)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
      <table role="table" className="coverage-table" onKeyDown={onGridKeyDown}>
        <caption className="sr-only">
          Verified register records by {state.axis === 'theme' ? 'theme' : 'instrument type'} and
          jurisdiction. Select a count to list its records.
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col" className="coverage-corner">
              {rowNoun}
            </th>
            {COVERAGE_JURISDICTIONS.map((jurisdiction, index) => {
              const selected = selection.kind === 'column' && selectedColumn === jurisdiction;
              return (
                <th role="columnheader" scope="col" key={jurisdiction} className="coverage-col-head">
                  <button type="button" onClick={() => select({ kind: 'column', column: jurisdiction })} {...gridButton({ r: 0, c: index + 1 }, { selected })}>
                    <abbr title={JURISDICTION_NAMES[jurisdiction]}>{COVERAGE_JURISDICTION_ABBREVIATIONS[jurisdiction]}</abbr>
                  </button>
                </th>
              );
            })}
            <th role="columnheader" scope="col" className="coverage-total-head">
              Total
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {selection.kind === 'column' ? drillRow : null}
          {rows.map((row, rowIndex) => {
            const r = rowIndex + 1;
            const rowSelected = selection.kind === 'row' && selectedRow === row.key;
            const drillHere = selectedRow === row.key && (selection.kind === 'row' || selection.kind === 'cell');
            return (
              <Fragment key={row.key}>
                <tr role="row" className={cn('coverage-row', selectedRow === row.key && 'is-selected')}>
                  <th role="rowheader" scope="row" className="coverage-row-head">
                    <button type="button" onClick={() => select({ kind: 'row', row: row.key })} {...gridButton({ r, c: 0 }, { selected: rowSelected })}>
                      {row.label}
                    </button>
                  </th>
                  {row.cells.map((cell, columnIndex) => {
                    const jurisdiction = COVERAGE_JURISDICTIONS[columnIndex];
                    const count = cell.length;
                    if (count === 0) {
                      return (
                        <td role="cell" key={jurisdiction} className="coverage-cell is-empty">
                          <span aria-hidden="true">·</span>
                          <span className="sr-only">no records</span>
                        </td>
                      );
                    }
                    const selected =
                      selection.kind === 'cell' && selectedRow === row.key && selectedColumn === jurisdiction;
                    return (
                      <td role="cell" key={jurisdiction} className="coverage-cell">
                        <button
                          type="button"
                          data-level={coverageLevel(count)}
                          aria-label={`${row.label}, ${JURISDICTION_NAMES[jurisdiction]}: ${recordsLabel(count)}`}
                          onClick={() => select({ kind: 'cell', row: row.key, column: jurisdiction })}
                          {...gridButton({ r, c: columnIndex + 1 }, { selected })}
                        >
                          {count}
                        </button>
                      </td>
                    );
                  })}
                  <td role="cell" className="coverage-total">
                    {row.total}
                    <span className="coverage-total-unit"> {row.total === 1 ? 'record' : 'records'}</span>
                  </td>
                </tr>
                {drillHere ? drillRow : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      )}

      <p className="coverage-footnote">{coverageFootnote(table)}</p>
    </div>
  );
}

function RecordList({ ids, data }: { ids: string[]; data: CoverageData }) {
  return (
    <ul className="coverage-records">
      {ids.map((id) => {
        const record = data.records[id];
        return (
          <li key={id}>
            <span className="coverage-record-title">
              <Link href={`/policies/${id}`}>{record.lead}</Link>
              {record.rest ? <span className="coverage-record-rest"> {record.rest}</span> : null}
            </span>
            <span className="coverage-record-meta">
              {record.status === 'active' ? null : <StatusPill status={record.status} />}
              <span className="coverage-record-type">{getPolicyTypeName(record.type)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function summarise(
  rows: CoverageRow[],
  selection: CoverageSelection,
  axis: CoverageAxis,
): { heading: string; count: number; groups: { key: string; label: string | null; ids: string[] }[] } {
  const rowFor = (key: string) => rows.find((candidate) => candidate.key === key);
  switch (selection.kind) {
    case 'none':
      return { heading: '', count: 0, groups: [] };
    case 'cell': {
      const ids = rowFor(selection.row)?.cells[COVERAGE_JURISDICTIONS.indexOf(selection.column)] ?? [];
      return {
        heading: `${rowFor(selection.row)?.label} · ${JURISDICTION_NAMES[selection.column]}`,
        count: ids.length,
        groups: [{ key: selection.column, label: null, ids }],
      };
    }
    case 'row': {
      const row = rowFor(selection.row);
      return {
        heading: `${row?.label} · All jurisdictions`,
        count: row?.total ?? 0,
        groups: COVERAGE_JURISDICTIONS.map((jurisdiction, index) => ({
          key: jurisdiction,
          label: JURISDICTION_NAMES[jurisdiction],
          ids: row?.cells[index] ?? [],
        })).filter((group) => group.ids.length > 0),
      };
    }
    case 'column': {
      const index = COVERAGE_JURISDICTIONS.indexOf(selection.column);
      const groups = rows
        .map((row) => ({ key: row.key, label: row.label, ids: row.cells[index] }))
        .filter((group) => group.ids.length > 0);
      return {
        heading: `${JURISDICTION_NAMES[selection.column]} · All ${axis === 'theme' ? 'themes' : 'instrument types'}`,
        count: new Set(groups.flatMap((group) => group.ids)).size,
        groups,
      };
    }
  }
}

function Drilldown({
  data,
  rows,
  selection,
  axis,
  onClear,
}: {
  data: CoverageData;
  rows: CoverageRow[];
  selection: CoverageSelection;
  axis: CoverageAxis;
  onClear: () => void;
}) {
  const { heading, count, groups } = summarise(rows, selection, axis);
  return (
    <div id={DRILL_ID} role="region" aria-labelledby={DRILL_HEADING_ID} className="coverage-drill">
      <div className="coverage-drill-head">
        <h2 id={DRILL_HEADING_ID}>
          {heading} <span className="coverage-drill-count">{recordsLabel(count)}</span>
        </h2>
        <button type="button" onClick={onClear} className="coverage-clear">
          Clear selection
        </button>
      </div>
      {groups.length === 0 ? <p className="coverage-group-empty">No charted records.</p> : null}
      {groups.map((group) =>
        group.label === null ? (
          <RecordList key={group.key} ids={group.ids} data={data} />
        ) : (
          <section key={group.key} className="coverage-group">
            <h3>{group.label}</h3>
            <RecordList ids={group.ids} data={data} />
          </section>
        ),
      )}
    </div>
  );
}
