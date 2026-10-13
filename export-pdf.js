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
const launchBrowser = require('./browser');
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

  // Page size comes from the manifest generate.js wrote (1400x900 landscape now)
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'output', auction.slug, 'manifest.json'), 'utf8'));
  const W = manifest.pageWidth || 1000;
  const H = manifest.pageHeight || 1100;

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  const merged = await PDFDocument.create();
  for (const file of files) {
    const fileUrl = 'file://' + path.join(pagesDir, file).replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const pdfBytes = await page.pdf({ width: `${W}px`, height: `${H}px`, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    const doc = await PDFDocument.load(pdfBytes);
    const [copiedPage] = await merged.copyPages(doc, [0]);
    merged.addPage(copiedPage);
    process.stdout.write('.');
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
