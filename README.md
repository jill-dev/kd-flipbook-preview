# KD Auctions Flipbook System

Self-hosted replacement for FlippingBook: branded catalog pages generated from
your lot spreadsheet, viewed in a page-flip viewer that lives on your own
site, plus a matching downloadable PDF. No subscription, no FlippingBook
watermark, and view/page/click tracking wired for GA4.

This is a **standalone prototype** — it runs on your own computer for now,
not yet plugged into the live kdauctions.com site (that's the next phase,
once we're happy with the design and have access to that codebase).

## October 2026 rebuild: readability

The first version was shelved because the text was too small to read. The
cause: pages were 1000x1100 portrait with 16px text and 150px thumbnails, and
the viewer shrank each page to ~55-70% to fit a normal screen, so lot
descriptions showed at about 9-11px. What changed:

- **Landscape pages (1400x900)** shaped like a screen, so the viewer barely
  shrinks them (~84% on a 1440x900 laptop, ~100% on a 1080p monitor).
- **Lot cards, 3 across, 2 rows**: big photo with a yellow LOT # badge and a
  Bid button, and 22px description text underneath, about 18-19px on screen
  versus 11px before.
- **Nothing ever gets cut off**: generate.js measures every description with
  the real fonts and only puts two rows on a page when they fit, then sizes
  the photos to use the space. `check-pages.js` re-opens every page afterwards
  and flags anything that runs off the page.
- **Lot List & Search** in the viewer: a scrolling list of every lot with
  big text, searchable (e.g. "Mazak", "CMM", "vise"). It opens by default on
  phones, where any flipbook page is too small to read.
- **Go to lot #** box, clickable featured lots on the cover, and shareable
  links that open on a lot: `viewer/index.html?auction=logan#lot-170`
- Fonts (Montserrat + Work Sans) are now bundled in `brand/fonts/`, so pages
  look the same everywhere, including offline and in the PDF.

## See it working

1. Open a terminal in this folder (`flipbook-system/`)
2. First time only: `npm install`
3. `node serve.js`
4. Open **http://localhost:4173/viewer/index.html?auction=south-bend** in your browser

You should see a dark, gold-accented flipbook with a real KD Auctions
example (South Bend, Indiana / Winter Springs, FL) — cover page, lot pages
with photos and descriptions, and a closing page. Click the arrows, the page
thumbnails at the bottom, zoom, fullscreen, and "PDF" to download the
matching catalog PDF.

## How to make a new one

For a new auction, you need three things in a new folder under `examples/`
(copy `examples/south-bend/` as a starting point):

1. **`auction.json`** — the auction's details: title, subtitle, closing
   date/time, locations, contact info, the Bid Now link, and which lots to
   feature on the cover. Plain text file, just edit the values.
2. **`lots.csv`** — your lot list, with these columns:
   `Lot #, Location, Photo, Title, Description`
   (`Title` is optional; it's used for the search box only. The cards show
   `Description`.)
   - `Location` — only needed if the sale spans more than one site (like
     South Bend/Winter Springs); leave it blank/same for a single-location
     sale.
   - `Photo` — the image *filename* (must also be dropped into that
     auction's `photos/` folder). Not an embedded Excel image — a real file.
   - This can be produced directly from your existing Google Sheet: keep the
     same Lot #/Description columns, just make sure each row's photo is
     saved out as its own image file (Google Sheets: File → Download →
     Web Page will dump embedded images as files) rather than pasted into
     the cell.
3. **`photos/`** — the actual image files referenced by `lots.csv`, plus any
   extra photos used in `auction.json`'s `featuredLots` for the cover.

For Logan, `lots.csv` was made straight from the Lot List Master Form
(Lot # / TITLE / Description columns) and the photos are the `_first photos`
folder (`1.jpg`, `2.jpg`, ...), one main photo per lot.

Then generate it:

```
node generate.js examples/<your-folder-name>
node export-pdf.js examples/<your-folder-name>
```

That builds `output/<slug>/` — the HTML pages, a `manifest.json`, and
`catalog.pdf`. View it at
`http://localhost:4173/viewer/index.html?auction=<your-folder-name>`.

## What replaces what

| Old FlippingBook workflow | New system |
|---|---|
| Google Sheet → export → PDF, add header/footer/watermark | `lots.csv` → `node generate.js` (automatic, on-brand) |
| Hand-build cover/extra pages in Photoshop | `templates/cover.html` — fill in `auction.json`, it's templated |
| Upload to FlippingBook | Nothing to upload — it's just files on your own site |
| FlippingBook's generic viewer | `viewer/` — dark/gold KD-branded viewer, no watermark, no subscription |
| No open/view tracking | `flipbook_open`, `page_turn`, `lot_click`, `pdf_download` events, GA4-ready |

## Design notes / open items

- **Brand fonts**: uses Montserrat (your primary brand font, via Google
  Fonts) everywhere. Your color/font sheet also lists **Gibson** as the
  secondary font, but no Gibson web-font files were included in the project
  folder — Gibson is a paid Fontfabric font, so body text currently falls
  back to a free look-alike (Work Sans). If you have licensed Gibson
  `.woff2` files, send them over and it's a one-line swap in `brand/brand.css`.
- **Not yet wired**: this only becomes visible on kdauctions.com once it's
  integrated into that site's actual codebase (Next.js/Vercel) — that's a
  separate step once the look here is approved and we have access to that
  repo.
- **Analytics**: right now events just print to the browser console
  (`[kd-flipbook analytics] ...`) so testing doesn't pollute your real GA4
  property. Once this is embedded on the live site, set `measurementId` in
  `auction.json` to your real GA4 ID (the site already has `G-556NGJE25M`
  loaded) and the same events will report there automatically.
- **Google Sheet automation**: v1 uses a `lots.csv` file you export by hand.
  If this becomes the regular workflow, the next step is pulling directly
  from the Google Sheet automatically (no export step) — flagged for later,
  not built yet.

## Folder guide

```
flipbook-system/
  brand/              KD logos, brand.css (colors/fonts), track.js (click tracking)
  templates/          cover.html, sale-info-page.html, lot-page.html, closing-page.html
  generate.js         auction.json + lots.csv -> output/<slug>/pages/*.html (+ runs the page check)
  check-pages.js      opens every generated page and reports anything cut off / missing photos
  browser.js          shared headless-Chrome launcher (set KD_CHROMIUM_PATH to use a different Chrome)
  export-pdf.js       output/<slug>/pages -> output/<slug>/catalog.pdf
  viewer/             the page-flip viewer app (index.html/viewer.js/viewer.css)
  examples/logan/     Logan, UT 84321: 511 lots, rebuilt with the new readable layout
  examples/south-bend/, examples/portland/  older examples (regenerate to get the new layout)
  output/             generated results (not checked in — regenerate anytime)
```
