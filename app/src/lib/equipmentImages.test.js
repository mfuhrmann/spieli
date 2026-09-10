import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The equipment illustrations are named as MediaWiki `File:` titles in
// objPlaygroundEquipment.js and equipmentAttributes.js, and resolved to real
// file URLs at build time by tools/build-equipment-images.py.
//
// These tests guard the two failure modes that were live in production before
// #862: an illustration fetched straight from a third party, and a name that
// renders nothing without saying so.

// Set before importing, so config.js sees a proxied deployment.
globalThis.window = { APP_CONFIG: { commonsFileBase: '/ext/wikimedia' } };

const { getEquipmentAttributesFromProps } = await import('./equipmentAttributes.js');
const map = JSON.parse(readFileSync(new URL('./equipmentImages.generated.json', import.meta.url)));

const t = (key) => key;   // the translate function is only used for labels

// --- the generated map is well formed -------------------------------------
{
    assert.ok(map.images && typeof map.images === 'object');
    assert.ok(Object.keys(map.images).length > 50, 'the map should hold most of the tables');

    const HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org', 'wiki.openstreetmap.org']);
    for (const [title, entry] of Object.entries(map.images)) {
        assert.ok(title.startsWith('File:'), `not a File: title: ${title}`);
        assert.ok(HOSTS.has(entry.host), `unexpected host for ${title}: ${entry.host}`);
        assert.ok(entry.path.startsWith('/'), `path must be absolute: ${title}`);
        // utm_* campaign parameters are Commons' own analytics tags. The build
        // strips them so they do not end up in our cache key.
        assert.ok(!entry.path.includes('utm_'), `campaign params survived: ${title}`);
    }
}

// --- no illustration is ever fetched from a third party --------------------
// Rendered HTML for every device in the tables must contain no absolute URL.
// This is the assertion that would have caught the Special:FilePath fetch.
{
    const { objDevices } = await import('./objPlaygroundEquipment.js');
    let rendered = 0;
    for (const [key, device] of Object.entries(objDevices)) {
        if (!device.image) continue;
        const out = getEquipmentAttributesFromProps({ playground: key, osm_type: 'N', osm_id: '1' }, t);
        if (!out.html.includes('<img')) continue;   // unresolvable name: renders nothing
        rendered++;
        assert.ok(out.html.includes('src="/ext/wikimedia/'),
                  `${key} does not route through the proxy: ${out.html.slice(0, 160)}`);
        assert.ok(!/src="https?:\/\//.test(out.html),
                  `${key} renders an absolute URL: ${out.html.slice(0, 160)}`);
        assert.ok(!out.html.includes('Special:FilePath'),
                  `${key} still uses the redirect chain`);
        // The onerror fallback used to reach wiki.openstreetmap.org from the
        // browser with nothing disclosing it.
        assert.ok(!out.html.includes('onerror'), `${key} still carries an onerror fallback`);
        assert.ok(out.html.includes('referrerpolicy="no-referrer"'),
                  `${key} sends a Referer`);
    }
    assert.ok(rendered > 30, `expected many illustrations to render, got ${rendered}`);
}

// --- an unresolvable name renders nothing, rather than a broken image ------
{
    const { objDevices } = await import('./objPlaygroundEquipment.js');
    // Pick a device whose image is in the tables but not in the generated map:
    // those are the names that resolve on neither wiki.
    const orphan = Object.entries(objDevices)
        .find(([, d]) => d.image && !map.images[d.image]);
    if (orphan) {
        const out = getEquipmentAttributesFromProps(
            { playground: orphan[0], osm_type: 'N', osm_id: '1' }, t);
        assert.ok(!out.html.includes('<img'),
                  `${orphan[0]} should render no image at all, got: ${out.html.slice(0, 120)}`);
    }
}

console.log('equipmentImages.test.js: all assertions passed');
