#!/usr/bin/env node
/**
 * Opens every generated page in a headless browser and confirms nothing is
 * cut off: no lot card runs into the footer or past the page edge, and every
 * photo loaded. generate.js runs this automatically at the end; you can also
 * run it on its own:  node check-pages.js examples/<slug>
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function checkPages(slug) {
  const outRoot = path.join(__dirname, 'output', slug);
  const manifest = JSON.parse(fs.readFileSync(path.join(outRoot, 'manifest.json'), 'utf8'));
  const browser = await require('./browser')();
  const page = await browser.newPage({ viewport: { width: manifest.pageWidth, height: manifest.pageHeight } });
  const problems = [];
  for (const rel of manifest.pages) {
    await page.goto(pathToFileURL(path.join(outRoot, rel)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const issues = await page.evaluate(() => {
      const out = [];
      const sheet = document.querySelector('.sheet').getBoundingClientRect();
      const footer = document.querySelector('.footer');
      const limit = footer ? footer.getBoundingClientRect().top : sheet.bottom;
      // Every content block must end above the footer / page bottom
      document.querySelectorAll('.card, .block, .callout, .ccard, .fcard, .details, .cta-row').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > limit + 0.5 || r.right > sheet.right + 0.5) {
          out.push(`${el.className}${el.dataset.lot ? ' (lot ' + el.dataset.lot + ')' : ''} runs ${Math.ceil(Math.max(r.bottom - limit, r.right - sheet.right))}px off the page`);
        }
      });
      // A section whose content is taller than the space it was given
      // (overflowing into the next section, or hidden by overflow:hidden)
      document.querySelectorAll('.main, .left, .right, .cols, .col, .grid, .inner').forEach((el) => {
        if (el.scrollHeight > el.clientHeight + 1) out.push(`${el.className} section overflows by ${el.scrollHeight - el.clientHeight}px`);
      });
      // Text clipped inside its own box
      document.querySelectorAll('.desc, .body, .value').forEach((el) => {
        if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow !== 'visible') out.push('text clipped: ' + el.textContent.slice(0, 40));
      });
      document.querySelectorAll('img').forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) out.push('missing image: ' + img.getAttribute('src'));
      });
      return out;
    });
    issues.forEach((i) => problems.push(`${path.basename(rel)}: ${i}`));
  }
  await browser.close();
  return problems;
}

module.exports = checkPages;

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) { console.error('Usage: node check-pages.js examples/<slug>'); process.exit(1); }
  const slug = JSON.parse(fs.readFileSync(path.join(path.resolve(__dirname, arg), 'auction.json'), 'utf8')).slug;
  checkPages(slug).then((p) => {
    if (p.length) { console.log(p.join('\n')); console.log(`\n${p.length} problem(s) found.`); process.exit(1); }
    console.log('All pages checked: nothing cut off, all photos present.');
  }).catch((e) => { console.error(e); process.exit(1); });
}
