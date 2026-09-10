import assert from 'node:assert/strict';

// proxiedImageUrl reads config at module load, so window.APP_CONFIG has to be
// in place BEFORE the import — hence the dynamic import rather than a static
// one, which would be hoisted above this assignment.
globalThis.window = { APP_CONFIG: { commonsFileBase: '/ext/wikimedia' } };

const { proxiedImageUrl, isSafeImageUrl } = await import('./commons.js');

// --- the point of the function: bytes come from this instance -------------
{
    assert.equal(
        proxiedImageUrl('https://upload.wikimedia.org/wikipedia/commons/a/b/Foo.jpg'),
        '/ext/wikimedia/upload.wikimedia.org/wikipedia/commons/a/b/Foo.jpg',
    );

    // The host is carried in the path, NOT assumed. The imageinfo API returns
    // thumbnails on thumb.wikimedia.org and originals on upload.wikimedia.org,
    // so a rewrite pinned to one host silently sends every thumbnail straight
    // to Wikimedia — which is what the first version of this did.
    assert.equal(
        proxiedImageUrl('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/330px-Foo.jpg'),
        '/ext/wikimedia/thumb.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/330px-Foo.jpg',
    );

    // The query string must survive: the API attaches utm_* parameters to the
    // thumbnail URLs it hands out.
    assert.equal(
        proxiedImageUrl('https://thumb.wikimedia.org/x/y.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo'),
        '/ext/wikimedia/thumb.wikimedia.org/x/y.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo',
    );
}

// --- anything that is not a Wikimedia host is left alone ------------------
// This function must never be the thing that turns an arbitrary URL into a
// same-origin path. isSafeImageUrl validates first; this re-checks anyway.
{
    for (const u of [
        'https://evil.example.com/upload.wikimedia.org/x.jpg',
        'https://upload.wikimedia.org.evil.example.com/x.jpg',
        'https://wikimedia.org.evil.example.com/x.jpg',
        'http://upload.wikimedia.org/x.jpg',   // not https -> parseUrl rejects
        'not a url',
        '',
        null,
        undefined,
    ]) {
        assert.equal(proxiedImageUrl(u), u, `must not rewrite: ${u}`);
    }
}

// --- a hostile tag cannot be laundered into a same-origin path ------------
// The ordering that matters, asserted together so a refactor that swaps it fails.
{
    const hostile = 'https://wikimedia.org.evil.example.com/x.jpg';
    assert.equal(isSafeImageUrl(hostile), false);
    assert.equal(proxiedImageUrl(hostile), hostile);
}

// The unproxied passthrough is asserted in commons.test.js instead, which runs
// with no window.APP_CONFIG at all — the module cache makes it impossible to
// re-evaluate config.js with different values inside one process.

console.log('commonsProxy.test.js: all assertions passed');
