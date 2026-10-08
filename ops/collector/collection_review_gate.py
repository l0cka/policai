#!/usr/bin/env python3
import argparse
import datetime
import calendar
import fcntl
import os
import tempfile
import hashlib
import json
from pathlib import Path
import re
import subprocess

POLICY_VERSION = 'x60-shadow-v1-proposed-20pct'
ALLOWED = {'data/watch-state.json', 'public/data/meta.json'}


class Refused(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def git(repo, *args):
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, GIT_OPTIONAL_LOCKS='0')
    result = subprocess.run(['git', '--no-replace-objects', '-c', 'core.fsmonitor=false',
                             '-c', 'core.hooksPath=/dev/null', *args], cwd=repo, env=env,
                            capture_output=True, timeout=30)
    require(result.returncode == 0, 'git inspection failed')
    return result.stdout.decode('utf-8')


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda value: require(False, 'non-finite JSON number'))


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def integer(value):
    return type(value) is int and value >= 0


def external_file(path, repo):
    require(path.is_absolute(), 'artifact path must be absolute')
    require(not path.resolve().is_relative_to(repo.resolve()), 'PR-owned artifact forbidden')
    require(not any(p.is_symlink() for p in [path, *path.parents]), 'artifact symlink forbidden')
    require(path.is_file(), 'artifact missing or not a regular file')
    return path.read_bytes()


def artifact(value, repo):
    require(isinstance(value, dict) and nonempty(value.get('path')), 'artifact missing')
    raw = external_file(Path(value['path']), repo)
    require(hashlib.sha256(raw).hexdigest() == value.get('sha256'), 'artifact digest mismatch')
    return raw


def attempt(result, label, function):
    try:
        return function()
    except (ValueError, OSError, KeyError, TypeError, AttributeError,
            UnicodeError, subprocess.SubprocessError) as error:
        result['reasons'].append(f'{label}: {error}')
        return None


def inspect_git(repo, base, head, result):
    require(all(re.fullmatch('[0-9a-f]{40}', sha) for sha in (base, head)), 'full SHA required')
    for sha in (base, head):
        require(git(repo, 'cat-file', '-t', sha).strip() == 'commit', 'SHA is not a commit')
    require(git(repo, 'rev-parse', 'HEAD').strip() == head, 'checkout HEAD SHA drift')
    require(not git(repo, 'status', '--porcelain', '--untracked-files=all'), 'dirty checkout')
    require(git(repo, 'merge-base', base, head).strip() == base, 'base not ancestor of head')
    changed = git(repo, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames',
                  '--raw', '--no-abbrev', '-z', base, head, '--').split('\0')
    require(changed != [''], 'empty diff')
    for index in range(0, len(changed) - 1, 2):
        metadata, path = changed[index:index + 2]
        fields = metadata.split()
        result['changed_paths'].append(path)
        if path not in ALLOWED or fields[-1] != 'M':
            result['reasons'].append(f'git: forbidden path/status {path!r} {fields[-1]}')
        if fields[0] != ':100644' or fields[1] != '100644':
            result['reasons'].append(f'git: forbidden mode {path!r}')
    result['changed_paths'].sort()
    objects = {}
    for sha in (base, head):
        objects[sha] = {}
        for path in sorted(ALLOWED):
            entry = git(repo, 'ls-tree', sha, '--', path)
            require(entry.startswith('100644 blob '), f'invalid object mode: {path}')
            objects[sha][path] = strict_json(git(repo, 'show', f'{sha}:{path}'))
    return objects


def inspect_evidence(evidence, repo, base, head, result):
    require(isinstance(evidence, dict), 'evidence must be an object')
    require(type(evidence.get('schema_version')) is int and evidence['schema_version'] == 1,
            'unsupported evidence schema')
    require((evidence.get('base'), evidence.get('head')) == (base, head), 'evidence SHA drift')
    require(evidence.get('acquired_by') == 'coordinator' and evidence.get('clean') is True,
            'coordinator-acquired clean evidence required')
    run = evidence.get('run')
    require(isinstance(run, dict) and nonempty(run.get('id')), 'run evidence missing')
    require(re.fullmatch('[A-Za-z0-9._-]{1,128}', run['id']), 'invalid run id')
    require(run.get('kind') in ('scheduled', 'historic', 'synthetic'), 'run kind missing')
    artifact(run.get('artifact'), repo)
    if run['kind'] == 'scheduled':
        require(run.get('scheduler') == 'policai-collect.timer', 'scheduled provenance missing')
    result['run_id'] = run['id']
    result['run_kind'] = run['kind']
    result['trial_eligible'] = run['kind'] == 'scheduled'
    def check_receipts():
        receipts = evidence.get('receipts')
        required = {'tests', 'lint', 'build', 'data-validation'}
        require(isinstance(receipts, list) and len(receipts) == len(required)
                and all(isinstance(r, dict) and isinstance(r.get('name'), str) for r in receipts)
                and {r['name'] for r in receipts} == required, 'receipt evidence missing/duplicate')
        for receipt in receipts:
            def check_receipt():
                require(receipt.get('head') == head and receipt.get('status') == 'success',
                        'receipt stale or not successful')
                require(type(receipt.get('data_errors')) is int and receipt['data_errors'] == 0,
                        'receipt data errors not zero')
                artifact(receipt.get('artifact'), repo)
            attempt(result, f"receipt {receipt['name']}", check_receipt)
    attempt(result, 'receipt evidence', check_receipts)
    def check_review():
        review = evidence.get('review')
        require(isinstance(review, dict), 'review evidence missing')
        require((review.get('base'), review.get('head')) == (base, head), 'review SHA drift')
        require((review.get('vendor'), review.get('model')) == ('ollama-cloud', 'glm-5.3'),
                'review vendor/model not allowed in this shadow policy')
        require(review.get('status') == 'completed' and review.get('findings') == []
                and review.get('flags', []) == [],
                'review pending, missing or flagged')
        artifact(review.get('artifact'), repo)
    attempt(result, 'review evidence', check_review)


def coverage_rows(meta, coverage, side, result):
    collector = meta['collector']
    rows = collector['sourceResults']
    require(isinstance(rows, list), 'source results missing')
    inventory = coverage['automatic_source_ids']
    require(isinstance(inventory, list) and all(nonempty(s) for s in inventory)
            and len(set(inventory)) == len(inventory) and inventory, 'invalid source inventory')
    due = coverage[side + '_due']
    require(isinstance(due, dict) and set(due) == set(inventory)
            and all(type(value) is bool for value in due.values()), 'schedule evidence incomplete')
    require(all(isinstance(row, dict) and nonempty(row.get('sourceId')) for row in rows),
            'invalid source result')
    indexed = {row['sourceId']: row for row in rows}
    require(len(indexed) == len(rows), 'duplicate source IDs')
    require(set(indexed) == set(inventory), 'missing or unexpected source IDs')
    errors = collector['lastRunErrors']
    require(isinstance(errors, list) and all(nonempty(e) for e in errors), 'invalid error list')
    for source, row in indexed.items():
        def check_row():
            status = row.get('status')
            require(status in ('success', 'error', 'skipped'), f'{source}: invalid status')
            require(type(row.get('coverageEligible')) is bool
                    and row['coverageEligible'] == due[source], f'{source}: inconsistent eligibility')
            require(not (status == 'skipped' and due[source]), f'{source}: due source skipped')
            for key in ('candidateCount', 'newCandidateCount', 'durationMs'):
                require(integer(row.get(key)), f'{source}: invalid {key}')
            require(row['newCandidateCount'] <= row['candidateCount'], f'{source}: inconsistent candidates')
            count = row.get('itemCount')
            require(count is None or integer(count), f'{source}: invalid item count')
            if status == 'success' and due[source]:
                require(integer(count), f'{source}: unknown item count')
            if status == 'skipped':
                require(count is None and row['candidateCount'] == 0 and row['newCandidateCount'] == 0,
                        f'{source}: skipped source has successful counts')
            if status == 'error':
                require(nonempty(row.get('error')) and any(e.startswith(source + ':') for e in errors),
                        f'{source}: hidden failure')
            else:
                require(not row.get('error') and not any(e.startswith(source + ':') for e in errors),
                        f'{source}: hidden error on {status}')
        attempt(result, f'coverage {side} {source}', check_row)
    success = sum(row.get('status') == 'success' and due[source] for source, row in indexed.items())
    failed = sum(row.get('status') == 'error' and due[source] for source, row in indexed.items())
    skipped = sum(row.get('status') == 'skipped' for row in rows)
    totals = {'automaticSourceCount': len(inventory), 'manualSourceCount': coverage['manual_source_count'],
              'dueSourceCount': success + failed, 'successfulSourceCount': success,
              'failedSourceCount': failed, 'skippedSourceCount': skipped}
    require(integer(coverage['manual_source_count']), 'invalid manual inventory count')
    for key, expected in totals.items():
        require(integer(collector.get(key)) and collector[key] == expected, f'inconsistent {key}')
    require(integer(collector.get('runCount')), 'invalid run count')
    expected_rate = ((success * 1000 + (success + failed) // 2) // (success + failed)) / 1000 if success + failed else 1
    require(type(collector.get('successRate')) in (int, float)
            and collector['successRate'] == expected_rate, 'inconsistent successRate')
    checked = collector.get('lastRunSources')
    require(isinstance(checked, list) and all(nonempty(s) for s in checked)
            and len(set(checked)) == len(checked)
            and set(checked) == {s for s, row in indexed.items() if row.get('status') != 'skipped'},
            'inconsistent checked sources')
    failed_ids = {s for s, row in indexed.items() if row.get('status') == 'error'}
    require(all(any(error.startswith(s + ':') for s in failed_ids) for error in errors), 'unattributed errors')
    health = collector.get('health')
    require(health in ('healthy', 'degraded', 'failed'), 'invalid health status')
    require((health == 'healthy') == (not failed_ids and not errors), 'health hides errors or invents failure')
    return indexed


def inspect_coverage(objects, evidence, args, result):
    require(isinstance(evidence, dict) and isinstance(evidence.get('coverage'), dict), 'coverage evidence missing')
    coverage = evidence['coverage']
    artifact(coverage.get('artifact'), args.repo)
    base_rows = attempt(result, 'coverage base', lambda: coverage_rows(
        objects[args.base]['public/data/meta.json'], coverage, 'base', result))
    head_rows = attempt(result, 'coverage head', lambda: coverage_rows(
        objects[args.head]['public/data/meta.json'], coverage, 'head', result))
    if base_rows is None or head_rows is None:
        return
    for source in sorted(head_rows):
        before, after = base_rows[source], head_rows[source]
        both_due = coverage['base_due'][source] and coverage['head_due'][source]
        kind = 'comparable' if both_due else 'schedule-change' if (
            coverage['base_due'][source] != coverage['head_due'][source]) else 'not-due'
        comparison = {'source_id': source, 'kind': kind,
                      'base_count': before.get('itemCount'), 'head_count': after.get('itemCount'),
                      'recovered': both_due and before.get('status') == 'error' and after.get('status') == 'success'}
        result['comparisons'].append(comparison)
        if after.get('status') == 'error':
            change = 'new failure' if before.get('status') != 'error' else 'continuing failure'
            explicit = nonempty(after.get('error'))
            result['reasons'].append(f'coverage {source}: {change}; {"explicit" if explicit else "hidden"}; human review required')
        if both_due and before.get('status') == after.get('status') == 'success':
            old, new = before.get('itemCount'), after.get('itemCount')
            if not integer(old) or not integer(new):
                result['reasons'].append(f'coverage {source}: unknown/invalid comparable counts')
            elif old > 0 and (new == 0 or (old - new) * 100 > old * 20):
                result['reasons'].append(f'coverage {source}: count drop exceeds proposed 20% or positive->zero')
            # A known zero baseline permits zero or growth; no percentage is invented.


def source_date(value):
    """Conservative subset of extract.ts parseSourceDate; never convert to UTC."""
    require(nonempty(value), 'source date missing')
    value = value.strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?', value):
        if 'T' in value:
            datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return datetime.date.fromisoformat(value[:10]).isoformat(), 'day'
    if re.fullmatch(r'\d{4}-\d{2}', value):
        return datetime.date.fromisoformat(value + '-01').isoformat(), 'month'
    if re.fullmatch(r'\d{4}', value):
        return datetime.date(int(value), 1, 1).isoformat(), 'year'
    months = {name.lower(): index for index in range(1, 13)
              for name in (calendar.month_name[index], calendar.month_abbr[index])}
    months['sept'] = 9
    match = re.fullmatch(r'(\d{1,2}) ([A-Za-z]+) (\d{4})', value)
    if match:
        day, month, year = match.groups()
        return datetime.date(int(year), months[month.lower()], int(day)).isoformat(), 'day'
    match = re.fullmatch(r'([A-Za-z]+) (\d{4})', value)
    if match:
        month, year = match.groups()
        return datetime.date(int(year), months[month.lower()], 1).isoformat(), 'month'
    match = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', value)
    if match:
        day, month, year = map(int, match.groups())
        return datetime.date(year, month, day).isoformat(), 'day'
    raise Refused('unsupported or ambiguous source date; manual review required')


def inspect_dates(objects, evidence, args, result):
    states = [objects[sha]['data/watch-state.json'] for sha in (args.base, args.head)]
    for state in states:
        require(isinstance(state, dict) and all(isinstance(state.get(key), dict)
                for key in ('seen', 'lastCheckedBySource', 'sourceSnapshots')), 'invalid watch state')
        for source, timestamp in state['lastCheckedBySource'].items():
            require(nonempty(source) and isinstance(timestamp, str), 'invalid state check timestamp')
            require(datetime.datetime.fromisoformat(str(timestamp).replace('Z', '+00:00')).tzinfo is not None,
                    'state check timestamp needs an offset')
        for source, snapshot in state['sourceSnapshots'].items():
            require(nonempty(source) and isinstance(snapshot, dict)
                    and isinstance(snapshot.get('contentHash'), str)
                    and re.fullmatch('[0-9a-f]{64}', snapshot['contentHash']), 'invalid state snapshot hash')
            require('changeCount' not in snapshot or integer(snapshot['changeCount']), 'invalid state change count')
            for field in ('firstCheckedAt', 'lastCheckedAt', 'lastChangedAt'):
                if field == 'lastChangedAt' and field not in snapshot:
                    continue
                timestamp = snapshot.get(field)
                require(isinstance(timestamp, str), 'invalid state snapshot timestamp')
                require(datetime.datetime.fromisoformat(str(timestamp).replace('Z', '+00:00')).tzinfo is not None,
                        'state snapshot timestamp needs an offset')
        for key, row in state['seen'].items():
            require(nonempty(key) and isinstance(row, dict) and nonempty(row.get('sourceId')),
                    'invalid seen candidate')
            require(row.get('status') in (None, 'pending', 'awaiting_review', 'approved',
                    'processed', 'dismissed', 'failed'), 'invalid candidate status')
            require('attempts' not in row or integer(row['attempts']), 'invalid candidate attempts')
            if 'candidate' in row:
                candidate = row['candidate']
                require(isinstance(candidate, dict) and all(isinstance(candidate.get(k), str)
                        for k in ('url', 'title', 'text')), 'invalid candidate fields')
    before, after = [state['seen'] for state in states]
    require(not set(before) - set(after), 'removed candidate facts require human review')
    changed = {key for key, row in after.items()
               if key not in before or row.get('candidate') != before[key].get('candidate')
               or row.get('sourceId') != before[key].get('sourceId')}
    dates = evidence.get('dates')
    require(isinstance(dates, list) and all(isinstance(row, dict) and nonempty(row.get('key'))
            for row in dates), 'date evidence missing')
    indexed = {row['key']: row for row in dates}
    require(len(indexed) == len(dates) and set(indexed) == changed,
            'date evidence must cover exactly new/changed candidates')
    result['date_candidates'] = sorted(changed)
    for key in sorted(changed):
        def check_date():
            row, proof = after[key], indexed[key]
            candidate = row.get('candidate')
            require(isinstance(candidate, dict), 'new/changed candidate detail absent')
            require(proof.get('source_id') == row['sourceId'] and proof.get('url') == candidate['url'],
                    'source-date evidence identity mismatch')
            text = artifact(proof.get('artifact'), args.repo).decode('utf-8')
            values = proof.get('values')
            require(isinstance(values, list) and values, 'source-date evidence absent')
            parsed = set()
            published = False
            for item in values:
                require(isinstance(item, dict) and item.get('kind') in ('published', 'updated'),
                        'fetch date or unspecified date kind forbidden')
                value = item.get('value')
                require(isinstance(value, str) and value.strip() and value in text, 'source date absent from retained text')
                parsed.add(source_date(value))
                published = published or item['kind'] == 'published'
            require(published, 'publication date evidence absent; updated-only is ambiguous')
            require(len(parsed) == 1, 'contradictory source-date evidence')
            require((candidate.get('dateHint'), candidate.get('dateHintPrecision')) == next(iter(parsed)),
                    'dateHint/precision contradict source calendar date (no UTC/fetch-date substitution)')
        attempt(result, f'date {key}', check_date)


def assess(args):
    result = {'policy_version': POLICY_VERSION, 'base': args.base, 'head': args.head,
              'changed_paths': [], 'live_action': 'none', 'reasons': [],
              'trial_eligible': False, 'run_id': None, 'run_kind': None,
              'evidence': {'path': str(args.evidence), 'sha256': None}}
    objects = attempt(result, 'git', lambda: inspect_git(args.repo, args.base, args.head, result))
    def read_evidence():
        raw = external_file(args.evidence, args.repo)
        result['evidence']['sha256'] = hashlib.sha256(raw).hexdigest()
        return strict_json(raw)
    evidence = attempt(result, 'evidence', read_evidence)
    result['comparisons'] = []
    attempt(result, 'evidence', lambda: inspect_evidence(evidence, args.repo, args.base, args.head, result))
    if objects is not None:
        attempt(result, 'coverage', lambda: inspect_coverage(objects, evidence, args, result))
        attempt(result, 'dates', lambda: inspect_dates(objects, evidence, args, result))
    result['verdict'] = 'would-escalate' if result['reasons'] else 'would-merge'
    if getattr(args, 'clef_advisory', False):
        from clef_shadow import assess as assess_clef
        result['clef_advisory'] = assess_clef(objects, evidence, args, result)
    return result


def safe_destination(path, args, inputs):
    require(path.is_absolute() and not path.resolve().is_relative_to(args.repo.resolve()),
            'output/ledger must be outside candidate checkout')
    require(not any(p.is_symlink() for p in [path, *path.parents]), 'output/ledger symlink forbidden')
    require(path.resolve() not in inputs, 'output/ledger would overwrite input evidence')
    require(path.parent.is_dir(), 'output/ledger parent must already exist')
    require(not path.exists() or path.is_file(), 'output/ledger not a regular file')


def atomic_json(path, value):
    fd, name = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def run_count(runs):
    return len({row['run_id'] for row in runs if row['trial_eligible']})


def disagreement(row):
    return any((evaluation['verdict'] == 'would-merge') != (human['decision'] == 'merged')
               for evaluation in row['evaluations'] for human in row['human_decisions'])


def validate_ledger(ledger):
    require(isinstance(ledger, dict) and type(ledger.get('schema_version')) is int
            and ledger['schema_version'] == 1 and isinstance(ledger.get('runs'), list), 'invalid ledger schema')
    keys = set()
    for row in ledger['runs']:
        require(isinstance(row, dict) and nonempty(row.get('run_id'))
                and isinstance(row.get('head'), str) and re.fullmatch('[0-9a-f]{40}', row['head']), 'invalid ledger row')
        key = (row['run_id'], row['head'])
        require(key not in keys, 'duplicate ledger run/head')
        keys.add(key)
        require(type(row.get('trial_eligible')) is bool and isinstance(row.get('evaluations'), list)
                and row['evaluations'] and isinstance(row.get('human_decisions'), list), 'invalid ledger histories')
        for evaluation in row['evaluations']:
            require(isinstance(evaluation, dict) and evaluation.get('head') == row['head']
                    and evaluation.get('run_id') == row['run_id'] and evaluation.get('live_action') == 'none'
                    and evaluation.get('verdict') in ('would-merge', 'would-escalate')
                    and isinstance(evaluation.get('reasons'), list)
                    and all(isinstance(reason, str) for reason in evaluation['reasons'])
                    and (evaluation['verdict'] == 'would-escalate') == bool(evaluation['reasons'])
                    and type(evaluation.get('trial_eligible')) is bool
                    and evaluation.get('run_kind') in ('scheduled', 'historic', 'synthetic')
                    and evaluation['trial_eligible'] == (evaluation['run_kind'] == 'scheduled')
                    and nonempty(evaluation.get('policy_version'))
                    and isinstance(evaluation.get('base'), str)
                    and re.fullmatch('[0-9a-f]{40}', evaluation['base'])
                    and isinstance(evaluation.get('evidence'), dict)
                    and nonempty(evaluation['evidence'].get('path'))
                    and Path(evaluation['evidence']['path']).is_absolute()
                    and isinstance(evaluation['evidence'].get('sha256'), str)
                    and re.fullmatch('[0-9a-f]{64}', evaluation['evidence']['sha256']), 'invalid ledger evaluation')
        require(row['trial_eligible'] == all(e['trial_eligible'] for e in row['evaluations']),
                'ledger eligibility mismatch')
        for human in row['human_decisions']:
            require(isinstance(human, dict) and human.get('decision') in ('merged', 'escalated', 'rejected')
                    and isinstance(human.get('artifact'), dict) and nonempty(human['artifact'].get('path'))
                    and isinstance(human['artifact'].get('sha256'), str)
                    and re.fullmatch('[0-9a-f]{64}', human['artifact']['sha256']), 'invalid ledger human decision')
        require(row.get('human_decision') == (row['human_decisions'][-1]['decision'] if row['human_decisions'] else 'pending')
                and row.get('disagreement') is disagreement(row), 'ledger decision mismatch')
    require(type(ledger.get('scheduled_run_count')) is int
            and ledger['scheduled_run_count'] == run_count(ledger['runs']), 'ledger scheduled count mismatch')


def update_ledger(path, result, human, args, inputs):
    safe_destination(path, args, inputs)
    lock = path.with_name(path.name + '.lock')
    safe_destination(lock, args, inputs)
    with os.fdopen(os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600), 'r+') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        ledger = strict_json(external_file(path, args.repo)) if path.exists() else {
            'schema_version': 1, 'runs': [], 'scheduled_run_count': 0}
        validate_ledger(ledger)
        require(nonempty(result['run_id']) and re.fullmatch('[0-9a-f]{40}', result['head']),
                'cannot ledger unidentified run/head; retain stdout refusal')
        row = next((row for row in ledger['runs']
                    if (row['run_id'], row['head']) == (result['run_id'], result['head'])), None)
        if row is None:
            row = {'run_id': result['run_id'], 'head': result['head'], 'evaluations': [],
                   'human_decisions': [], 'trial_eligible': result['trial_eligible']}
            ledger['runs'].append(row)
        if result not in row['evaluations']:
            row['evaluations'].append(result)
        row['trial_eligible'] = all(e['trial_eligible'] for e in row['evaluations'])
        if human is not None and human not in row['human_decisions']:
            row['human_decisions'].append(human)
        row['human_decision'] = row['human_decisions'][-1]['decision'] if row['human_decisions'] else 'pending'
        row['disagreement'] = disagreement(row)
        ledger['scheduled_run_count'] = run_count(ledger['runs'])
        validate_ledger(ledger)
        atomic_json(path, ledger)
        return row['human_decision']


def input_paths(value):
    paths = set()
    if isinstance(value, dict):
        if isinstance(value.get('path'), str):
            paths.add(Path(value['path']).resolve())
        for child in value.values():
            paths.update(input_paths(child))
    elif isinstance(value, list):
        for child in value:
            paths.update(input_paths(child))
    return paths


def write_outputs(args, result):
    inputs = {args.evidence.resolve(), Path(__file__).resolve()}
    try:
        inputs.update(input_paths(strict_json(external_file(args.evidence, args.repo))))
    except (ValueError, OSError):
        # Bad evidence is already an escalation; never reinterpret it as approval.
        pass
    human = None
    if args.human_decision != 'pending' or args.human_artifact:
        def read_human():
            require(args.ledger is not None and args.human_artifact is not None
                    and args.human_decision != 'pending', 'human decision requires ledger and artifact')
            assert args.human_artifact is not None
            raw = external_file(args.human_artifact, args.repo)
            inputs.add(args.human_artifact.resolve())
            return {'decision': args.human_decision, 'artifact': {
                'path': str(args.human_artifact), 'sha256': hashlib.sha256(raw).hexdigest()}}
        human = attempt(result, 'human', read_human)
    if args.output:
        attempt(result, 'output', lambda: safe_destination(args.output, args, inputs | (
            {args.ledger.resolve(), args.ledger.with_name(args.ledger.name + '.lock').resolve()} if args.ledger else set())))
    result['verdict'] = 'would-escalate' if result['reasons'] else 'would-merge'
    recorded_human = 'pending'
    if args.ledger:
        recorded_human = attempt(result, 'ledger', lambda: update_ledger(args.ledger, result, human, args, inputs | (
            {args.output.resolve()} if args.output else set()))) or 'pending'
    def finish_summary():
        result['verdict'] = 'would-escalate' if result['reasons'] else 'would-merge'
        safe_head = result['head'] if re.fullmatch('[0-9a-f]{40}', result['head']) else 'invalid-sha'
        result['summary'] = (f"SHADOW {result['run_id']} {safe_head} {result['verdict']} "
                             f"reasons={len(result['reasons'])} human={recorded_human} live_action=none")
    finish_summary()
    if args.output and not any(reason.startswith('output:') for reason in result['reasons']):
        attempt(result, 'output', lambda: atomic_json(args.output, result))
    finish_summary()


def main():
    parser = argparse.ArgumentParser(description='SHADOW assessor; offline by default, optional local advisory only.')
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--base', required=True)
    parser.add_argument('--head', required=True)
    parser.add_argument('--evidence', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--ledger', type=Path)
    parser.add_argument('--human-decision', choices=('pending', 'merged', 'escalated', 'rejected'), default='pending')
    parser.add_argument('--human-artifact', type=Path)
    parser.add_argument('--clef-advisory', action='store_true', help='opt-in local log-only clef-flash assessment')
    args = parser.parse_args()
    result = assess(args)
    write_outputs(args, result)
    print(json.dumps(result, sort_keys=True))
    return 0 if result['verdict'] == 'would-merge' else 1


if __name__ == '__main__':
    raise SystemExit(main())
