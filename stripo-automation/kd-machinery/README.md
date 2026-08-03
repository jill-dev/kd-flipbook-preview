# KD Machinery Email Automation

Generates KD Machinery marketing emails (1 to 20+ machines) from just a
list of ref #s + a headline — pulling each machine's name, type, specs,
photo, and product link live from kdmachinery.com (WooCommerce) — using
Jill's own approved template designs, rebuilt with real Stripo block markup
so they're click-to-edit in Stripo like the KD Auctions templates.

## Why the originals weren't editable

`brand-originals/KDM 1 Machine Template.html` and
`brand-originals/KDM Newer 1 Machine Template.html` are well-built,
on-brand HTML emails — but built as plain tables/divs with no Stripo
`esd-block-*`/`esd-structure`/`esd-container-frame` markup. Stripo's visual
editor only lets you click-edit content that carries that markup; without
it, the whole thing is one uneditable blob. There's no Stripo API to push
raw HTML into a template and have it come out as native blocks — Stripo's
own "Import → From HTML" is a UI-only feature and doesn't reliably
decompose hand-coded HTML into separate editable blocks either. So both
were rebuilt by hand with proper block markup, preserving the exact visual
design, colors, and fonts.

## Brand reference

- Primary: `#32adfb` (light blue), `#222222` (black), `#cbcbcb` (grey)
- Secondary: `#525759` (blue-grey), `#377493` (darker blue), `#80CCF2` (lighter blue)
- Fonts: Montserrat (primary), Gibson (secondary)

## Files

- `master-1machine.html` — native rebuild of "KDM 1 Machine Template":
  banner logo, headline + contact line, machine card with status badge,
  Specifications + Features sections, price strip, single centered footer.
- `master-newer.html` — native rebuild of "KDM Newer 1 Machine Template":
  logo + badge row, headline/subheadline, "View on Website" button, dashed
  contact banner, machine card (no status badge, combined specs, no
  features), promo strip, two-column footer.
- `lookup-machine.js` — looks up one machine on kdmachinery.com by ref #
  (WooCommerce SKU) via the WooCommerce REST API, returning name, type,
  price, photo URL, product link, and spec attributes.
- `generate-machinery-email.js` — the generator. Clones whichever master's
  machine card as many times as needed and fills every card automatically
  via `lookup-machine.js`.
- `sales-team.json` — maps each salesman's 2-letter initials (WooCommerce's
  "assigned rep" field, e.g. "NK", "MB") to their name + direct line, for
  auto-detecting the contact line. Includes an `"US"` fallback entry (main
  line) for campaigns whose machines belong to different salesmen. Source:
  Jill's Company Directory — only office direct lines are here, no mobile
  numbers or emails (this file is committed to the repo; the full directory
  PDF is not — see below).
- `campaigns/example-1machine-style/`, `campaigns/example-newer-style/` —
  working examples built from real kdmachinery.com listings.
- `campaigns/fabrication-inventory/`, `cnc-lathes/`,
  `haas-vertical-machining-centers/`, and 10 more — real category-inventory
  blasts (one salesman's full ref-# list per category, no per-machine
  headline/status, just a category title) built 2026-08-01.

## Make a new campaign

1. Make a new folder under `campaigns/<slug>/` (copy an example folder).
2. Edit `campaign.json`:
   ```json
   {
     "style": "1machine",
     "headline": "MUST MOVE!!",
     "subheadline": "Once in a lifetime deal",
     "contactName": "SEAN REID",
     "contactPhone": "480.212.0570",
     "campaignName": "must-move",
     "machines": [
       { "refNumber": "8078645", "status": "UNDER POWER!!" },
       { "refNumber": "8078650" }
     ]
   }
   ```
   - `style`: `"1machine"` or `"newer"` — which design to use.
   - `subheadline` is only used by `"newer"` style.
   - `status` (small badge like "UNDER POWER!!") is only used by `"1machine"`
     style, and isn't in WooCommerce — it's marketing copy, so it's typed
     per machine here, not looked up.
   - `pricing`: `"normal"` (default) or `"offer"` — `"offer"` strikes
     through the price and adds "MAKE AN OFFER" (for "slash through price /
     bring offers" requests like Mike Basham's).
   - `specPriority` (optional, campaign-wide): list of attribute-name
     keywords to lead the spec lines with, e.g.
     `["Table Width", "Table Length", "Spindle Horsepower", "Tool Changer"]`
     for CNC routers, per Nick Kirby's "(Show table size, spindle hp, ATC
     and pricing)" request. Everything else still shows, just after these.
   - `immediateNeeds` (optional): `{ "heading": "...", "items": ["...", ...] }`
     — the "we're also looking to buy X" card salesmen often want at the
     end of an email. Whole card is omitted if not given.
   - Each machine's "Watch Video" button is added automatically if
     kdmachinery.com has a video for that listing (checked via WooCommerce
     product data), removed otherwise. Nothing to set per machine.
   - Tall/vertical product photos are automatically narrowed to 420px wide
     and centered (detected from the photo's own dimensions — nothing to
     set). Landscape photos are untouched.
   - `status` is optional — if omitted, the status badge row is removed
     entirely (rather than showing an empty pill), and its top spacing
     shifts onto the machine name so the card doesn't look cramped.
   - `contactName`/`contactPhone` are optional — if omitted, they're
     auto-detected from `sales-team.json` using each machine's WooCommerce
     "assigned rep" field. If every machine in the campaign belongs to the
     same salesman, that person becomes the contact; if the machines belong
     to different salesmen (or an unrecognized rep code), the contact falls
     back to `"US"` / the main line (480.922.1674) — per Jill's rule.
   - Ref #s that return "not found" (sold or pulled from the site since the
     salesman sent the list) are skipped with a console note, not treated
     as an error — the campaign still runs with whatever's left. Same for
     ref #s whose WooCommerce **status** isn't `in_stock` or `available`
     (e.g. `sold`, `invoiced`, `unavailable`, `draft`) — checked
     automatically, no campaign.json field needed. Attribute values equal
     to `N/A` are also dropped automatically (salesmen use "N/A" for a
     required-but-unknown field, e.g. "Table Width N/A" — that whole line
     is skipped rather than shown).
   - `price` (optional per machine): overrides the live WooCommerce price,
     e.g. for a one-off discount that isn't in the system yet.
   - Every per-machine link (photo, name, price) and the video button get
     `utm_source=pardot&utm_medium=email&utm_campaign=<campaignName or file
     name>&utm_content=<ref#>` (`<ref#>-video` for the video button) added
     automatically — no campaign.json field needed, this is always on.
   - Any number of entries in `machines`.
3. Run:
   ```
   node generate-machinery-email.js <slug>
   ```
4. Open `output/<slug>.html` to check it, then Import → From HTML into
   Stripo.

Everything else (photo, year/make/model, machine type, spec lines, price,
product link) is pulled live from kdmachinery.com by ref # — no manual
copy/paste, and no image-upload step, since the photo is already a real
hosted URL from the product page.

## Tracking sheet

Jill tracks every campaign in a Google Sheet (two tabs: "HTML's Sent" —
Email Name / Rep / Subject Line; "Inventory Sent Out" — REF # / Year, Make,
Model / Date / HTML Name). There's no tool access to append rows to an
*existing* Sheet (Google Drive connector here is read/search/create-new-file
only, no cell/row edit) — so after every `generate-machinery-email.js` run,
give Jill a ready-to-paste row for both tabs using:
- Email Name / HTML Name: `output/<slug>.html`'s filename
- Subject Line: that file's `<title>`
- Rep: the generator's own "Tracking sheet Rep" console line — always
  first name(s), comma-joined if a campaign spans multiple salesmen (Jill
  wants named reps listed even on campaigns where the email itself falls
  back to "US" as the contact)
- REF # / Year, Make, Model: from campaign.json / the console lookup log

A new tracking sheet ("KD Machinery HTML Tracking",
`1CyUh76yzq02QhMOp8KB5J5AOVZL6oB0VmTJVxWwEKes`) was created 2026-08-01 with
the "HTML's Sent" tab seeded for every real campaign so far. Google Drive's
`create_file` will convert an uploaded CSV into a real populated Sheet (not
just an empty spreadsheet) — useful for seeding, but still can't *update*
an existing file afterward, so this only works for a one-time seed, not
ongoing appends.

## Bugs found and fixed after Jill ran a real batch through Pardot (2026-08-02)

- **Vertical photos inconsistently sized**: the original portrait/landscape
  detection parsed WordPress's `srcset` string for a `-WIDTHxHEIGHT.ext`
  resized-variant filename, which is missing or unreliable for some images.
  Switched to calling `wp/v2/media/{imageId}` (the image's own WordPress
  attachment ID, already present in WooCommerce's product data) for the
  *real* width/height — confirmed exact and reliable. `detectPortrait()` in
  lookup-machine.js is now async and takes the image ID + auth instead of
  guessing from a filename string.
- **Some video links didn't work — "the embedded-code ones"**: confirmed by
  auditing every real listing's raw video field. kdmachinery.com stores a
  video two different ways depending on how a salesman entered it: a plain
  `youtube.com/watch?v=`/`youtu.be/` link (always worked), or a full
  `<iframe src="youtube.com/embed/VIDEO_ID">` embed blob (didn't). The fix
  isn't extraction (that already worked) — `youtube.com/embed/VIDEO_ID` is
  meant for `<iframe>` embedding, not for a person to click directly, and
  behaves inconsistently as a plain link (no YouTube app deep-link,
  stripped-down player). `extractVideoUrl()` now pulls the video ID out of
  *any* of the four formats seen in real data (watch?v=, youtu.be/,
  embed/, shorts/) and always rebuilds a plain `youtube.com/watch?v=ID`
  link, regardless of source format.
- **No UTM tracking on the actual machine links**: the generic nav links
  (logo, contact, sell-your-machines, financing) already had
  `utm_campaign` baked into the master templates, but the links people
  actually click — photo, name, price, video button — had none. Added a
  `withUtm()` helper in generate-machinery-email.js: `utm_source=pardot`,
  `utm_medium=email`, `utm_campaign=<file name>` (Jill's own established
  convention), `utm_content=<ref#>` (or `<ref#>-video`) so she can tell
  which specific machine/link got clicked, not just which campaign. Also
  switched the master templates' existing `utm_source` from `newsletter`
  to `pardot` to match her actual platform.
- All 16 real campaigns regenerated and re-verified against these fixes
  (zero leftover placeholders, balanced tags, no `/embed/` links left,
  portrait widths spot-checked against real WordPress media dimensions).

## Bug found and fixed after Jill sent the batch through Pardot for team review (2026-08-02, later same day)

- **Literal `&#8242;` (and similar) showing up on the page** instead of
  rendering as the character it represents (found on a waterjet's "6.5'
  x 13.1'" dimensions, which should render with prime marks: 6.5′ x
  13.1′). Root cause: WordPress auto-converts typed `'`/`"` characters in
  CMS text (like `short_description`) into literal HTML entities in its
  stored source (`6.5&#8242;`) — that's normal and correct *as HTML
  source*. But `generate-machinery-email.js` inserts field values as
  plain **text node** data, which cheerio then re-escapes `&` on
  serialization, turning the already-encoded `&#8242;` into the literal
  text `&amp;#8242;` on the page. Fixed at the source in
  lookup-machine.js: a new `decodeEntities()` helper (parses the string
  through cheerio with entity decoding *on*, unlike the main document
  parse which uses `decodeEntities: false`) is applied to `yearMakeModel`,
  `type`, and every `attrLines` entry, so by the time text reaches the
  generator it's already plain Unicode — nothing left to double-escape.
  All 16 real campaigns regenerated and re-verified (zero `&amp;#`
  occurrences anywhere).

## More fixes from team feedback after a real send (2026-08-02, third round)

- **"N/A" spec lines** (salesmen type "N/A" into a required WordPress field
  they don't have data for, e.g. "Table Width N/A") are now filtered out at
  the source in lookup-machine.js — that attribute is dropped entirely
  rather than shown.
- **"Features:" section now sourced specifically from WooCommerce's
  "Equipped With" attribute**, not a generic trailing slice of whatever
  attributes happened to come last. Previously a machine with lots of specs
  (e.g. the Bertsch 100-10, 18 attributes) could get real spec data
  (Voltage, Weight, Horsepower) shoved into "Features" along with a
  redundant "Equipped With:" label baked into the text itself, since
  WooCommerce's attribute name literally *is* "Equipped With:". Fixed by
  extracting that attribute specifically in lookup-machine.js
  (`featuresText`), excluding it from `attrLines` (used for
  Specifications). If a machine has no "Equipped With" attribute (or it's
  N/A), the whole "Features:" row is removed instead of shown empty — same
  pattern as the optional status badge, including shifting the bottom
  padding onto the Specifications row so the card doesn't end abruptly.
- **TYPE line was left-aligned instead of centered** in
  `master-1machine.html` (master-newer.html already centered it) — added
  `align="center"` / `text-align:center` to match.
- **WooCommerce listing-status filtering**: some sold/invoiced/unavailable
  machines were making it into HTMLs. Confirmed the right field is
  `product.status` (values seen: `in_stock`, `available`, `sold`,
  `invoiced`) — distinct from WordPress's own draft/publish status, which
  this site doesn't use for this purpose at all (every listing stays a WP
  "draft" regardless of real sale status, per Jill). Only `in_stock` and
  `available` are treated as sellable; everything else is skipped
  automatically like a not-found ref #, logged with the actual status
  found. This caught several more sold/invoiced machines beyond the ones
  Jill had specifically flagged.
- **Per-machine price override** (`"price"` in campaign.json) added for
  one-off manual price changes not yet reflected in WooCommerce (e.g. "can
  we lower this one to $9,999?").

## Not yet handled

- Spec/feature lines are auto-grouped from WooCommerce's product attributes
  (evenly split into however many lines each design has, or reordered via
  `specPriority` first). It's a reasonable generic split, not a hand-tuned
  one — Jill can always tweak the wording in Stripo afterward.
- The "status" badge and the email's headline/subheadline are marketing
  copy (the salesman's catch phrase) and always typed per campaign, since
  they don't live on the product page.
- Corner badge graphics (Make an Offer, New Lower Price, etc. — see
  `images/`) are NOT composited onto photos. Confirmed with Jill this is
  fine as-is: the text-based equivalents (status badge, struck-through
  price) cover the same intent without needing image compositing + a
  manual-upload step per email.
- Footer now flows dark with the rest of the email (was a hard cut to
  white in both original approved designs) — confirmed with Jill.
- A "video icon" overlay (stamped on the photo like the badges) was
  requested but not built — instead, a "▶ Watch Video" button/link is
  added under the photo automatically when the listing has a video. Revisit
  if Jill wants the stamped-icon look specifically rather than a button.
  (A ready-made "Video ▶" pill graphic showed up in `images/` — could be
  composited in later if the button isn't enough.)
- `images/Company Directory 2026.pdf` (everyone's mobile numbers + emails
  across KD Machinery/Treger Financial/Quick Turn Financial) is
  intentionally **not** committed — this repo is public on GitHub.
  `.gitignore`'d by filename pattern so it can't be added by accident.
  `sales-team.json` carries only the subset actually needed (name + office
  direct line, same info already shown publicly in these emails).
