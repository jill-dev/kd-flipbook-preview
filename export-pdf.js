#!/usr/bin/env node
/**
 * Prints each generated catalog page to PDF and merges them into one file —
 * replaces the old "download sheet as PDF, hand-build cover in Photoshop"
 * pipeline. Run generate.js first.
 *
 * Usage: node export-pdf.js examples/south-bend
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const exampleArg = process.argv[2];
  if (!exampleArg) {
    console.error('Usage: node export-pdf.js examples/<slug>');
    process.exit(1);
  }
  const exampleDir = path.resolve(__dirname, exampleArg);
  const auction = JSON.parse(fs.readFileSync(path.join(exampleDir, 'auction.json'), 'utf8'));
  const pagesDir = path.join(__dirname, 'output', auction.slug, 'pages');
  const files = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.html')).sort();

  if (!files.length) {
    console.error(`No generated pages found in ${pagesDir} — run: node generate.js ${exampleArg}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1294 } });

  const merged = await PDFDocument.create();
  for (const file of files) {
    const fileUrl = 'file://' + path.join(pagesDir, file).replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    const pdfBytes = await page.pdf({ width: '1000px', height: '1294px', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    const doc = await PDFDocument.load(pdfBytes);
    const [copiedPage] = await merged.copyPages(doc, [0]);
    merged.addPage(copiedPage);
    console.log('  +', file);
  }

  await browser.close();

  const outPath = path.join(__dirname, 'output', auction.slug, 'catalog.pdf');
  fs.writeFileSync(outPath, await merged.save());
  console.log(`\nWrote ${files.length}-page catalog.pdf -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
