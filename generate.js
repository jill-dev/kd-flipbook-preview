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

// Source photos (phone camera exports, etc.) commonly run 3000-4000px wide
// and several MB each, but nothing in these templates ever displays a photo
// wider than the page itself (1000px) — full-size originals only bloat page
// load time and catalog.pdf (a 75-lot auction's PDF hit ~780MB before this).
// Downscale + re-compress on the way into output/, once, here.
const PHOTO_MAX_WIDTH = 1600;

async function copyPhotoResized(srcPath, destPath) {
  const ext = path.extname(srcPath).toLowerCase();
  let img = sharp(srcPath).rotate().resize({ width: PHOTO_MAX_WIDTH, withoutEnlargement: true });
  if (ext === '.jpg' || ext === '.jpeg') img = img.jpeg({ quality: 82 });
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
  let prevLocation = null;
  return rows.map((row) => {
    const location = row['Location'] || '';
    // Blank Location = single-location sale — never show the location badge.
    const locationChanged = location !== '' && location !== prevLocation;
    prevLocation = location;
    const photo = row['Photo'] ? `../photos/${row['Photo']}` : '';
    return {
      lot: row['Lot #'],
      location,
      locationChanged,
      photo,
      description: row['Description'] || '',
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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
  fs.writeFileSync(path.join(outDir, '01-cover.html'), coverTpl(auction));
  pages.push({ file: '01-cover.html', kind: 'cover' });

  // Important sale info page (terms, removal logistics, riggers) — always
  // page 2, right after the cover — optional
  if (auction.saleInfo) {
    const saleInfoTpl = loadTemplate('sale-info-page');
    const saleInfoFile = `${String(pages.length + 1).padStart(2, '0')}-sale-info.html`;
    fs.writeFileSync(path.join(outDir, saleInfoFile), saleInfoTpl(auction));
    pages.push({ file: saleInfoFile, kind: 'sale-info' });
  }

  // Lot pages
  const lotPageTpl = loadTemplate('lot-page');
  const lotChunks = chunk(lots, auction.lotsPerPage || 6);
  lotChunks.forEach((lotsOnPage, idx) => {
    const pageNumber = idx + 1;
    const html = lotPageTpl({
      ...auction,
      lots: lotsOnPage,
      pageNumber,
      pageCount: lotChunks.length,
    });
    const fname = `${String(pages.length + 1).padStart(2, '0')}-lots-${pageNumber}.html`;
    fs.writeFileSync(path.join(outDir, fname), html);
    pages.push({ file: fname, kind: 'lots' });
  });

  // Closing page
  const closingTpl = loadTemplate('closing-page');
  const closingFile = `${String(pages.length + 1).padStart(2, '0')}-closing.html`;
  fs.writeFileSync(path.join(outDir, closingFile), closingTpl(auction));
  pages.push({ file: closingFile, kind: 'closing' });

  // Copy photos + brand assets alongside the output so pages render standalone
  const outPhotos = path.join(__dirname, 'output', auction.slug, 'photos');
  fs.mkdirSync(outPhotos, { recursive: true });
  const srcPhotos = path.join(exampleDir, 'photos');
  if (fs.existsSync(srcPhotos)) {
    for (const f of fs.readdirSync(srcPhotos)) {
      await copyPhotoResized(path.join(srcPhotos, f), path.join(outPhotos, f));
    }
  }

  // Manifest the viewer reads to build the flipbook
  const manifest = {
    slug: auction.slug,
    title: auction.title,
    siteUrl: auction.siteUrl,
    measurementId: auction.measurementId,
    pages: pages.map((p) => `pages/${p.file}`),
  };
  fs.writeFileSync(
    path.join(__dirname, 'output', auction.slug, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`Generated ${pages.length} pages for "${auction.slug}" -> output/${auction.slug}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
