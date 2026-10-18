#!/usr/bin/env python3
"""Render the printable poster (marketing/poster/) to PDF.

For every language the template knows, writes two files to
marketing/poster/print/ (committed, so people can print without building):

  poster-<lang>-a5.pdf       one A5 poster
  poster-<lang>-2xa5-a4.pdf  two A5 posters on one A4 sheet, with a cut line

Rendering uses a headless Chromium. The poster loads its webfonts from
Google Fonts and jsDelivr, so this needs network access; the virtual-time budget gives
them time to arrive before the page is printed.

Chromium's PDF is then flattened by Ghostscript into one opaque 600 dpi
image per page. Printers that interpret PDF in firmware (a Brother inkjet
over IPP, for one) silently drop images with an alpha soft mask (every
pin) and Type 3 fonts; a page with no transparency and no fonts prints
the same everywhere.

Usage: python3 tools/build-poster.py [--lang de,en,sk]
       CHROME=/path/to/chrome python3 tools/build-poster.py
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTER_DIR = ROOT / 'marketing' / 'poster'
OUT_DIR = POSTER_DIR / 'print'
LANGS = ['de', 'en', 'sk']
BROWSERS = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']


def find_browser():
    if os.environ.get('CHROME'):
        return os.environ['CHROME']
    for name in BROWSERS:
        path = shutil.which(name)
        if path:
            return path
    sys.exit('No Chromium found. Install chromium or set CHROME=/path/to/chrome.')


def find_ghostscript():
    path = shutil.which('gs')
    if not path:
        sys.exit('No Ghostscript found. Install ghostscript (gs).')
    return path


def render(browser, gs, page, lang, out):
    url = (POSTER_DIR / page).as_uri() + f'?lang={lang}'
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / 'raw.pdf'
        subprocess.run(
            [browser, '--headless', '--disable-gpu', '--no-pdf-header-footer',
             '--virtual-time-budget=10000', f'--print-to-pdf={raw}', url],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        if not raw.exists() or raw.stat().st_size == 0:
            sys.exit(f'Rendering {page} ({lang}) produced no PDF.')
        # PDF 1.3 has no transparency, so pdfwrite renders each page to an image.
        subprocess.run(
            [gs, '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pdfwrite',
             '-dCompatibilityLevel=1.3', '-dHaveTransparency=false', '-r600',
             f'-sOutputFile={out}', str(raw)],
            check=True, timeout=300)
    print(f'  {out.relative_to(ROOT)}')


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--lang', default=','.join(LANGS),
                        help='comma-separated languages (default: %(default)s)')
    args = parser.parse_args()
    langs = [lang.strip() for lang in args.lang.split(',') if lang.strip()]
    unknown = set(langs) - set(LANGS)
    if unknown:
        sys.exit(f'Unknown language(s): {", ".join(sorted(unknown))}. Known: {", ".join(LANGS)}.')

    browser = find_browser()
    gs = find_ghostscript()
    OUT_DIR.mkdir(exist_ok=True)
    for lang in langs:
        render(browser, gs, 'poster.html', lang, OUT_DIR / f'poster-{lang}-a5.pdf')
        render(browser, gs, 'sheet.html', lang, OUT_DIR / f'poster-{lang}-2xa5-a4.pdf')


if __name__ == '__main__':
    main()
