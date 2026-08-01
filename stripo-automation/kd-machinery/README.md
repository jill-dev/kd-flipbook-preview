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
- `campaigns/example-1machine-style/`, `campaigns/example-newer-style/` —
  working examples built from real kdmachinery.com listings.

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
