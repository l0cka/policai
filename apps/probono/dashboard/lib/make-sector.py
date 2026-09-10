#!/usr/bin/env python3
"""Trim the sector research output into the dataset the /sector page ships.

The research run's full output is checked in at docs/a2j-sector-research.json;
this drops the fields the page does not render and minifies the rest.

    python3 dashboard/lib/make-sector.py [path-to-research.json]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.path.join(HERE, '..', '..', 'docs', 'a2j-sector-research.json')

src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
dst = os.path.join(HERE, 'sector.json')

FIELDS = ('name', 'abbrev', 'tier', 'jurisdiction', 'role', 'url', 'funded_by')

d = json.load(open(src))
orgs = [{k: o.get(k, '') for k in FIELDS} for o in d['organisations']]
out = {'compiled': '2026-08-07', 'organisations': orgs, 'notes': d.get('notes', [])}
json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(orgs)} organisations -> {dst} ({os.path.getsize(dst) // 1024}KB)')
