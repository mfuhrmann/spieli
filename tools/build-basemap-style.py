#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 spieli contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Build spieli's vendored basemap style from an upstream MapLibre style.

spieli encodes playground data completeness entirely in hue (green / amber /
red, see app/src/lib/vectorStyles.js), so the basemap must not use that same
channel. Upstream general-purpose styles do — they paint parks and landcover
green and scatter saturated POI icons — which leaves playground polygons
competing with their own background.

This script takes an upstream style and applies two edits:

  1. Pulls saturation out of the green landcover fills, so green belongs to
     playground data rather than to parks.
  2. Drops the `poi` source-layer symbol layers, the strongest competitor for
     attention on the map.

Both are applied arithmetically rather than by hand-picked hex values, so the
result is reproducible and re-derivable when upstream changes.

Note on scope: edit 2 is a *legibility* change only. Dropping a style layer
does not reduce render cost, because the tile data is still decoded and simply
not drawn — measured, it moves render timings by nothing. Reducing decode cost
requires a thinner *tileset*, which is a separate piece of work.

Usage:
    tools/build-basemap-style.py [--source URL] [--out PATH]
                                 [--asset-base BASE] [--local-out PATH]

--asset-base rewrites the style's tile, glyph and sprite URLs onto one origin
(normally /basemap), which is what makes the browser talk only to this
instance. --local-out emits that same-origin variant alongside the upstream one
from a SINGLE fetch, so the two cannot be built from different upstreams.
"""
import argparse
import colorsys
import copy
import json
import os
import re
import sys
import urllib.request

DEFAULT_SOURCE = 'https://tiles.openfreemap.org/styles/bright'
DEFAULT_OUT = 'app/public/basemap/style.json'

# Fills carrying green, which collides with the completeness palette.
GREEN_LAYERS = {
    'park', 'landcover-wood', 'landcover-grass', 'landcover-grass-park',
    'landuse-cemetery',
}
# Symbol layers drawn from the `poi` source layer.
DROP_SOURCE_LAYERS = {'poi'}

SAT_KEEP = 0.30    # keep 30% of the original saturation
LIGHT_LIFT = 0.03  # nudge lighter so the ground stays airy

HEX_RE = re.compile(r'#[0-9a-fA-F]{3,8}\Z')
HSL_RE = re.compile(
    r'hsla?\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)\Z')


def desaturate_hex(value):
    h = value.lstrip('#')
    if len(h) in (3, 4):
        h = ''.join(c * 2 for c in h)   # #rgb / #rgba -> #rrggbb / #rrggbbaa
    if len(h) not in (6, 8):
        return value
    alpha = h[6:8]                      # preserved: dropping it turns a
                                        # translucent fill opaque
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb(hue, min(1.0, light + LIGHT_LIFT), sat * SAT_KEEP)
    return '#%02x%02x%02x%s' % (round(r * 255), round(g * 255), round(b * 255), alpha)


def desaturate(value):
    """Walk a paint value, rewriting colours wherever they appear.

    Paint properties are not always plain strings — they are frequently
    `interpolate` expressions with colours nested several levels down — so this
    recurses rather than assuming a scalar.
    """
    if isinstance(value, str):
        if HEX_RE.match(value):
            return desaturate_hex(value)
        m = HSL_RE.match(value)
        if m:
            hue, sat, light, alpha = m.group(1), float(m.group(2)), float(m.group(3)), m.group(4)
            sat *= SAT_KEEP
            light = min(100.0, light + LIGHT_LIFT * 100)
            return (f'hsla({hue},{sat:.0f}%,{light:.0f}%,{alpha})' if alpha
                    else f'hsl({hue},{sat:.0f}%,{light:.0f}%)')
        return value
    if isinstance(value, list):
        return [desaturate(v) for v in value]
    if isinstance(value, dict):
        # Legacy stop functions: {"base": 1.2, "stops": [[z, "#rrggbb"], ...]}.
        # Without this the colours inside pass through at full saturation while
        # the layer is still reported as recoloured.
        return {k: desaturate(v) for k, v in value.items()}
    return value


def rewrite_assets(style, base):
    """Point tiles, glyphs and sprites at `base` instead of the upstream host.

    A style document references three kinds of asset, and all three are fetched
    by the visitor's browser. Vendoring the style alone changes none of that:
    without this rewrite the map still contacts the upstream host for fonts and
    icons even when the tiles themselves are served locally, which quietly
    breaks any claim that no third party is contacted.

    Only the ORIGIN is stripped; the upstream path is preserved verbatim. That
    keeps the mapping 1:1 so a plain prefix proxy can serve it — inventing new
    paths here would force the proxy to reverse a mapping it cannot know.

    Note the `openmaptiles` source is a TileJSON endpoint, not a tile template.
    Rewriting its `url` is necessary but not sufficient: the document it returns
    carries absolute upstream tile URLs, so the proxy must also rewrite those in
    the response body (see the sub_filter in the generated nginx config).
    """
    base = base.rstrip('/')
    changed = []
    dropped_query = []

    def relocate(url):
        if not isinstance(url, str):
            return url, False
        # Protocol-relative (//host/path) counts as a third-party fetch just as
        # much as https://host/path, and both the rewrite and the leak check
        # used to walk straight past it.
        if url.startswith('//'):
            rest = url[2:]
        elif '://' in url:
            rest = url.split('://', 1)[1]
        else:
            return url, False
        path = rest.split('/', 1)[1] if '/' in rest else ''
        # Query strings are dropped, not carried. Rebuilding against a keyed
        # provider (--source 'https://x/style?key=...') would otherwise bake the
        # operator's API key into a committed style and hand it to every
        # browser. A key belongs server-side, re-attached by the proxy.
        head, sep, _ = path.partition('?')
        if sep:
            dropped_query.append(url)
        path = head.partition('#')[0]
        return f'{base}/{path}', True

    if style.get('glyphs'):
        style['glyphs'], ok = relocate(style['glyphs'])
        if ok:
            changed.append('glyphs')
    if style.get('sprite'):
        style['sprite'], ok = relocate(style['sprite'])
        if ok:
            changed.append('sprite')

    for name, source in (style.get('sources') or {}).items():
        if source.get('url'):
            source['url'], ok = relocate(source['url'])
            if ok:
                changed.append(f'source:{name}(tilejson)')
        elif source.get('tiles'):
            moved = [relocate(t) for t in source['tiles']]
            source['tiles'] = [u for u, _ in moved]
            if any(ok for _, ok in moved):
                changed.append(f'source:{name}')

    for url in dropped_query:
        print(f'  note: dropped the query string from {url.split("?")[0]}?… — a '
              'provider key must not be baked into a committed style',
              file=sys.stderr)

    return changed


def load_style(source):
    if source.startswith(('http://', 'https://')):
        req = urllib.request.Request(source, headers={'User-Agent': 'spieli-style-build'})
        with urllib.request.urlopen(req, timeout=30) as fh:
            return json.load(fh)
    with open(source, encoding='utf-8') as fh:
        return json.load(fh)


def build(source, out, asset_base=None, style=None):
    # `style` lets one fetch produce both variants. Fetching twice let the
    # upstream rotate between the two calls, yielding a style.json and a
    # style.local.json built from different upstreams with nothing detecting it.
    style = copy.deepcopy(style) if style is not None else load_style(source)

    before = len(style['layers'])
    kept, dropped, recoloured = [], [], []

    for layer in style['layers']:
        if layer.get('source-layer') in DROP_SOURCE_LAYERS and layer.get('type') == 'symbol':
            dropped.append(layer['id'])
            continue
        if layer['id'] in GREEN_LAYERS and 'paint' in layer:
            layer = copy.deepcopy(layer)
            for key, value in layer['paint'].items():
                if 'color' in key:
                    layer['paint'][key] = desaturate(value)
            recoloured.append(layer['id'])
        kept.append(layer)

    style['layers'] = kept
    rewritten = rewrite_assets(style, asset_base) if asset_base else []
    style['name'] = 'spieli basemap'
    # The source is recorded WITHOUT its scheme. The entrypoint decides whether
    # a style is same-origin by text-scanning it for http(s):// — provenance
    # metadata carrying a full URL reads as a third-party asset host, which made
    # the proxy refuse the very style it was meant to accept.
    style['metadata'] = dict(style.get('metadata') or {}, **{
        'spieli:source': re.sub(r'^[a-z]+://', '', source),
        'spieli:generator': 'tools/build-basemap-style.py',
    })

    # Validate BEFORE writing. Writing first means a failed rebuild has already
    # replaced the vendored style with an unedited upstream copy — green parks
    # restored, competing with the completeness palette — even though the
    # command exits non-zero.
    if not dropped and not recoloured:
        print(f'{source}\n  -> NOT WRITTEN', file=sys.stderr)
        print('  ERROR: no layers matched — upstream layer ids have probably '
              'changed. Update GREEN_LAYERS / DROP_SOURCE_LAYERS.', file=sys.stderr)
        return 1
    for wanted in sorted(GREEN_LAYERS - set(recoloured)):
        print(f'  note: {wanted} not present upstream (nothing to recolour)')

    # An --asset-base build exists to contain no third-party URL at all. Assert
    # it rather than trust it: this is the property the whole caching design
    # rests on, and a silent miss looks exactly like success.
    if asset_base:
        # The asset base's own host is not a leak when it is given as an
        # absolute origin — without this exemption the documented remediation
        # (--asset-base https://tiles.example.org) always failed, flagging the
        # operator's own origin as third-party and writing nothing.
        allowed = set()
        if '://' in asset_base:
            allowed.add(asset_base.split('://', 1)[1].split('/', 1)[0])
        blob = json.dumps(style)
        # (?:https?:)? so a protocol-relative //host reference is caught too.
        leaked = sorted({h for h in re.findall(r'(?:https?:)?//([A-Za-z0-9.:-]+)', blob)
                         if h not in allowed})
        if leaked:
            print(f'{source}\n  -> NOT WRITTEN', file=sys.stderr)
            print('  ERROR: --asset-base build still references: '
                  + ', '.join(leaked), file=sys.stderr)
            return 1

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(style, fh, separators=(',', ':'))

    print(f'{source}\n  -> {out}')
    print(f'  layers {before} -> {len(kept)}')
    print(f'  dropped ({len(dropped)}): {", ".join(dropped) or "none"}')
    print(f'  recoloured ({len(recoloured)}): {", ".join(recoloured) or "none"}')
    if asset_base:
        print(f'  assets -> {asset_base}: {", ".join(rewritten) or "none"}')
    else:
        print('  assets: upstream (tiles, glyphs and sprites are fetched from '
              f'{style.get("glyphs", "").split("/fonts")[0] or "the upstream host"} '
              'by the visitor\'s browser)')
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source', default=DEFAULT_SOURCE,
                    help=f'upstream style URL or path (default: {DEFAULT_SOURCE})')
    ap.add_argument('--out', default=DEFAULT_OUT,
                    help=f'output path (default: {DEFAULT_OUT})')
    ap.add_argument('--asset-base', default=None,
                    help='rewrite tile, glyph and sprite URLs to this origin, for '
                         'proxied or locally-served delivery (e.g. /basemap). '
                         'Omit to keep upstream URLs, which means the visitor\'s '
                         'browser contacts the upstream host directly.')
    ap.add_argument('--local-out', default=None,
                    help='also write a same-origin variant here, from the same '
                         'fetch (implies --asset-base /basemap unless given)')
    args = ap.parse_args()

    style = load_style(args.source)
    rc = build(args.source, args.out, args.asset_base, style=style)
    if rc or not args.local_out:
        return rc
    return build(args.source, args.local_out, args.asset_base or '/basemap',
                 style=style)


if __name__ == '__main__':
    raise SystemExit(main())
