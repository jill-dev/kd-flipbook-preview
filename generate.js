#!/usr/bin/env node
/**
 * KD Auctions flipbook generator.
 * Usage: node generate.js examples/south-bend
 *
 * Reads examples/<slug>/auction.json + lots.csv, renders the branded HTML
 * catalog pages via Handlebars templates, and writes them to output/<slug>/pages/.
 */
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { parse } = require('csv-parse/sync');
const sharp = require('sharp');
const { pathToFileURL } = require('url');

// Source photos (phone camera exports, etc.) commonly run 3000-4000px wide
// and several MB each, but nothing in these templates ever displays a photo
// wider than the page itself (1000px) — full-size originals only bloat page
// load time and catalog.pdf (a 75-lot auction's PDF hit ~780MB before this).
// Downscale + re-compress on the way into output/, once, here.
// Lot cards show photos at most ~430px wide; 900px covers high-DPI screens
// and viewer zoom while keeping the page loads and catalog.pdf a sane size.
const PHOTO_MAX_WIDTH = 900;

async function copyPhotoResized(srcPath, destPath) {
  const ext = path.extname(srcPath).toLowerCase();
  let img = sharp(srcPath).rotate().resize({ width: PHOTO_MAX_WIDTH, height: PHOTO_MAX_WIDTH, fit: 'inside', withoutEnlargement: true });
  if (ext === '.jpg' || ext === '.jpeg') img = img.jpeg({ quality: 78, mozjpeg: true });
  else if (ext === '.png') img = img.png({ quality: 82 });
  await img.toFile(destPath);
}

Handlebars.registerHelper('inc', (v) => v + 1);

// Turns bare email addresses / URLs inside free-text fields (sales tax
// notes, terms paragraphs, etc.) into real clickable links, without having
// to hand-edit every place that kind of text gets typed into auction.json.
Handlebars.registerHelper('linkify', (text) => {
  if (!text) return '';
  let escaped = Handlebars.escapeExpression(text);
  escaped = escaped.replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, '<a href="mailto:$1">$1</a>');
  escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  return new Handlebars.SafeString(escaped);
});

// A phone number as typed for display (e.g. "480-371-9009") isn't a valid
// tel: href on its own — strip it down to just digits (keeping a leading +).
Handlebars.registerHelper('tel', (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, ''));

function loadTemplate(name) {
  const file = path.join(__dirname, 'templates', `${name}.html`);
  return Handlebars.compile(fs.readFileSync(file, 'utf8'));
}

function loadLots(csvPath, lotLinks) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  return rows.map((row) => {
    const location = (row['Location'] || '').trim();
    // Blank Location = single-location sale — never show the location tag.
    // Multi-location sales tag every card (cards are read individually,
    // not as a running list, so "first of a new location" isn't enough).
    const showLocation = location !== '';
    const photoFile = (row['Photo'] || '').trim();
    const photo = photoFile ? `../photos/${photoFile}` : '';
    return {
      lot: row['Lot #'],
      location,
      showLocation,
      photo,
      photoFile,
      title: (row['Title'] || '').replace(/\s+/g, ' ').trim(),
      description: (row['Description'] || row['Title'] || '').replace(/\s+/g, ' ').trim(),
      // Direct link to this lot's own listing (e.g. on BidSpotter), when we
      // have one — falls back to the auction's general bidUrl in the template.
      bidUrl: lotLinks[row['Lot #']] || null,
    };
  });
}

// Optional examples/<slug>/lot-links.json: { "<lot #>": "https://...direct link..." }
// lets individual lots deep-link to their own listing instead of just the
// general catalogue page. Not every lot needs an entry.
function loadLotLinks(exampleDir) {
  const file = path.join(exampleDir, 'lot-links.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ── Page geometry ───────────────────────────────────────────────────────
// Landscape pages sized like a screen, so the viewer barely has to shrink
// them (the old 1000x1100 portrait pages got scaled to ~55-70% on a normal
// monitor, which is why the text read as tiny). Keep these in sync with
// templates/*.html (.sheet width/height) -- they're also written into
// manifest.json so the viewer and export-pdf.js pick them up automatically.
const PAGE_W = 1400;
const PAGE_H = 900;

// Lot page layout numbers (must match templates/lot-page.html).
const LOT_COLS = 3;
const CARD_W = Math.floor((PAGE_W - 36 * 2 - 22 * (LOT_COLS - 1)) / LOT_COLS); // grid padding + column gaps
const GRID_BUDGET = PAGE_H - 5 - 68 - 50 - 18 - 12; // gradient bar, header, footer, grid top padding, breathing room
const ROW_GAP = 18;
const CARD_CHROME = 3 + 2; // photo's yellow bottom border + card border
const PHOTO_MAX_TWO_ROWS = 285;
const PHOTO_MIN_TWO_ROWS = 165; // below this, photos get too small -- give the row its own page instead
const PHOTO_MAX_ONE_ROW = 360;

// Measure every lot's description block at the real card width with the
// real (bundled) fonts in a headless browser -- exact, so nothing can ever
// get clipped. Falls back to a conservative estimate if Playwright/Chromium
// isn't available on this machine.
async function measureDescriptions(lots) {
  const tpl = fs.readFileSync(path.join(__dirname, 'templates', 'lot-page.html'), 'utf8');
  const pageCss = tpl.match(/<style>([\s\S]*?)<\/style>/)[1];
  const body = lots.map((l, i) =>
    `<div class="card" style="width:${CARD_W}px"><div class="desc" data-i="${i}">${
      l.showLocation ? `<span class="loc">${Handlebars.escapeExpression(l.location)}</span><br />` : ''
    }${Handlebars.escapeExpression(l.description)}</div></div>`).join('');
  // Written next to brand/ and loaded as a real file (not setContent) so the
  // bundled fonts actually load -- measuring with a fallback font is wrong.
  const measureFile = path.join(__dirname, 'brand', '_measure.html');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="brand.css"><style>${pageCss}</style></head><body class="kd-page">${body}</body></html>`;
  fs.writeFileSync(measureFile, html);
  let browser;
  try {
    browser = await require('./browser')();
    const page = await browser.newPage();
    await page.goto(pathToFileURL(measureFile).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fontsOk = await page.evaluate(() => document.fonts.check('500 22px "Work Sans"'));
    if (!fontsOk) throw new Error('brand fonts did not load');
    const heights = await page.$$eval('.desc', (els) => els.map((e) => Math.ceil(e.getBoundingClientRect().height)));
    console.log(`Measured ${heights.length} lot descriptions.`);
    return heights;
  } catch (err) {
    console.warn('! Could not measure text in a browser (' + err.message.split('\n')[0] + ') -- using a safe estimate instead.');
    return lots.map((l) => {
      const chars = l.description.length + (l.showLocation ? 40 : 0);
      const lines = Math.max(1, Math.ceil(chars / 28)); // deliberately pessimistic (~33 fit in practice)
      return 28 + lines * 32;
    });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(measureFile, { force: true });
  }
}

// Zero-padded to 3 digits so files sort in page order even past 99 pages
// (with 2 digits, "100-..." sorted before "11-..." in the PDF export).
const pageName = (n) => String(n).padStart(3, '0');

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Lots go into rows of 3 (in lot order), and each page holds two rows when
// their text leaves room for decent-sized photos, otherwise one row. The
// photo height is then stretched/shrunk per page to use the space exactly.
function packRowsIntoPages(lots, heights) {
  const rows = chunk(lots.map((l, i) => ({ ...l, descH: heights[i] })), LOT_COLS)
    .map((r) => ({ lots: r, textH: Math.max(...r.map((l) => l.descH)) }));
  const pages = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (b) {
      const photo = Math.floor((GRID_BUDGET - ROW_GAP - a.textH - b.textH) / 2 - CARD_CHROME);
      if (photo >= PHOTO_MIN_TWO_ROWS) {
        pages.push({ lots: [...a.lots, ...b.lots], photoHeight: Math.min(PHOTO_MAX_TWO_ROWS, photo) });
        i++;
        continue;
      }
    }
    const photo = Math.floor(GRID_BUDGET - a.textH - CARD_CHROME);
    pages.push({ lots: a.lots, photoHeight: Math.max(120, Math.min(PHOTO_MAX_ONE_ROW, photo)) });
  }
  return pages;
}

async function main() {
  const exampleArg = process.argv[2];
  if (!exampleArg) {
    console.error('Usage: node generate.js examples/<slug>');
    process.exit(1);
  }
  const exampleDir = path.resolve(__dirname, exampleArg);
  const rawAuction = JSON.parse(fs.readFileSync(path.join(exampleDir, 'auction.json'), 'utf8'));
  const lotLinks = loadLotLinks(exampleDir);
  const lots = loadLots(path.join(exampleDir, 'lots.csv'), lotLinks);

  // Generated pages live at output/<slug>/pages/*.html, three levels below
  // flipbook-system/ (where /brand lives) and one level above /photos —
  // rewrite the authoring-time paths from auction.json to match that layout.
  const auction = {
    ...rawAuction,
    logo: { dark: '../../../brand/logo-dark.png', light: '../../../brand/logo-light.png' },
    featuredLots: (rawAuction.featuredLots || []).map((l) => ({
      ...l,
      photo: `../photos/${path.basename(l.photo)}`,
    })),
    // saleInfo.bannerPhoto can be an auction-specific photo (bare filename,
    // resolved against that auction's own photos/ folder) or a shared asset
    // from flipbook-system/brand/ (prefixed "brand/") — e.g. the default
    // KD Auctions hero shot used across multiple auctions.
    saleInfo: rawAuction.saleInfo && {
      ...rawAuction.saleInfo,
      bannerPhoto: rawAuction.saleInfo.bannerPhoto.startsWith('brand/')
        ? `../../../${rawAuction.saleInfo.bannerPhoto}`
        : `../photos/${path.basename(rawAuction.saleInfo.bannerPhoto)}`,
    },
  };

  const outDir = path.join(__dirname, 'output', auction.slug, 'pages');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, f));

  const pages = []; // { file, kind }

  // Cover page
  const coverTpl = loadTemplate('cover');
  fs.writeFileSync(path.join(outDir, `${pageName(1)}-cover.html`), coverTpl(auction));
  pages.push({ file: `${pageName(1)}-cover.html`, kind: 'cover' });

  // Important sale info page (terms, removal logistics, riggers) — always
  // page 2, right after the cover — optional
  if (auction.saleInfo) {
    const saleInfoTpl = loadTemplate('sale-info-page');
    const saleInfoFile = `${pageName(pages.length + 1)}-sale-info.html`;
    fs.writeFileSync(path.join(outDir, saleInfoFile), saleInfoTpl(auction));
    pages.push({ file: saleInfoFile, kind: 'sale-info' });
  }

  // Lot pages
  const lotPageTpl = loadTemplate('lot-page');
  const heights = await measureDescriptions(lots);
  const lotPages = packRowsIntoPages(lots, heights);
  const lotPageIndex = {}; // lot # -> 0-based page index in the flipbook
  lotPages.forEach((pg, idx) => {
    const pageNumber = idx + 1;
    const html = lotPageTpl({
      ...auction,
      lots: pg.lots,
      photoHeight: pg.photoHeight,
      firstLot: pg.lots[0].lot,
      lastLot: pg.lots[pg.lots.length - 1].lot,
      pageNumber,
      pageCount: lotPages.length,
    });
    pg.lots.forEach((l) => { lotPageIndex[l.lot] = pages.length; });
    const fname = `${pageName(pages.length + 1)}-lots-${pageNumber}.html`;
    fs.writeFileSync(path.join(outDir, fname), html);
    pages.push({ file: fname, kind: 'lots' });
  });

  // Closing page
  const closingTpl = loadTemplate('closing-page');
  const closingFile = `${pageName(pages.length + 1)}-closing.html`;
  fs.writeFileSync(path.join(outDir, closingFile), closingTpl(auction));
  pages.push({ file: closingFile, kind: 'closing' });

  // Copy photos + brand assets alongside the output so pages render standalone
  const outPhotos = path.join(__dirname, 'output', auction.slug, 'photos');
  fs.mkdirSync(outPhotos, { recursive: true });
  const srcPhotos = path.join(exampleDir, 'photos');
  if (fs.existsSync(srcPhotos)) {
    for (const f of fs.readdirSync(srcPhotos)) {
      const src = path.join(srcPhotos, f);
      const dest = path.join(outPhotos, f);
      if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
      // Skip photos already resized on an earlier run (big time saver on 500-lot sales)
      if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) continue;
      await copyPhotoResized(src, dest);
    }
  }

  // Manifest the viewer reads to build the flipbook
  const manifest = {
    slug: auction.slug,
    title: auction.title,
    siteUrl: auction.siteUrl,
    measurementId: auction.measurementId,
    bidUrl: auction.bidUrl,
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
    pages: pages.map((p) => `pages/${p.file}`),
    // For the viewer's "Go to lot" box and the searchable lot list
    lots: lots.map((l) => ({
      lot: l.lot,
      title: l.title && l.title !== l.description ? l.title : undefined, // searched, not shown
      description: l.description,
      location: l.location || undefined,
      photo: l.photoFile ? `photos/${l.photoFile}` : null,
      bidUrl: l.bidUrl || undefined,
      page: lotPageIndex[l.lot],
    })),
  };
  fs.writeFileSync(
    path.join(__dirname, 'output', auction.slug, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  const twoRow = lotPages.filter((p) => p.lots.length > LOT_COLS).length;
  console.log(`${lots.length} lots on ${lotPages.length} lot pages (${twoRow} with 6 lots, ${lotPages.length - twoRow} with 3 or fewer).`);
  console.log(`Generated ${pages.length} pages for "${auction.slug}" -> output/${auction.slug}/`);

  // Final safety check: open every page and make sure nothing got cut off
  try {
    const problems = await require('./check-pages')(auction.slug);
    if (problems.length) {
      console.warn(`\n! ${problems.length} layout problem(s):\n  ` + problems.join('\n  '));
      process.exitCode = 1;
    } else {
      console.log('Checked every page: nothing cut off, all photos present.');
    }
  } catch (err) {
    console.warn('(Skipped the page check -- no headless browser available: ' + err.message.split('\n')[0] + ')');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
