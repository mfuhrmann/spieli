import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { objDevices } from './objPlaygroundEquipment.js';

// #1074: the server reads the area-level schema `playground:<device>=yes` only
// for catalogue devices, from public.playground_device_keys() in api.sql. That
// list mirrors objDevices; this fails when they drift apart, in either
// direction, or when the order differs (it is kept identical so a diff is
// easy to read).

const apiSql = readFileSync(fileURLToPath(new URL('../../../importer/api.sql', import.meta.url)), 'utf8');
const block = apiSql.match(/-- BEGIN device keys\n([\s\S]*?)\n\s*-- END device keys/);
assert.ok(block, 'api.sql: device keys block (BEGIN/END markers) not found');
const sqlKeys = [...block[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);

assert.deepEqual(sqlKeys, Object.keys(objDevices),
  'public.playground_device_keys() in api.sql and objDevices differ — update both');

console.log(`deviceKeysParity.test.js: ${sqlKeys.length} device keys match`);
