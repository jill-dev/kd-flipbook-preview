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

Handlebars.registerHelper('inc', (v) => v + 1);

function loadTemplate(name) {
  const file = path.join(__dirname, 'templates', `${name}.html`);
  return Handlebars.compile(fs.readFileSync(file, 'utf8'));
}

function loadLots(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  let prevLocation = null;
  return rows.map((row) => {
    const location = row['Location'] || '';
    const locationChanged = location !== prevLocation;
    prevLocation = location;
    const photo = row['Photo'] ? `../photos/${row['Photo']}` : '';
    return {
      lot: row['Lot #'],
      location,
      locationChanged,
      photo,
      description: row['Description'] || '',
    };
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function main() {
  const exampleArg = process.argv[2];
  if (!exampleArg) {
    console.error('Usage: node generate.js examples/<slug>');
    process.exit(1);
  }
  const exampleDir = path.resolve(__dirname, exampleArg);
  const rawAuction = JSON.parse(fs.readFileSync(path.join(exampleDir, 'auction.json'), 'utf8'));
  const lots = loadLots(path.join(exampleDir, 'lots.csv'));

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
  };

  const outDir = path.join(__dirname, 'output', auction.slug, 'pages');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, f));

  const pages = []; // { file, kind }

  // Cover page
  const coverTpl = loadTemplate('cover');
  fs.writeFileSync(path.join(outDir, '01-cover.html'), coverTpl(auction));
  pages.push({ file: '01-cover.html', kind: 'cover' });

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
    const fname = `${String(pageNumber + 1).padStart(2, '0')}-lots-${pageNumber}.html`;
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
      fs.copyFileSync(path.join(srcPhotos, f), path.join(outPhotos, f));
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

main();
