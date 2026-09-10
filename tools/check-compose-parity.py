#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 spieli contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fail if compose.prod.yml does not pass on every variable compose.yml does.

`install.sh` downloads compose.prod.yml as the operator's compose.yml, so a
variable that exists only in the development file is documented, accepted in
`.env`, and silently dropped on every production install. The container never
sees it and nothing is logged.

That is not hypothetical: seven BASEMAP_* variables drifted this way, which made
`BASEMAP_ATTRIBUTION` — a licence obligation whose absence the entrypoint is
built to refuse — unreachable in production, because the entrypoint cannot fail
closed on a variable it is never handed.

The invariant is one-directional. Production may pass MORE than development
(HUB_POLL_INTERVAL does), because the deployment shapes genuinely differ. It may
not pass less.

Usage:
    tools/check-compose-parity.py [--dev compose.yml] [--prod compose.prod.yml]
"""
import argparse
import sys

import yaml

# Services present in both files whose environment must not drift. Other
# services (db, importer, postgrest) differ by design between the two.
SHARED_SERVICES = ('app',)


def env_keys(path, service):
    with open(path, encoding='utf-8') as fh:
        doc = yaml.safe_load(fh)
    svc = (doc.get('services') or {}).get(service)
    if svc is None:
        return None
    env = svc.get('environment') or {}
    # Compose accepts either a mapping or a KEY=value list.
    if isinstance(env, list):
        return {item.split('=', 1)[0] for item in env}
    return set(env)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dev', default='compose.yml')
    ap.add_argument('--prod', default='compose.prod.yml')
    args = ap.parse_args()

    failed = False
    for service in SHARED_SERVICES:
        dev = env_keys(args.dev, service)
        prod = env_keys(args.prod, service)
        if dev is None:
            print(f'ERROR: {args.dev} has no "{service}" service', file=sys.stderr)
            return 1
        if prod is None:
            print(f'ERROR: {args.prod} has no "{service}" service', file=sys.stderr)
            return 1

        missing = sorted(dev - prod)
        if missing:
            failed = True
            print(f'ERROR: {args.prod} "{service}" does not pass on variables that '
                  f'{args.dev} does:', file=sys.stderr)
            for key in missing:
                print(f'    {key}', file=sys.stderr)
            print(f'  install.sh ships {args.prod} as the operator\'s compose.yml, so '
                  'these are silently dropped on every production install.',
                  file=sys.stderr)
        else:
            extra = sorted(prod - dev)
            note = f' ({len(extra)} prod-only: {", ".join(extra)})' if extra else ''
            print(f'  ok  {service}: {len(dev)} variables reach production{note}')

    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
