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
    """
    base = base.rstrip('/')
    changed = []

    if style.get('glyphs'):
        style['glyphs'] = f'{base}/fonts/{{fontstack}}/{{range}}.pbf'
        changed.append('glyphs')
    if style.get('sprite'):
        style['sprite'] = f'{base}/sprites/sprite'
        changed.append('sprite')

    for name, source in (style.get('sources') or {}).items():
        if source.get('url'):
            # The TileJSON that `url` points at carries minzoom/maxzoom, and
            # dropping it loses them — the client would then request z15-21
            # instead of overzooming the deepest available tile. Defaults match
            # the OpenMapTiles schema.
            source.setdefault('minzoom', 0)
            source.setdefault('maxzoom', 14)
            source.pop('url')
            source['tiles'] = [f'{base}/tiles/{name}/{{z}}/{{x}}/{{y}}.pbf']
            changed.append(f'source:{name}')
        elif source.get('tiles'):
            suffix = '.png' if source.get('type') == 'raster' else '.pbf'
            source['tiles'] = [f'{base}/tiles/{name}/{{z}}/{{x}}/{{y}}{suffix}']
            changed.append(f'source:{name}')

    return changed


def build(source, out, asset_base=None):
    if source.startswith(('http://', 'https://')):
        req = urllib.request.Request(source, headers={'User-Agent': 'spieli-style-build'})
        with urllib.request.urlopen(req, timeout=30) as fh:
            style = json.load(fh)
    else:
        with open(source, encoding='utf-8') as fh:
            style = json.load(fh)

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
    style['metadata'] = dict(style.get('metadata') or {}, **{
        'spieli:source': source,
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
    args = ap.parse_args()
    return build(args.source, args.out, args.asset_base)


if __name__ == '__main__':
    raise SystemExit(main())
