#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 spieli contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Vendor the webfonts the basemap style needs, so no third party is contacted.

`ol-mapbox-style` does not fetch a style's `glyphs` endpoint. It resolves text
through a *webfonts CSS template*, which defaults to `cdn.jsdelivr.net` — so a
vector basemap silently adds a third-party host to every page load, which is
the leak the whole basemap effort exists to remove. Pointing the template at a
same-origin path only helps if something is actually served there; otherwise
every font stack in the style 404s and all labels fall back to a system font.

This downloads the @fontsource CSS and woff2 files for the weights the style
asks for, rewrites the CSS to reference the local copies, and writes the lot
under app/public/basemap/fonts/{family}/{weight}.css — matching the template in
Map.svelte.

Fonts are OFL-licensed (Noto Sans and friends); the licence is fetched
alongside them so the vendored copy carries its own terms.

Usage:
    tools/build-basemap-fonts.py [--out DIR] [--font noto-sans:400,400-italic]
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

CDN = 'https://cdn.jsdelivr.net/npm/@fontsource'
DEFAULT_OUT = 'app/public/basemap/fonts'
# What the vendored Bright style asks for: its text-font stacks are
# "Noto Sans Regular", "Noto Sans Bold" and "Noto Sans Italic", which
# ol-mapbox-style resolves to weights 400, 700 and 400-italic (700-italic
# covers a bold-italic stack being added upstream). Kept explicit rather than
# parsed out of the style: the mapping from a style's font stacks to
# @fontsource package names is not mechanical, and a wrong guess fails silently
# as a 404 and a system-font fallback.
#
# Missing a weight is not cosmetic. The style's stacks are checked against this
# list by `make basemap-fonts` (see check_style_coverage below), because an
# absent weight renders as a system font AND, once /basemap/ falls through to
# the tile server, turns every page load into an upstream request for a file
# that does not exist there either.
DEFAULT_FONTS = 'noto-sans:400,400-italic,700,700-italic'
# Style font-stack suffix -> the @fontsource weight file that satisfies it.
STACK_WEIGHTS = {
    'Regular': '400',
    'Italic': '400-italic',
    'Bold': '700',
    'Bold Italic': '700-italic',
}
DEFAULT_STYLE = 'app/public/basemap/style.local.json'
# Subsets that cover the federation's languages (de, cs, sk) plus the UI's
# other locales. Everything else is dropped to keep the payload small.
KEEP_SUBSETS = ('latin', 'latin-ext')


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'spieli-fonts-build'})
    with urllib.request.urlopen(req, timeout=60) as fh:
        data = fh.read()
    return data if binary else data.decode('utf-8')


SUBSET_RE = re.compile(r'-(' + '|'.join(KEEP_SUBSETS) + r')-\d+-(?:normal|italic)\.woff2')


def wanted_subset(block):
    """True when an @font-face block is for a subset we keep.

    Decided from the woff2 filename rather than the CSS comment: the comment is
    `{family}-{subset}-{weight}-{style}`, so a naive parse of it captures the
    whole string and matches nothing.
    """
    return bool(SUBSET_RE.search(block))


def build(out_dir, spec):
    total = 0
    for entry in spec.split():
        family, _, weights = entry.partition(':')
        for weight in (weights or '400').split(','):
            css_url = f'{CDN}/{family}/{weight}.css'
            try:
                css = fetch(css_url)
            except urllib.error.HTTPError as exc:
                print(f'  ERROR {css_url} -> HTTP {exc.code}', file=sys.stderr)
                return 1

            dest = os.path.join(out_dir, family)
            os.makedirs(dest, exist_ok=True)

            blocks = re.split(r'(?=/\*\s*[a-z0-9-]+\s*\*/)', css)
            kept, files = [], 0
            for block in blocks:
                if '@font-face' not in block:
                    continue
                if not wanted_subset(block):
                    continue
                # @fontsource CSS references files relatively (./files/x.woff2),
                # so resolve against the CSS URL before downloading.
                base = css_url.rsplit('/', 1)[0]
                for rel in re.findall(r"url\((\.\/[^)]+\.woff2)\)", block):
                    name = rel.rsplit('/', 1)[-1]
                    with open(os.path.join(dest, name), 'wb') as fh:
                        fh.write(fetch(f'{base}/{rel[2:]}', binary=True))
                    block = block.replace(rel, f'./{name}')
                    files += 1
                # Drop the legacy .woff fallback: it is not vendored, so leaving
                # it in src would make every browser try a URL that 404s.
                block = re.sub(r",\s*url\(\.\/[^)]+\.woff\)\s*format\('woff'\)", '', block)
                kept.append(block)

            if not kept:
                print(f'  ERROR {css_url} produced no @font-face for subsets '
                      f'{KEEP_SUBSETS}', file=sys.stderr)
                return 1

            with open(os.path.join(dest, f'{weight}.css'), 'w', encoding='utf-8') as fh:
                fh.write(''.join(kept))
            size = sum(os.path.getsize(os.path.join(dest, f))
                       for f in os.listdir(dest) if f.endswith('.woff2'))
            print(f'  {family}/{weight}.css  ({files} woff2, {size/1024:.0f} KB total)')
            total += 1

    # Carry the licence with the vendored copy.
    try:
        lic = fetch(f'{CDN}/{DEFAULT_FONTS.split(":")[0]}/LICENSE')
        with open(os.path.join(out_dir, 'LICENSE'), 'w', encoding='utf-8') as fh:
            fh.write(lic)
        print('  LICENSE')
    except Exception as exc:                       # noqa: BLE001 - best effort
        print(f'  WARNING: licence not fetched ({exc})', file=sys.stderr)

    return 0 if total else 1


def check_style_coverage(out_dir, style_path):
    """Fail if the style asks for a weight this build did not vendor.

    The failure mode without this is invisible: MapLibre falls back to a system
    font for the missing stack, the map still renders, and every visitor's
    browser quietly asks the tile server for a CSS file it has never heard of.
    """
    try:
        with open(style_path, encoding='utf-8') as fh:
            style = json.load(fh)
    except (OSError, ValueError) as exc:
        print(f'  WARNING: style coverage not checked ({exc})', file=sys.stderr)
        return 0

    stacks = set()
    for layer in style.get('layers', []):
        font = (layer.get('layout') or {}).get('text-font')
        if isinstance(font, str):
            stacks.add(font)
        elif isinstance(font, list):
            stacks.update(f for f in font if isinstance(f, str))

    missing = []
    for stack in sorted(stacks):
        # Split on the longest known variant suffix, so "Noto Sans Bold Italic"
        # yields family "Noto Sans" rather than "Noto Sans Bold". A first-space
        # split would give "Noto", which finds nothing and reports every stack
        # as missing.
        best = None
        for variant, weight in STACK_WEIGHTS.items():
            suffix = ' ' + variant
            if stack.endswith(suffix) and (best is None or len(variant) > len(best[0])):
                best = (variant, weight, stack[:-len(suffix)])
        if best is None:
            missing.append(f'{stack} (no known weight mapping)')
            continue
        _, weight, family = best
        slug = family.lower().replace(' ', '-')
        css = os.path.join(out_dir, slug, f'{weight}.css')
        if not os.path.isfile(css):
            missing.append(f'{stack} -> {slug}/{weight}.css')

    if missing:
        print('  ERROR: the style asks for font stacks with no vendored file:',
              file=sys.stderr)
        for m in missing:
            print(f'    {m}', file=sys.stderr)
        return 1
    print(f'  style coverage OK ({len(stacks)} stacks)')
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--font', default=DEFAULT_FONTS,
                    help=f'space-separated family:weights (default: {DEFAULT_FONTS})')
    ap.add_argument('--style', default=DEFAULT_STYLE,
                    help='style whose text-font stacks must be covered '
                         f'(default: {DEFAULT_STYLE})')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    print(f'-> {args.out}')
    rc = build(args.out, args.font)
    return rc or check_style_coverage(args.out, args.style)


if __name__ == '__main__':
    raise SystemExit(main())
