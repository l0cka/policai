'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { addFollow, emptyFollows, readFollows, subscribeFollows } from '@/lib/follows';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import {
  decodeAnswers,
  encodeAnswers,
  QUESTIONS,
  STATE_JURISDICTIONS,
} from '@/lib/rule-finder/questions';
import {
  audienceLabel,
  findRules,
  LEGAL_FORCES,
  type Audience,
  type FinderAnswers,
  type FinderPolicy,
  type RuleScope,
} from '@/lib/rule-finder/scope';
import { getJurisdictionName, getPolicyStatusName, type Jurisdiction } from '@/types';

/** Answer index per question id; jurisdictions are kept apart because they are a multi-select. */
type Picks = Record<string, number>;

function answersFrom(picks: Picks, jurisdictions: ReadonlySet<Jurisdiction>): FinderAnswers {
  const audiences = new Set<Audience>();
  for (const question of QUESTIONS) {
    if (question.kind !== 'choice') continue;
    const pick = picks[question.id];
    if (pick !== undefined) for (const audience of question.options[pick].audiences) audiences.add(audience);
  }
  return { audiences, jurisdictions };
}

const locationListeners = new Set<() => void>();

function subscribeLocation(listener: () => void): () => void {
  locationListeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    locationListeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

/** Answers live in the address bar, so a result can be shared and nothing is stored. */
function replaceSearch(search: string) {
  window.history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
  for (const listener of locationListeners) listener();
}

const optionClass =
  'flex min-h-11 w-full items-center rounded border border-input px-4 text-left text-sm font-medium text-foreground hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary';

export function RuleFinder({
  scopes,
  policies,
}: {
  scopes: readonly RuleScope[];
  policies: readonly FinderPolicy[];
}) {
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Picks>({});
  const [jurisdictions, setJurisdictions] = useState<ReadonlySet<Jurisdiction>>(new Set());
  const search = useSyncExternalStore(subscribeLocation, () => window.location.search, () => '');
  const result = useMemo(() => decodeAnswers(search), [search]);

  function finish(finalPicks: Picks) {
    replaceSearch(encodeAnswers(answersFrom(finalPicks, jurisdictions)));
  }

  function restart() {
    replaceSearch('');
    setPicks({});
    setJurisdictions(new Set());
    setStep(0);
  }

  if (result) {
    return <FinderResults scopes={scopes} policies={policies} answers={result} onRestart={restart} />;
  }

  const question = QUESTIONS[step];
  const last = step === QUESTIONS.length - 1;
  const next = (nextPicks: Picks) => (last ? finish(nextPicks) : setStep(step + 1));

  return (
    <section aria-labelledby="finder-question" className="mt-6 max-w-2xl">
      <p className="page-eyebrow" aria-live="polite">
        Question {step + 1} of {QUESTIONS.length}
      </p>
      <h2 id="finder-question" className="mt-2 text-xl font-semibold text-foreground">
        {question.prompt}
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{question.hint}</p>

      {question.kind === 'jurisdictions' ? (
        <div className="mt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {STATE_JURISDICTIONS.map((code) => {
              const pressed = jurisdictions.has(code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={pressed}
                  className={optionClass}
                  onClick={() => {
                    const nextSet = new Set(jurisdictions);
                    if (pressed) nextSet.delete(code);
                    else nextSet.add(code);
                    setJurisdictions(nextSet);
                  }}
                >
                  {getJurisdictionName(code)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => next(picks)}
            className="mt-4 inline-flex min-h-11 items-center rounded bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {jurisdictions.size === 0 ? 'Commonwealth only' : 'Next'}
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {question.options.map((option, index) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={picks[question.id] === index}
              className={optionClass}
              onClick={() => {
                const nextPicks = { ...picks, [question.id]: index };
                setPicks(nextPicks);
                next(nextPicks);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {step > 0 ? (
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          className="mt-4 text-sm text-primary underline underline-offset-4"
        >
          Back
        </button>
      ) : null}
    </section>
  );
}

function FinderResults({
  scopes,
  policies,
  answers,
  onRestart,
}: {
  scopes: readonly RuleScope[];
  policies: readonly FinderPolicy[];
  answers: FinderAnswers;
  onRestart: () => void;
}) {
  const groups = findRules(scopes, policies, answers);
  const found = groups.flatMap((group) => group.rules);
  const follows = useSyncExternalStore(subscribeFollows, readFollows, emptyFollows);
  const allFollowed = found.every(({ policy }) =>
    follows.some((follow) => follow.kind === 'policy' && follow.id === policy.id),
  );
  const where = [...answers.jurisdictions].map(getJurisdictionName);

  return (
    <section aria-labelledby="finder-results" className="mt-6">
      <h2 id="finder-results" className="text-xl font-semibold text-foreground">
        {found.length === 1 ? '1 rule names' : `${found.length} rules name`} organisations like yours
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-sm leading-6 text-muted-foreground">
        Commonwealth rules{where.length ? ` and rules in ${where.join(', ')}` : ''}, matched on your answers.
        Each one quotes whom the instrument says it covers. Whether it applies to you depends on your
        circumstances.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {found.length > 0 ? (
          <button
            type="button"
            disabled={allFollowed}
            onClick={() => {
              for (const { policy } of found) addFollow({ kind: 'policy', id: policy.id });
            }}
            className="inline-flex min-h-11 items-center rounded bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {allFollowed ? 'Following all of these' : `Follow all ${found.length}`}
          </button>
        ) : null}
        <button type="button" onClick={onRestart} className="text-sm text-primary underline underline-offset-4">
          Start again
        </button>
      </div>

      {groups.map((group) => {
        const force = LEGAL_FORCES.find(({ key }) => key === group.force)!;
        return (
          <section key={group.force} aria-labelledby={`force-${group.force}`} className="mt-8">
            <h3 id={`force-${group.force}`} className="page-eyebrow">
              {force.label} · {group.rules.length}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{force.description}</p>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {group.rules.map(({ policy, rule }) => (
                <li
                  key={policy.id}
                  style={jurisdictionRailStyle(policy.jurisdiction)}
                  className="ink-rail min-w-0 py-4 pl-3"
                >
                  <p className="text-xs text-muted-foreground">
                    {getJurisdictionName(policy.jurisdiction)} · {getPolicyStatusName(policy.status)}
                  </p>
                  <Link
                    href={`/policies/${policy.id}`}
                    className="break-words text-base font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {policy.title}
                  </Link>
                  <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm leading-6 text-foreground">
                    “{rule.scope.quote}”
                  </blockquote>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <a
                      href={rule.scope.url}
                      className="text-primary underline underline-offset-4"
                      rel="noopener noreferrer"
                    >
                      {rule.scope.pinpoint}
                    </a>
                    {' · '}
                    {rule.appliesTo.map(audienceLabel).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <p className="mt-8 max-w-[70ch] text-xs leading-5 text-muted-foreground">
        This is general information, not legal advice. Policai tracks AI-related rules only, so other laws
        will also apply to you. Get advice on your own circumstances before you act.{' '}
        <Link href="/methodology" className="text-primary underline underline-offset-4">
          How Policai verifies records
        </Link>
      </p>
    </section>
  );
}
