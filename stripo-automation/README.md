# Stripo Automation

Fills the KD Auctions Stripo master template ("KDA Equipment Auction - Master
(Native Rebuild)", Stripo templateId `4542366`, in the "Claude Work" folder)
with per-auction data and writes finished, ready-to-send HTML — no more
hand-editing 14 equipment cards in the Stripo visual editor every time.

## First-time setup

1. `npm install`
2. Your Stripo API token goes in `.env` (already set up):
   ```
   STRIPO_API_TOKEN=...
   ```
   Get/rotate it in Stripo: **Project Settings → API**. Never commit `.env`
   (it's gitignored).

## Make a new auction email

1. Copy `auctions/north-charleston/` to `auctions/<your-slug>/`.
2. Edit **`auction.json`**: subtitle, inspection note, closing date/time,
   location, More Info link, Bid Now link.
   - **If the sale isn't posted on Bidspotter yet**, set `"bidNowUrl": "TBD"`
     — the button will render as "Coming Soon" linking to `#` instead of a
     dead link. Come back and re-run once the real link exists.
3. Edit **`lots.csv`** (`Name,Description,PhotoUrl,LinkUrl`) — any number of
   rows.
   - `Name` = **Year Make Model** only, e.g. `2007 Haas VF-3D`.
   - `Description` = the equipment **type**, e.g.
     `CNC Vertical Machining Center`. Name renders in yellow, Description in
     white.
   - `PhotoUrl` must be a real hosted image URL (upload to Stripo's cabinet
     manually first, same as before, and copy the URL — there's no API for
     image upload here).
   - `LinkUrl` per lot is optional; leave blank to fall back to
     `moreInfoUrl`.
   - Fewer than 14 lots: unused card slots are removed cleanly. More than
     14: extra rows are cloned automatically to fit.
4. Optional — **license numbers**: add to `auction.json`:
   ```json
   "licenses": [
     { "name": "KD Capital Auctions", "number": "AF-4189" },
     { "name": "Tim Pfister", "number": "AUC-4364" }
   ],
   "licenseListUrl": "TBD"
   ```
   These vary by state. Leave `licenseListUrl` as `"TBD"` until the Google
   Doc with the full license list exists — the "View all license numbers"
   link is hidden automatically until then.
5. Optional — **carousel photos** (the rotating photo box at the top): add to
   `auction.json`:
   ```json
   "carouselPhotos": ["https://...jpg", "https://...jpg", "https://...jpg"]
   ```
   Any number of photos, real hosted URLs (same rule as `PhotoUrl` above —
   upload to Stripo's cabinet first). **If you skip this**, it automatically
   reuses all the `PhotoUrl`s from `lots.csv` instead, so you usually don't
   need to set it at all. Unlike the equipment cards, **you can't just swap
   these later by clicking in Stripo** — a rotating photo needs its URL
   copied into 6 different places in the code (the Gmail version, the
   thumbnail strip, the plain-old-email fallback, etc.), which is exactly
   why this is automated rather than hand-edited. If a photo's wrong, fix it
   in `auction.json`/`lots.csv` and re-run the generator, don't try to edit
   it inside Stripo directly.
   - For a shop **video** instead of rotating photos: not supported yet —
     ask if/when a sale needs this and it can be added (it'd be one static
     clickable thumbnail linking out to the hosted video, since actual
     embedded video doesn't play in any email client).
   - Optional caption text next to the carousel: add
     `"carouselCaption": { "title": "...", "description": "..." }` to
     `auction.json`. Leave it out and that space is just blank.
6. Run:
   ```
   node generate-email.js <your-slug>
   ```
7. Open `output/<your-slug>.html` to sanity-check it, then paste/import it
   into Stripo (**Import → From HTML**) to save it as a real template, or
   send it straight through your ESP.

## Other scripts

- `node list-templates.js` — lists every folder + template in the Stripo
  account (useful for finding a templateId, or checking for duplicate
  saves).
- `node fetch-master.js` — re-downloads the master template's HTML from
  Stripo into `master.html`. **Don't run this casually** — `master.html` now
  has manual layout fixes (spacing, alignment, the license section) that
  aren't saved back to Stripo template `4542366` (there's no API for that).
  Re-running this would overwrite those fixes with the older, unfixed
  version. Only run it if template `4542366` itself gets a real design
  update in the Stripo editor that you want pulled in — and expect to redo
  the local fixes afterward.
- `node diff-claude-work.js` — one-off script used to compare the old
  duplicate templates when cleaning up the Claude Work folder; not needed
  for normal use.

## How it works

`master.html` is the template's HTML (Stripo's *editable* export format,
originally fetched via the Stripo API, since hand-tweaked locally — see the
warning above). `generate-email.js` loads it with `cheerio` (a real HTML
parser, not regex) and:

- Replaces the single-value header fields (subtitle, date, location, Bid Now
  / More Info links, license numbers) by locating their current text/id.
- Finds the lot-card image slots (`img[alt="[Equipment item name]"]` — every
  card in the master still carries this literal placeholder alt text even
  once filled in, so it's a reliable anchor), clones extra rows if there are
  more lots than built-in slots, and fills each from `lots.csv` in order (or
  removes the card cleanly if no lot was supplied for that slot).
- Rebuilds the carousel entirely from scratch for however many photos you
  give it (`carousel.js`), reproducing Stripo's own AMP-carousel-plus-CSS-
  checkbox-hack pattern (verified byte-for-byte against a real Stripo
  export). This part is spliced in as raw text *after* cheerio finishes,
  never round-tripped through cheerio's parser — cheerio subtly rewrites
  AMP tags and the IE conditional comments the carousel depends on, which
  is safe for plain HTML but risks breaking Gmail's strict AMP validation.

This only touches the local file and Stripo's read/list/delete API — it
never overwrites the saved master template in your account, so you can
regenerate as many times as you want without risk to templateId `4542366`.
