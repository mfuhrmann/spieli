import assert from 'node:assert/strict';
import { isSafeImageUrl, commonsFileFromUrl, parseCommonsTag, commonsPageUrl, stripHtml } from './commons.js';

// --- isSafeImageUrl: only https Wikimedia URLs pointing at an actual image ---
{
    assert.equal(isSafeImageUrl('https://upload.wikimedia.org/x/y.jpg'), true);
    assert.equal(isSafeImageUrl('https://de.wikipedia.org/x.jpg'), true);
    // Commons *page* URLs are HTML, not images — reject even though they end .jpg
    assert.equal(isSafeImageUrl('https://commons.wikimedia.org/wiki/File:Foo.jpg'), false);
    assert.equal(isSafeImageUrl('https://commons.wikimedia.org/wiki/Special:FilePath/a.jpg'), false);
    // non-image path on a wiki host → reject
    assert.equal(isSafeImageUrl('https://commons.wikimedia.org/something'), false);
    // plain http → mixed content, reject
    assert.equal(isSafeImageUrl('http://upload.wikimedia.org/x.jpg'), false);
    // external host → reject (hotlinking, unknown license)
    assert.equal(isSafeImageUrl('https://example.com/x.jpg'), false);
    // host-suffix spoofing must not pass
    assert.equal(isSafeImageUrl('https://wikimedia.org.evil.com/x.jpg'), false);
    assert.equal(isSafeImageUrl(''), false);
    assert.equal(isSafeImageUrl(null), false);
    assert.equal(isSafeImageUrl('not a url'), false);
}

// --- commonsFileFromUrl: extract a File: title from a Commons page URL ---
{
    assert.equal(
        commonsFileFromUrl('https://commons.wikimedia.org/wiki/File:Hustenbach_H%C3%BCtte.jpg'),
        'File:Hustenbach_Hütte.jpg',
    );
    assert.equal(
        commonsFileFromUrl('https://commons.wikimedia.org/wiki/Special:FilePath/Foo.jpg'),
        'File:Foo.jpg',
    );
    // direct image / external / junk → null (handled elsewhere or dropped)
    assert.equal(commonsFileFromUrl('https://upload.wikimedia.org/x/y.jpg'), null);
    assert.equal(commonsFileFromUrl('https://example.com/wiki/File:Foo.jpg'), null);
    assert.equal(commonsFileFromUrl('http://commons.wikimedia.org/wiki/File:Foo.jpg'), null);
    assert.equal(commonsFileFromUrl(null), null);
}

// --- parseCommonsTag: Category / File / bare ---
{
    assert.deepEqual(parseCommonsTag('Category:Foo'), { kind: 'category', title: 'Category:Foo' });
    assert.deepEqual(parseCommonsTag('category:foo'), { kind: 'category', title: 'category:foo' });
    assert.deepEqual(parseCommonsTag('File:Bar.jpg'), { kind: 'file', title: 'File:Bar.jpg' });
    // bare value is assumed to be a file
    assert.deepEqual(parseCommonsTag('Bar.jpg'), { kind: 'file', title: 'File:Bar.jpg' });
    assert.equal(parseCommonsTag(''), null);
    assert.equal(parseCommonsTag('   '), null);
    assert.equal(parseCommonsTag(null), null);
}

// --- commonsPageUrl: builds a public Commons link ---
{
    assert.equal(
        commonsPageUrl('Category:Spielplatz Donauspiel, Deichgärten'),
        'https://commons.wikimedia.org/wiki/Category%3ASpielplatz_Donauspiel%2C_Deichg%C3%A4rten',
    );
    assert.equal(commonsPageUrl(''), null);
}

// --- stripHtml: plain-text credit from Commons HTML ---
{
    assert.equal(stripHtml('<a href="x">Jane Doe</a>'), 'Jane Doe');
    assert.equal(stripHtml('  multiple   spaces  '), 'multiple spaces');
    assert.equal(stripHtml('<span></span>'), null);
    assert.equal(stripHtml(''), null);
    assert.equal(stripHtml(null), null);
}

console.log('commons.test.js: all assertions passed');
