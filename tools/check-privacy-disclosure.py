#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 spieli contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fail if the frontend contacts a third-party host the privacy page never names.

The Datenschutzerklärung is a legal document that goes stale silently. Adding a
`fetch()` to a new service is a one-line change in a component; noticing that it
also created an undisclosed third-country transfer is not. This turns that from
something a reviewer has to remember into a build failure.

The rule is one-directional: every host the frontend can contact must appear in
`oci/app/datenschutz.template.html`. The page may name MORE than this finds (the
basemap row is generated at runtime and depends on the operator's config).

Hosts reached only by a link the visitor clicks are exempt, because nothing is
transferred until they choose to go there. That list is explicit rather than
inferred: classifying a host as link-only is a privacy judgement and belongs
somewhere a reviewer can see it.

Known limitation: this finds hosts written as literals in the source. A host
that only exists at runtime — because the URL arrives in an API response or an
OSM tag — cannot be found this way, so those are listed explicitly in
RUNTIME_DERIVED below and asserted the same way.

Usage:
    tools/check-privacy-disclosure.py
"""
import os
import re
import sys

SRC_DIR = 'app/src'
NGINX_CONF = 'oci/app/nginx.conf'

# Hosts that serve IMAGES to the browser, and so must be permitted by the CSP's
# img-src. Kept explicit and separate from the disclosure list because the two
# answer different questions: disclosure is "who is contacted", this is "who may
# send us pixels". img-src is the directive someone tightens for good reasons
# later, and a policy narrower than the app's own allowlist breaks photos
# silently — the image just never appears.
IMG_HOSTS = {
    'upload.wikimedia.org': 'Wikimedia Commons photos',
    'api.panoramax.xyz': 'Panoramax street-level thumbnails',
}
TEMPLATE = 'oci/app/datenschutz.template.html'
DOCS = 'docs/reference/external-services.md'

# Reached only when the visitor clicks. No request is made until they do, so
# these need no disclosure — but the classification is a decision, so it is
# written down rather than guessed at.
LINK_ONLY = {
    'mapcomplete.org',
    'www.wikidata.org',
    'wikidata.org',
    'www.openstreetmap.org',
    'wiki.openstreetmap.org',
    'openstreetmap.org',
    'de.wikipedia.org',
    'en.wikipedia.org',
    'www.mapillary.com',
    'github.com',
    'hosted.weblate.org',
    'mfuhrmann.github.io',
    'openfreemap.org',        # attribution link only; tiles are server-side
    'www.openmaptiles.org',   # attribution link only
    'mangrove.reviews',       # the human-facing site; the API host is disclosed
    'panoramax.xyz',          # ditto
    'nominatim.openstreetmap.org.evil.com',
    'realfavicongenerator.net',
    'purl.org',
    'www.w3.org',
    'opendatacommons.org',
}

# Placeholder and fixture hosts that only appear in tests or config examples.
IGNORE_SUFFIXES = ('.example', '.example.com', '.example.org', '.invalid', '.test')
IGNORE_EXACT = {'example.com', 'example.org', 'a.example', 'wikimedia.org.evil.com'}

# Contacted at runtime from data rather than from a literal in the source, so
# the scan below cannot see them. Each entry needs a reason.
RUNTIME_DERIVED = {
    # Image URLs come from the Commons API response and from OSM `image` tags,
    # so the host never appears as a literal outside tests.
    'upload.wikimedia.org': 'image URLs returned by the Commons API / OSM tags',
}

HOST_RE = re.compile(r'https?://([A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,})')


def source_files():
    for root, _dirs, files in os.walk(SRC_DIR):
        for name in files:
            if name.endswith('.test.js'):
                continue
            if name.endswith(('.js', '.svelte')):
                yield os.path.join(root, name)


def csp_img_src(conf_text):
    """The img-src source list from the CSP in nginx.conf, or None."""
    m = re.search(r'img-src([^;"]*)', conf_text)
    return m.group(1).split() if m else None


def host_permitted(host, sources):
    """Does a CSP source list permit this host? Handles `https:` and `*.` forms."""
    for src in sources:
        if src in ('https:', '*'):
            return True
        s = src.removeprefix('https://')
        if s == host:
            return True
        if s.startswith('*.') and (host.endswith(s[1:]) and host != s[2:]):
            return True
    return False


def check_csp():
    with open(NGINX_CONF, encoding='utf-8') as fh:
        conf = fh.read()
    sources = csp_img_src(conf)
    if sources is None:
        print(f'ERROR: no img-src found in {NGINX_CONF}', file=sys.stderr)
        return 1
    missing = [(h, why) for h, why in IMG_HOSTS.items() if not host_permitted(h, sources)]
    if missing:
        print('ERROR: the CSP img-src does not permit hosts the app loads images from.',
              file=sys.stderr)
        for h, why in missing:
            print(f'    {h}  ({why})', file=sys.stderr)
        print(f'  Current img-src: {" ".join(sources)}', file=sys.stderr)
        print('  A blocked image does not error visibly — it simply never appears.',
              file=sys.stderr)
        return 1
    print(f'  ok  img-src permits {len(IMG_HOSTS)} image host(s): '
          + ', '.join(sorted(IMG_HOSTS)))
    return 0


def main():
    found = {}
    for path in source_files():
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        for host in HOST_RE.findall(text):
            found.setdefault(host, set()).add(path)

    def ignored(host):
        return (host in IGNORE_EXACT
                or host in LINK_ONLY
                or host.endswith(IGNORE_SUFFIXES))

    must_disclose = {h: sorted(p) for h, p in found.items() if not ignored(h)}
    for host, why in RUNTIME_DERIVED.items():
        must_disclose.setdefault(host, [f'(runtime: {why})'])

    with open(TEMPLATE, encoding='utf-8') as fh:
        template = fh.read()
    with open(DOCS, encoding='utf-8') as fh:
        docs = fh.read()

    missing_template = sorted(h for h in must_disclose if h not in template)
    missing_docs = sorted(h for h in must_disclose if h not in docs)

    if missing_template or missing_docs:
        print('ERROR: the frontend contacts hosts that are not disclosed.',
              file=sys.stderr)
        for host in sorted(set(missing_template) | set(missing_docs)):
            where = []
            if host in missing_template:
                where.append(TEMPLATE)
            if host in missing_docs:
                where.append(DOCS)
            print(f'    {host}', file=sys.stderr)
            print(f'        referenced by: {", ".join(must_disclose[host])}',
                  file=sys.stderr)
            print(f'        missing from:  {", ".join(where)}', file=sys.stderr)
        print('\n  Add it to both, or — if the visitor only reaches it by '
              'clicking a link — add it to LINK_ONLY in this script with a '
              'one-line reason.', file=sys.stderr)
        return 1

    print(f'  ok  {len(must_disclose)} contacted host(s) disclosed: '
          + ', '.join(sorted(must_disclose)))
    return check_csp()


if __name__ == '__main__':
    raise SystemExit(main())
