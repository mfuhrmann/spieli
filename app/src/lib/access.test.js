import assert from 'node:assert/strict';
import { accessKind, isRestrictedAccess } from './access.js';

assert.equal(accessKind({ access: 'private' }), 'private');
assert.equal(accessKind({ access: 'no' }), 'private');
assert.equal(accessKind({ access: 'customers' }), 'customers');
for (const access of ['yes', 'permissive', 'destination', '', undefined, null]) {
    assert.equal(accessKind({ access }), 'public', String(access));
}
assert.equal(accessKind(null), 'public');
assert.equal(accessKind({}), 'public');

assert.equal(isRestrictedAccess({ access: 'customers' }), true);
assert.equal(isRestrictedAccess({ access: 'no' }), true);
assert.equal(isRestrictedAccess({ access: 'yes' }), false);

console.log('access tests passed');
