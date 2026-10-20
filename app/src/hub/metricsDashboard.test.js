// The hub's /metrics, the bundled Grafana dashboard and the operator docs
// must name the same metrics (#1015). poll-federation.sh is the exporter;
// the placeholder in docker-entrypoint.sh writes the file before its first
// run. A metric added there without a panel, or renamed under one, would
// otherwise leave the dashboard blank without any error.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const exporters = [
  read('../../../oci/app/poll-federation.sh'),
  read('../../../oci/app/docker-entrypoint.sh'),
];
const dashboard = JSON.parse(read('../../../deploy/monitoring/grafana/dashboards/federation.json'));
const docs = read('../../../docs/ops/monitoring.md');

// Every metric the exporter declares with a HELP line.
const exported = new Set(exporters.flatMap(s => [...s.matchAll(/# HELP (spielplatz_\w+)/g)].map(m => m[1])));
assert.ok(exported.size >= 9, `expected the exporter's HELP lines, found ${[...exported]}`);

// Panels inside a collapsed row nest under the row's own `panels`; the row
// itself is a layout element, not something with data to explain.
const panels = dashboard.panels.flatMap(p => (p.type === 'row' ? p.panels ?? [] : [p]));

// Only PromQL targets have an `expr`; others (Dashboard datasource,
// expressions) reuse data and query no metric themselves.
const queried = new Set(
  panels
    .flatMap(p => p.targets ?? [])
    .flatMap(t => [...(t.expr ?? '').matchAll(/spielplatz_\w+/g)].map(m => m[0])),
);

for (const metric of exported) {
  assert.ok(queried.has(metric), `${metric} is exported but no dashboard panel queries it`);
  assert.ok(docs.includes(metric), `${metric} is exported but not documented in docs/ops/monitoring.md`);
}
for (const metric of queried) {
  assert.ok(exported.has(metric), `dashboard queries ${metric}, which the exporter does not emit`);
}

// Every panel explains itself (the ⓘ next to its title).
for (const p of panels) {
  assert.ok(p.description?.trim(), `panel "${p.title}" has no description`);
}

console.log('metricsDashboard tests passed');
