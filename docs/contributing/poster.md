# Build the Poster

`marketing/poster/` holds a poster for hanging up locally (#1004); how to print it is in the [User Guide](../user-guide.md#print-a-poster). This page is about changing and rebuilding it. The poster is a pixel-art scene in the logo's style with a QR code to `spieli.eu`. One template designed on A5, three languages — `poster.html?lang=de|en|sk` (default `de`); the texts are in the `TEXT` table at the bottom of the file. Open it in a browser to preview.

```bash
make poster               # rewrites marketing/poster/print/poster-<lang>-a4.pdf, -2up-a4.pdf and .png
```

Per language, `make poster` writes three files:

| File | What it is |
|---|---|
| `poster-<lang>-2up-a4.pdf` | Two posters on A4 landscape, for handing out. Laid out like the OSM Fulda Aushang sheets: each poster is cut to 137 × 194 mm (the A5 ratio, as large as fits with room for the marks), the two touch in the middle, cut marks sit outside, light hairlines run across the sheet — five cuts. The paper margin is cut away, so a printer's unprintable edge does not matter, and a printer that shrinks the page to about 97 % shrinks the marks with it (`sheet.html`). |
| `poster-<lang>-a4.pdf` | One poster filling an A4 page (`a4.html`; A4 and A5 share their ratio, so the design is only scaled). |
| `poster-<lang>.png` | The poster on its own, 150 dpi on A4, for use online. Rendered from the A4 PDF. |

Needs a Chromium (`CHROME=` to point at one), Ghostscript (`gs`) and network access, because the fonts come from Google Fonts and jsDelivr.

Chromium's PDF is flattened into one opaque 600 dpi image per page. Printers that interpret PDF themselves (e.g. a Brother inkjet over IPP) silently drop images with transparency — every pin — and Type 3 fonts; a flattened page prints the same everywhere. Check a new build with `pdfimages -list` (no `smask` rows) and `pdffonts` (empty).

The files are **committed**, so anyone can print the poster straight from the repository. After changing the template, run `make poster` and commit the outputs with it. Only rebuild them for a real change: they add about 5 MB to the history each time.

`marketing/poster/preview.png` shows all three languages side by side, for the PR and anyone browsing the folder. It is not built by `make poster`; after a visible change, regenerate it from the PNGs (`magick poster-{de,en,sk}.png -resize x900 -bordercolor white -border 20 +append ../preview.png` in `print/`).

When printing, choose **actual size / 100 %**, not "fit to page". The design keeps a white margin around its frame because inkjets cannot print borderless, and a light sky to save ink. The QR code keeps a white quiet zone of 4 modules (ISO/IEC 18004). Scan the QR code off the printout before hanging it up.

Keep the bubble to things spieli really shows. Shade, for instance, is barely mapped (12 of 473 playgrounds in Landkreis Fulda), so promising it disappoints.
