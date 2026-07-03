import assert from 'node:assert/strict';
import { isSafeImageUrl, commonsFileFromUrl, parseCommonsTag, isWikimediaImageTag, stripHtml } from './commons.js';

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

// --- isWikimediaImageTag: only what the gallery can actually render ---
{
    assert.equal(isWikimediaImageTag('https://upload.wikimedia.org/x.jpg'), true);
    assert.equal(isWikimediaImageTag('https://commons.wikimedia.org/wiki/File:X.jpg'), true);
    assert.equal(isWikimediaImageTag('https://commons.wikimedia.org/wiki/Special:FilePath/X.jpg'), true);
    assert.equal(isWikimediaImageTag('https://de.wikipedia.org/wiki/File:X.jpg'), true);
    assert.equal(isWikimediaImageTag('https://www.mapillary.com/x'), false);
    assert.equal(isWikimediaImageTag('https://example.com/x.jpg'), false);
    assert.equal(isWikimediaImageTag('https://wikimedia.org.evil.com/x.jpg'), false);
    assert.equal(isWikimediaImageTag('http://upload.wikimedia.org/x.jpg'), false);
    // /wiki/ HTML pages that resolve to no file render nothing → must not score.
    assert.equal(isWikimediaImageTag('https://commons.wikimedia.org/wiki/Category:Foo'), false);
    assert.equal(isWikimediaImageTag('https://de.wikipedia.org/wiki/Some_Article'), false);
    assert.equal(isWikimediaImageTag('https://commons.wikimedia.org/something'), false);
    assert.equal(isWikimediaImageTag(''), false);
    assert.equal(isWikimediaImageTag(null), false);
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
