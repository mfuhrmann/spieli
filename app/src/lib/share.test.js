import assert from 'node:assert/strict';
import { shareOrCopy, copyText } from './share.js';

const data = { title: 'Am Lagerfeld', url: 'https://spieli.eu/#W24871471' };

function env({ share, clipboard = true, execOk = true } = {}) {
  const log = { shared: [], copied: [] };
  const nav = {
    ...(share ? { share: async (d) => share(d, log) } : {}),
    ...(clipboard ? { clipboard: { writeText: async (t) => { log.copied.push(t); } } } : {}),
  };
  const doc = {
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, select() {} }),
    execCommand: () => { if (execOk) log.copied.push('exec'); return execOk; },
  };
  return { nav, doc, log };
}

// phone with a working share sheet → shared, nothing copied
{
  const e = env({ share: (d, log) => { log.shared.push(d); } });
  assert.equal(await shareOrCopy(data, { mobile: true, ...e }), 'shared');
  assert.deepEqual(e.log.shared, [data]);
  assert.deepEqual(e.log.copied, []);
}
// phone, visitor cancels → cancelled, no copy behind their back
{
  const e = env({ share: () => { const err = new Error('x'); err.name = 'AbortError'; throw err; } });
  assert.equal(await shareOrCopy(data, { mobile: true, ...e }), 'cancelled');
  assert.deepEqual(e.log.copied, []);
}
// phone, browser rejects the share (Firefox Android) → copied instead
{
  const e = env({ share: () => { const err = new Error('x'); err.name = 'NotAllowedError'; throw err; } });
  assert.equal(await shareOrCopy(data, { mobile: true, ...e }), 'copied');
  assert.deepEqual(e.log.copied, [data.url]);
}
// phone without share support → copied
{
  const e = env();
  assert.equal(await shareOrCopy(data, { mobile: true, ...e }), 'copied');
}
// desktop never opens the share sheet, even where it exists
{
  const e = env({ share: (d, log) => { log.shared.push(d); } });
  assert.equal(await shareOrCopy(data, { mobile: false, ...e }), 'copied');
  assert.deepEqual(e.log.shared, []);
  assert.deepEqual(e.log.copied, [data.url]);
}
// no clipboard API → textarea fallback; both failing → failed
{
  const e = env({ clipboard: false });
  assert.equal(await copyText('x', e), true);
  assert.deepEqual(e.log.copied, ['exec']);
  const f = env({ clipboard: false, execOk: false });
  assert.equal(await shareOrCopy(data, { mobile: false, ...f }), 'failed');
}

console.log('share.test.js: all assertions passed');
