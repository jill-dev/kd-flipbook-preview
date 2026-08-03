// Fills the Stripo master template (master.html) with per-auction data and
// writes finished, ready-to-import HTML to output/<slug>.html.
//
// Usage: node generate-email.js <auction-slug>
// Reads:  auctions/<auction-slug>/auction.json + lots.csv
//
// The grid starts with BASE_SLOTS "featured equipment" cards built into the
// master. If more lots are supplied than that, extra rows are cloned from
// the last existing row (every row uses identical spacing, confirmed
// against master.html, so this stays visually consistent). Fewer lots than
// BASE_SLOTS: unused card slots are removed cleanly.

import { load } from "cheerio";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCarousel } from "./carousel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_SLOTS = 14;

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node generate-email.js <auction-slug>");
  process.exit(1);
}

const auctionDir = join(__dirname, "auctions", slug);
const auction = JSON.parse(readFileSync(join(auctionDir, "auction.json"), "utf8"));
const lots = parseCsv(readFileSync(join(auctionDir, "lots.csv"), "utf8"));

const html = readFileSync(join(__dirname, "master.html"), "utf8");
const $ = load(html, { decodeEntities: false });

// --- single-value header/footer fields ---
setText($, 'p:contains("SURPLUS EQUIPMENT FOR A PRECISION")', auction.subtitle);
setHtml($, 'p:contains("By Appointment Only")', breakBeforeLastWord(auction.inspectionNote));
setHtml($, 'p:contains("Tuesday, August 18, 2026")', formatClosingDateTime(auction.closingDateTime));
setText($, 'p:contains("3216 Industry Drive")', auction.location);

const moreInfoLink = $('a:contains("More Information")').first();
if (auction.moreInfoUrl) moreInfoLink.attr("href", auction.moreInfoUrl);

const bidNowLink = $('a:contains("Bid Now")').first();
if (!auction.bidNowUrl || auction.bidNowUrl === "TBD") {
  bidNowLink.attr("href", "#");
  bidNowLink.html("Coming Soon");
} else {
  bidNowLink.attr("href", auction.bidNowUrl);
}

// --- license numbers (state auction/auctioneer license #s) ---
if (auction.licenses && auction.licenses.length) {
  const linesHtml = auction.licenses.map((l) => `${l.name}: ${l.number}`).join("<br>");
  $("#license-list p").html(linesHtml);
} else {
  $("#license-list p").html("Add license numbers to auction.json");
}
if (auction.licenseListUrl && auction.licenseListUrl !== "TBD") {
  $("#license-doc-link").attr("href", auction.licenseListUrl);
} else {
  $("#license-doc-row").remove();
}

// --- carousel caption (text beside the rotating photos) ---
setText($, "#carousel-caption-title p", auction.carouselCaption?.title ?? "");
setText($, "#carousel-caption-desc p", auction.carouselCaption?.description ?? "");

// --- lot cards ---
let slots = $('img[alt="[Equipment item name]"]').toArray();
if (slots.length !== BASE_SLOTS) {
  console.error(`Expected ${BASE_SLOTS} card slots in master.html, found ${slots.length}. Aborting — template may have changed.`);
  process.exit(1);
}

const extraPairsNeeded = Math.ceil(Math.max(0, lots.length - BASE_SLOTS) / 2);
if (extraPairsNeeded > 0) {
  const $lastRow = $(slots[BASE_SLOTS - 1]).closest("table.es-content");
  let $insertAfter = $lastRow;
  for (let i = 0; i < extraPairsNeeded; i++) {
    const $clone = $lastRow.clone();
    $insertAfter.after($clone);
    $insertAfter = $clone;
  }
  slots = $('img[alt="[Equipment item name]"]').toArray();
  console.log(`Added ${extraPairsNeeded} extra row(s) for ${lots.length} lots (${slots.length} total slots now).`);
}

slots.forEach((el, i) => {
  const $img = $(el);
  const $a = $img.parent("a");
  const $td = $a.closest("td.esd-container-frame");
  const $ps = $td.find("p");
  const lot = lots[i];

  if (!lot) {
    // No lot supplied for this slot: drop the whole card column cleanly.
    $td.closest("table.es-left, table.es-right").remove();
    return;
  }

  $a.attr("href", lot.LinkUrl || auction.moreInfoUrl || "#");
  $img.attr("src", lot.PhotoUrl);
  $img.attr("alt", lot.Name);
  $ps.eq(0).text(lot.Name);
  if ($ps.length > 1) $ps.eq(1).text(lot.Description || "");
});

// --- carousel (spliced in as raw text AFTER cheerio, never re-serialized by
// it — cheerio's parser normalizes the AMP tags / IE conditional comments
// just enough to risk breaking Gmail's strict AMP validation, confirmed by
// diffing a round-trip) ---
let finalHtml = $.html();
const carouselPhotos = auction.carouselPhotos && auction.carouselPhotos.length ? auction.carouselPhotos : lots.map((l) => l.PhotoUrl).filter(Boolean);
const carousel = buildCarousel(carouselPhotos);
finalHtml = spliceCarousel(finalHtml, carousel.td);
finalHtml = spliceIntoHead(finalHtml, carousel.style);

mkdirSync(join(__dirname, "output"), { recursive: true });
const outPath = join(__dirname, "output", `${slug}.html`);
writeFileSync(outPath, finalHtml);
console.log(`Wrote ${outPath} (${lots.length} lots, ${carouselPhotos.length} carousel photos)`);

function spliceCarousel(html, replacementTd) {
  const openTag = '<td align="left" class="esd-block-amp-carousel">';
  const start = html.indexOf(openTag);
  if (start === -1) {
    console.error("Could not find the carousel <td> in master.html — has the template structure changed?");
    process.exit(1);
  }
  const tagRe = /<td\b[^>]*>|<\/td>/g;
  tagRe.lastIndex = start + 1;
  let depth = 1;
  let end = -1;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0].startsWith("</td")) {
      depth--;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    } else {
      depth++;
    }
  }
  if (end === -1) {
    console.error("Could not find the closing </td> for the carousel block. Aborting.");
    process.exit(1);
  }
  return html.slice(0, start) + replacementTd + html.slice(end);
}

// Puts the carousel's <style> block just before </head> — must be a real
// <head> style tag (not embedded in <body>) or Pardot's HTML sanitizer
// strips it and every carousel show/hide rule silently breaks.
function spliceIntoHead(html, styleBlock) {
  const closeHead = "</head>";
  const idx = html.indexOf(closeHead);
  if (idx === -1) {
    console.error("Could not find </head> in master.html to insert the carousel style block. Aborting.");
    process.exit(1);
  }
  return html.slice(0, idx) + styleBlock + html.slice(idx);
}

function setText($, selector, value) {
  if (value === undefined) return;
  const el = $(selector).first();
  if (el.length === 0) {
    console.warn(`Warning: selector not found, skipped: ${selector}`);
    return;
  }
  el.text(value);
}

function setHtml($, selector, value) {
  if (value === undefined) return;
  const el = $(selector).first();
  if (el.length === 0) {
    console.warn(`Warning: selector not found, skipped: ${selector}`);
    return;
  }
  el.html(value);
}

// The info card's date column is narrow, so the day-of-week and month are
// always abbreviated to maximize the chance the date fits on one line
// (e.g. "Thursday, August 20, 2026" -> "Thu, Aug 20, 2026") — a standing
// design rule, not a one-off for a specific auction.
function abbreviateDate(datePart) {
  const DAY_ABBREV = {
    Sunday: "Sun",
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
  };
  const MONTH_ABBREV = {
    January: "Jan",
    February: "Feb",
    March: "Mar",
    April: "Apr",
    May: "May",
    June: "Jun",
    July: "Jul",
    August: "Aug",
    September: "Sep",
    October: "Oct",
    November: "Nov",
    December: "Dec",
  };
  let out = datePart;
  for (const [full, abbrev] of Object.entries(DAY_ABBREV)) out = out.replace(full, abbrev);
  for (const [full, abbrev] of Object.entries(MONTH_ABBREV)) out = out.replace(full, abbrev);
  return out;
}

// Splits "Thursday, August 20, 2026 · 10:00 AM PT" onto two lines (date,
// then time), abbreviating the day/month to save space, and glues the
// last word (timezone) to the time with a non-breaking space, so it never
// wraps onto its own line.
function formatClosingDateTime(value) {
  if (!value) return value;
  const parts = value.split(" · ");
  if (parts.length !== 2) return value;
  const [datePart, timePart] = parts;
  const gluedTime = timePart.replace(/ (\S+)$/, "&nbsp;$1");
  return `${abbreviateDate(datePart)}<br>${gluedTime}`;
}

// Breaks a short value onto two lines before its last word (e.g. "By
// Appointment Only" -> "By Appointment<br>Only") so it wraps at a sensible
// word boundary instead of however the narrow info-card column happens to
// wrap it. Only kicks in for values actually likely to need it.
function breakBeforeLastWord(value, threshold = 14) {
  if (!value) return value;
  if (value.length <= threshold) return value;
  const lastSpace = value.lastIndexOf(" ");
  if (lastSpace === -1) return value;
  return `${value.slice(0, lastSpace)}<br>${value.slice(lastSpace + 1)}`;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}
