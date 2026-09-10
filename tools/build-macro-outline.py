#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 spieli contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Build the macro-tier world outline from Natural Earth 1:110m.

The hub's macro tier (zoom <= macroMaxZoom, default 7) draws one ring per
backend at its bbox centroid. It needs just enough geography to read as "this
is Germany", not street detail — and the basemap tileset covers only the
federation's own countries, so everything outside them would otherwise be
blank. This outline fills that in with no network request to anyone.

Natural Earth is public domain (https://www.naturalearthdata.com/about/terms-of-use/).

The source file is ~840 KB, which is far more than the macro tier can use. All
properties are dropped (only geometry is drawn) and coordinates are rounded to
2 decimal places — about 1.1 km, roughly one pixel at z7, so the reduction is
invisible at the zooms this layer is shown at.

Usage:
    tools/build-macro-outline.py [--out PATH] [--precision N]
"""
import argparse
import json
import os
import urllib.request

SOURCE = ('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
          'master/geojson/ne_110m_admin_0_countries.geojson')
DEFAULT_OUT = 'app/public/basemap/world-110m.json'


def dedupe(ring):
    """Drop consecutive duplicate points left behind by rounding."""
    if not ring:
        return ring
    out = [ring[0]]
    for point in ring[1:]:
        if point != out[-1]:
            out.append(point)
    if len(out) < 4:
        return ring          # too degenerate to simplify; keep the original
    if out[0] != out[-1]:
        out.append(out[0])   # rings must stay closed
    return out


def reduce_geometry(geom, precision):
    def ring(coords):
        # Positions may carry a third (elevation) ordinate; only x/y are drawn,
        # so take the first two rather than unpacking a fixed pair.
        return dedupe([[round(p[0], precision), round(p[1], precision)] for p in coords])

    if not geom:
        return None
    if geom['type'] == 'GeometryCollection':
        reduced = [reduce_geometry(g, precision) for g in geom.get('geometries', [])]
        return {'type': 'GeometryCollection',
                'geometries': [g for g in reduced if g]}
    if geom['type'] == 'Polygon':
        return {'type': 'Polygon',
                'coordinates': [ring(r) for r in geom['coordinates']]}
    if geom['type'] == 'MultiPolygon':
        return {'type': 'MultiPolygon',
                'coordinates': [[ring(r) for r in poly] for poly in geom['coordinates']]}
    return geom


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--precision', type=int, default=2,
                    help='decimal places to keep (default: 2, about 1.1 km)')
    ap.add_argument('--source', default=SOURCE)
    args = ap.parse_args()

    req = urllib.request.Request(args.source, headers={'User-Agent': 'spieli-build'})
    with urllib.request.urlopen(req, timeout=60) as fh:
        data = json.load(fh)

    features = []
    skipped = 0
    for f in data['features']:
        geom = reduce_geometry(f.get('geometry'), args.precision)
        if not geom:
            skipped += 1
            continue
        features.append({'type': 'Feature', 'properties': {}, 'geometry': geom})

    out = {'type': 'FeatureCollection', 'features': features}
    text = json.dumps(out, separators=(',', ':'))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as fh:
        fh.write(text)

    print(f'{args.source}\n  -> {args.out}')
    print(f'  features: {len(features)}'
          + (f' ({skipped} skipped: no usable geometry)' if skipped else ''))
    print(f'  size: {len(text) / 1024:.0f} KB at {args.precision} decimal places')


if __name__ == '__main__':
    raise SystemExit(main())
