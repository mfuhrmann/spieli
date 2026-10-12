import assert from 'node:assert/strict';
import {
  pitchSports, pitchTitle, litInfo, accessInfo, feeInfo,
  reservationInfo, hoopsInfo, wheelchairInfo,
} from './pitchInfo.js';

// pitchSports
assert.deepEqual(pitchSports({ sport: 'soccer;basketball' }), ['soccer', 'basketball']);
assert.deepEqual(pitchSports({ sport: ' tennis ; ' }), ['tennis']);
assert.deepEqual(pitchSports({}), []);

// pitchTitle: name wins, else first sport, else generic
assert.deepEqual(pitchTitle({ name: 'Kunstrasen', sport: 'soccer' }), { name: 'Kunstrasen' });
assert.deepEqual(pitchTitle({ sport: 'basketball;soccer' }), { key: 'pitch.titles.basketball' });
assert.deepEqual(pitchTitle({ sport: 'ice_stock' }), { key: 'pitch.titles.generic' });
assert.deepEqual(pitchTitle({}), { key: 'pitch.titles.generic' });

// litInfo
assert.equal(litInfo(undefined), null);
assert.equal(litInfo(''), null);
assert.deepEqual(litInfo('yes'), { key: 'pitch.lit.yes' });
assert.deepEqual(litInfo('automatic'), { key: 'pitch.lit.yes' });
assert.deepEqual(litInfo('no'), { key: 'pitch.lit.no' });
assert.deepEqual(litInfo('limited'), { key: 'pitch.lit.limited' });
assert.deepEqual(litInfo('sunset-23:00'), { key: 'pitch.lit.times', values: { times: 'sunset–23:00' } });
assert.deepEqual(litInfo('Mo-Fr 17:00-22:00'), { key: 'pitch.lit.times', values: { times: 'Mo–Fr 17:00–22:00' } });
assert.equal(litInfo('maybe'), null, 'unrecognised value says nothing');

// accessInfo
assert.deepEqual(accessInfo({ access: 'yes' }), { key: 'pitch.access.public' });
assert.deepEqual(accessInfo({ access: 'customers' }), { key: 'pitch.access.customers' });
assert.deepEqual(accessInfo({ access: 'private' }), { key: 'pitch.access.private' });
assert.equal(accessInfo({ access: 'destination' }), null);
assert.equal(accessInfo({}), null);

// feeInfo / reservationInfo
assert.deepEqual(feeInfo({ fee: 'no' }), { key: 'pitch.fee.no' });
assert.equal(feeInfo({}), null);
assert.deepEqual(reservationInfo({ reservation: 'required' }), { key: 'pitch.reservation.required' });
assert.equal(reservationInfo({ reservation: 'no' }), null);

// hoopsInfo / wheelchairInfo
assert.deepEqual(hoopsInfo({ hoops: '2' }), { key: 'pitch.hoops', values: { count: 2 } });
assert.equal(hoopsInfo({ hoops: '0' }), null);
assert.equal(hoopsInfo({ hoops: 'many' }), null);
assert.deepEqual(wheelchairInfo({ wheelchair: 'limited' }), { key: 'pitch.wheelchair.limited' });
assert.equal(wheelchairInfo({}), null);

console.log('pitchInfo tests passed.');
