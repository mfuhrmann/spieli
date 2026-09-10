#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 spieli contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Resolve the equipment illustrations' `File:` names to real file URLs.

The device and pitch tables name their illustrations as MediaWiki `File:` titles
(`objPlaygroundEquipment.js`, `equipmentAttributes.js`). Until now the frontend
turned each name into a `Special:FilePath` URL and let the browser follow the
redirect chain, which meant:

* the visitor's browser contacted `commons.wikimedia.org` directly, and
* on a 404 it then contacted `wiki.openstreetmap.org` through an `onerror`
  fallback — a host that appeared in neither the privacy page nor the CSP, and
* for names that exist on neither wiki, it made two failing requests and hid
  the result with `style.display='none'`.

`Special:FilePath` cannot be proxied without allowing `/w/index.php` through
the cache, which is a full MediaWiki entry point and far too large a relay
surface. So the redirect is followed HERE, at build time, once. The frontend
gets a committed map of real file URLs and routes them through the existing
`/ext/wikimedia/` proxy, so no request leaves the visitor's browser.

Resolving at build time has a second effect worth having: a name that resolves
nowhere fails the build instead of silently rendering nothing.

Usage:
    tools/build-equipment-images.py            # rewrite the generated map
    tools/build-equipment-images.py --check    # fail if it is out of date
"""
import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

DEVICES = 'app/src/lib/objPlaygroundEquipment.js'
ATTRS = 'app/src/lib/equipmentAttributes.js'
OUT = 'app/src/lib/equipmentImages.generated.json'

# Commons first, then the OSM wiki. Order matters: several names exist on both,
# and Commons is the better-maintained copy.
WIKIS = [
    ('commons', 'https://commons.wikimedia.org/w/api.php'),
    ('osm', 'https://wiki.openstreetmap.org/w/api.php'),
]

UA = 'spieli-build/1 (+https://github.com/mfuhrmann/spieli)'

# Width REQUESTED from the API, matching the ?width=800 the old
# Special:FilePath URLs used. MediaWiki buckets thumbnails, so what comes back
# is the next size up (960px in practice) — which is why the generated file
# records no width field: it would describe the request, not the URLs stored.
THUMB_WIDTH = 800

# Names that resolve on neither wiki. Every one of these is a pitch
# illustration, and every one has been silently broken in production — the
# browser made two failing requests and the onerror handler hid the element.
#
# Listed explicitly rather than tolerated by a blanket "skip failures", so that
# a *new* unresolvable name fails the build instead of joining them quietly.
# Tracked as a data bug; remove entries from this list as they are fixed or
# replaced upstream, and delete the list when it is empty.
KNOWN_MISSING = {
    'File:Association football pitch imperial.svg',
    'File:BMX track Canberra.jpg',
    'File:Badminton court 8shuttle.svg',
    'File:Basketball court dimensions in meters.svg',
    'File:BeachvolleyballAthens04.jpg',
    'File:Boules-coloured.jpg',
    'File:Field Hockey Pitch Dimensions.svg',
    'File:Handball court metric.svg',
    'File:Hard tennis court 1.jpg',
    'File:Multi-use games area.jpg',
    'File:Outdoor bouldering wall.jpg',
    'File:Skatepark Vienna Praterstern 2015.jpg',
    'File:Table tennis table blue.jpg',
    'File:Volleyball court with dimensions.svg',
}


def file_names():
    """Every `File:` title the two tables reference.

    The device table is scanned with a pattern that tolerates an escaped
    apostrophe inside a single-quoted JS string. Without that, a name like
    `File:At children\\'s playground.jpg` is truncated at the apostrophe and
    then reported as missing — which is exactly what happened while
    investigating this.
    """
    names = set()
    src = open(DEVICES, encoding='utf-8').read()
    for a, b in re.findall(r"image:\s*'((?:[^'\\]|\\.)*)'|image:\s*\"([^\"]*)\"", src):
        names.add((a or b).replace("\\'", "'"))
    src = open(ATTRS, encoding='utf-8').read()
    for m in re.findall(r"'((?:File:(?:[^'\\]|\\.)*))'", src):
        names.add(m.replace("\\'", "'"))
    return sorted(n for n in names if n.startswith('File:'))


def query(api, titles):
    """imageinfo for up to 50 titles, keyed by the INPUT title.

    MediaWiki normalises titles (underscores to spaces, first letter
    capitalised) and answers under the normalised name, so the `normalized`
    mapping has to be followed or a name written `File:playground_trampoline.jpg`
    looks missing when it is not.
    """
    params = {
        'action': 'query',
        'titles': '|'.join(titles),
        'prop': 'imageinfo',
        'iiprop': 'url|extmetadata',
        'iiurlwidth': str(THUMB_WIDTH),
        'format': 'json',
        'formatversion': '1',
    }
    req = urllib.request.Request(api + '?' + urllib.parse.urlencode(params),
                                 headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as fh:
        data = json.load(fh)
    # Raise rather than fall through. An API error or a rate-limit response
    # otherwise leaves the whole batch unresolved, which is then reported as
    # "these File: names resolve on neither wiki" — sending the maintainer to
    # the tables when the real cause was somebody else's outage.
    if 'error' in data:
        raise RuntimeError(f'{api}: {data["error"].get("code")}: {data["error"].get("info")}')
    if 'warnings' in data:
        print(f'  !!  {api} warned: {json.dumps(data["warnings"])[:200]}', file=sys.stderr)
    q = data.get('query', {})
    norm = {n['from']: n['to'] for n in q.get('normalized', [])}
    by_title = {}
    for page in q.get('pages', {}).values():
        info = (page.get('imageinfo') or [None])[0]
        if info:
            by_title[page['title']] = info
    return {t: by_title[norm.get(t, t)] for t in titles if norm.get(t, t) in by_title}


def strip_html(value):
    """Plain text from a MediaWiki HTML metadata field.

    Entities are decoded here because the frontend runs escapeHtml over the
    result: without this, an Artist value of "Foo &amp;amp; Bar" — common on
    Commons — renders as the literal "&amp;amp;".
    """
    if not value:
        return None
    text = re.sub(r'<[^>]*>', ' ', value)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text or None


def resolve(names):
    resolved, pending = {}, list(names)
    for _label, api in WIKIS:
        if not pending:
            break
        still = []
        for i in range(0, len(pending), 45):
            batch = pending[i:i + 45]
            found = query(api, batch)
            for title in batch:
                info = found.get(title)
                if not info:
                    still.append(title)
                    continue
                url = info.get('thumburl') or info.get('url')
                parsed = urllib.parse.urlparse(url)
                # Commons appends utm_source/utm_campaign/utm_content to the
                # URLs it hands out. They are its own campaign tracking, the
                # file server ignores them, and forwarding them would put a
                # third party's analytics tags in our cache key. Dropped.
                kept = [(k, v) for k, v in urllib.parse.parse_qsl(parsed.query)
                        if not k.startswith('utm_')]
                meta = info.get('extmetadata', {}) or {}
                resolved[title] = {
                    # Host and path are stored separately because the proxy
                    # path is /ext/wikimedia/<host>/<path> — the host is data,
                    # not an assumption, exactly as for the photo gallery.
                    'host': parsed.hostname,
                    'path': parsed.path + (('?' + urllib.parse.urlencode(kept)) if kept else ''),
                    'license': strip_html((meta.get('LicenseShortName') or {}).get('value')),
                    'artist': strip_html((meta.get('Artist') or {}).get('value')),
                    # The file page. CC BY/BY-SA want the source identified and
                    # the licence linked where practicable, and this is
                    # available even on the OSM wiki, which returns no
                    # extmetadata at all — so its 14 files can still credit a
                    # source even without a licence name.
                    'source': info.get('descriptionurl') or None,
                }
            time.sleep(1)   # be a polite API client
        pending = still
    return resolved, pending


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='fail if the committed map differs from a fresh resolve')
    args = ap.parse_args()

    names = file_names()
    print(f'  ..  {len(names)} File: names referenced by the equipment tables')

    resolved, unresolved = resolve(names)
    unexpected = sorted(set(unresolved) - KNOWN_MISSING)
    stale = sorted(KNOWN_MISSING - set(unresolved))

    print(f'  ..  resolved {len(resolved)}, unresolved {len(unresolved)}')

    if unexpected:
        print('\nERROR: these File: names resolve on neither Commons nor the OSM wiki:',
              file=sys.stderr)
        for n in unexpected:
            print(f'    {n}', file=sys.stderr)
        print('\n  Fix the name in the table, or add it to KNOWN_MISSING in this '
              'script with a reason. A name that renders nothing should not do '
              'so silently.', file=sys.stderr)
        return 1

    if stale:
        print('\nERROR: these names are in KNOWN_MISSING but now resolve:', file=sys.stderr)
        for n in stale:
            print(f'    {n}', file=sys.stderr)
        print('\n  Remove them from KNOWN_MISSING — the list is meant to shrink.',
              file=sys.stderr)
        return 1

    payload = {
        '_comment': ('Generated by tools/build-equipment-images.py — do not edit. '
                     'Rebuild with `make equipment-images`.'),
        'images': dict(sorted(resolved.items())),
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + '\n'

    if args.check:
        # Only host and path are compared. artist/license/source come from
        # extmetadata, which any Commons editor can change at any moment, so a
        # byte-for-byte comparison would fail as "out of date" for reasons that
        # have nothing to do with which file is served — and a gate that cries
        # wolf is one nobody wires into CI.
        def stable(images):
            return {k: (v['host'], v['path']) for k, v in images.items()}
        try:
            current = json.load(open(OUT, encoding='utf-8'))
        except (OSError, ValueError):
            print('\nERROR: %s is missing or unreadable. Run `make equipment-images`.' % OUT,
                  file=sys.stderr)
            return 1
        if stable(current.get('images', {})) != stable(payload['images']):
            print('\nERROR: %s no longer matches the wikis. Run `make equipment-images`.' % OUT,
                  file=sys.stderr)
            return 1
        print('  ok  %s still resolves to the same files' % OUT)
        return 0

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(text)
    hosts = sorted({v['host'] for v in resolved.values()})
    print(f'  ok  wrote {OUT} ({len(resolved)} images, hosts: {", ".join(hosts)})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
