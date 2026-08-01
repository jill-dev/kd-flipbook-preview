// Builds a KD Machinery marketing email from just ref numbers + a headline
// (Jill's own imagined input), pulling each machine's name/type/specs/photo/
// link straight from kdmachinery.com by ref # (= WooCommerce SKU), for
// either of Jill's two approved designs, scaled to any number of machines.
//
// Usage: node generate-machinery-email.js <campaign-slug>
// Reads:  campaigns/<campaign-slug>/campaign.json
//   {
//     "style": "1machine" | "newer",
//     "headline": "MUST MOVE!!",
//     "subheadline": "Once in a lifetime deal",   // only used by "newer" style
//     "contactName": "SEAN REID",  // optional -- omit to auto-detect from the machines' assigned salesman (see sales-team.json); falls back to "US" / main line if machines belong to different reps
//     "contactPhone": "480.212.0570",  // optional, same auto-detect rule as contactName
//     "campaignName": "must-move",
//     "specPriority": ["Table Width", "Table Length", "Spindle Horsepower", "Tool Changer"],  // optional: reorder spec lines to lead with these
//     "immediateNeeds": { "heading": "IMMEDIATE NEEDS!!!!", "items": ["...", "..."] },  // optional -- whole card removed if not given
//     "machines": [
//       { "refNumber": "8078645", "status": "UNDER POWER!!", "pricing": "offer" },  // status only used by "1machine" style; pricing: "normal" (default) | "offer" (strikethrough + MAKE AN OFFER)
//       { "refNumber": "8078650" }
//     ]
//   }
// Each machine's "Watch Video" button is added/removed automatically based
// on whether kdmachinery.com has a video for that listing -- no campaign.json
// field needed for it.
// Writes: output/<campaign-slug>.html

import { load } from "cheerio";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lookupMachine, splitAttrLines, prioritizeAttrLines } from "./lookup-machine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const salesTeam = JSON.parse(readFileSync(join(__dirname, "sales-team.json"), "utf8"));

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node generate-machinery-email.js <campaign-slug>");
  process.exit(1);
}

const campaignDir = join(__dirname, "campaigns", slug);
const campaign = JSON.parse(readFileSync(join(campaignDir, "campaign.json"), "utf8"));

if (!["1machine", "newer"].includes(campaign.style)) {
  console.error(`campaign.json "style" must be "1machine" or "newer", got: ${campaign.style}`);
  process.exit(1);
}
if (!campaign.machines || campaign.machines.length === 0) {
  console.error("campaign.json needs at least one entry in \"machines\".");
  process.exit(1);
}

const masterFile = campaign.style === "1machine" ? "master-1machine.html" : "master-newer.html";
const anchorAlt = campaign.style === "1machine" ? "[MACHINE 1 — Year Make Model]" : "[Machine 1 — description]";

const html = readFileSync(join(__dirname, masterFile), "utf8");
const $ = load(html, { decodeEntities: false });

// --- look up every machine before touching the DOM ---
// Some ref #s may have sold or been pulled off the site since the salesman
// sent the list -- skip those instead of aborting the whole campaign.
console.log(`Looking up ${campaign.machines.length} machine(s) on kdmachinery.com...`);
const machines = [];
const skipped = [];
for (const m of campaign.machines) {
  const data = await lookupMachine(m.refNumber);
  if (!data) {
    skipped.push(m.refNumber);
    console.log(`  [${m.refNumber}] NOT FOUND -- skipping (sold or removed from the site)`);
    continue;
  }
  machines.push({ ...data, status: m.status || "", pricing: m.pricing || "normal" });
  console.log(`  [${data.refNumber}] ${data.yearMakeModel} - $${data.price}`);
}
if (machines.length === 0) {
  console.error("None of the ref #s in this campaign were found. Aborting.");
  process.exit(1);
}

// --- auto-detect the contact if not explicitly given: if every found
// machine belongs to the same salesman, use their name + direct line;
// otherwise (mixed reps, or an unrecognized rep code) fall back to "US"
// and the main line. ---
let contactName = campaign.contactName;
let contactPhone = campaign.contactPhone;
if (!contactName || !contactPhone) {
  const reps = new Set(machines.map((m) => m.repInitials).filter(Boolean));
  const rep = reps.size === 1 ? salesTeam[[...reps][0]] : null;
  const resolved = rep || salesTeam.US;
  contactName = contactName || resolved.name;
  contactPhone = contactPhone || resolved.directLine;
  console.log(
    reps.size === 1 && rep
      ? `Contact auto-detected: ${resolved.name} (${resolved.directLine})`
      : `Contact auto-detected: mixed or unrecognized reps (${[...reps].join(", ") || "none"}) -- using "${resolved.name}" / ${resolved.directLine}`
  );
}

// --- header fields ---
replaceText($, "[EMAIL_SUBJECT_LINE]", `${machines.map((m) => m.yearMakeModel).join(", ")} - ${campaign.headline}`);
replaceText($, "[CAMPAIGN_NAME]", campaign.campaignName || slug);
replaceText($, "[EMAIL_HEADLINE]", campaign.headline || "");
if (campaign.style === "newer") {
  replaceText($, "[EMAIL_SUBHEADLINE]", campaign.subheadline || "");
}
replaceText($, "[CONTACT_NAME]", contactName || "");
replaceText($, "[CONTACT_PHONE]", contactPhone || "");

// --- immediate needs card (optional -- remove the whole section if unused) ---
if (campaign.immediateNeeds) {
  replaceText($, "[IMMEDIATE_NEEDS_HEADING]", campaign.immediateNeeds.heading || "IMMEDIATE NEEDS");
  const itemsHtml = (campaign.immediateNeeds.items || []).map(esc).join("<br>");
  replaceHtml($, "[IMMEDIATE_NEEDS_LIST]", itemsHtml);
} else {
  $('p:contains("[IMMEDIATE_NEEDS_HEADING]")').closest("td.esd-structure").closest("tr").remove();
}

// --- machine card(s) ---
const $anchorImg = $(`img[alt="${anchorAlt}"]`);
if ($anchorImg.length !== 1) {
  console.error(`Expected exactly 1 built-in card in ${masterFile}, found ${$anchorImg.length}. Aborting -- template may have changed.`);
  process.exit(1);
}
const $cardRow = $anchorImg.closest("td.esd-block-spacer").closest("tr");

let $insertAfter = $cardRow;
for (let i = 1; i < machines.length; i++) {
  const $clone = $cardRow.clone();
  $insertAfter.after($clone);
  $insertAfter = $clone;
}

const allCardRows = $(`img[alt="${anchorAlt}"]`)
  .toArray()
  .map((el) => $(el).closest("td.esd-block-spacer").closest("tr"));

allCardRows.forEach(($row, i) => {
  const m = machines[i];
  const orderedAttrs = prioritizeAttrLines(m.attrLines, campaign.specPriority);
  // "1machine" style keeps a separate Features section (~75% of attrs to
  // Specifications, the rest to Features); "newer" has no Features section,
  // so all attrs flow into one continuous Specifications block.
  const [specsText, featuresText] = splitAttrLines(orderedAttrs, campaign.style === "1machine" ? 0.75 : 1);

  // capture the video link before the generic href overwrite below would
  // clobber its placeholder href and make it unfindable
  const $videoLink = $row.find('a[href="[MACHINE_1_VIDEO_URL]"]');

  $row.find("img").attr("src", m.photoUrl).attr("alt", m.yearMakeModel);
  $row.find("a").not($videoLink).attr("href", m.linkUrl);

  // tall/vertical photos look oversized at the card's full width -- narrow
  // them and center them in their cell instead
  if (m.isPortrait) {
    const $img = $row.find("img");
    $img.attr("width", "420");
    $img.attr("style", $img.attr("style").replace(/width:\s*\d+px/, "width:420px"));
  }

  replaceTextIn($row, "[MACHINE_1_YEAR_MAKE_MODEL]", m.yearMakeModel);
  replaceTextIn($row, "[MACHINE_1_TYPE]", m.type);
  replaceTextIn($row, "[MACHINE_1_REF]", m.refNumber);
  replaceHtmlIn($row, "[PRICE_DISPLAY]", priceDisplay(m));
  replaceTextIn($row, "[MACHINE_1_SPECS]", specsText);
  if (campaign.style === "1machine") {
    // no status phrase for this machine -- drop the badge row rather than
    // show an empty blue pill, and move its top spacing onto the name row
    // so the card doesn't look cramped underneath the photo
    // .closest("tr") from the status <p> would stop at the small badge
    // table's own single-row <tr>, not the outer card row -- go via the
    // outer "esd-block-text" td first.
    const $statusRow = $row.find('p:contains("[MACHINE_1_STATUS]")').closest("td.esd-block-text").closest("tr");
    if (m.status) {
      replaceTextIn($row, "[MACHINE_1_STATUS]", m.status);
    } else {
      const $nameTd = $statusRow.next("tr").find("td.esd-block-text").first();
      $nameTd.attr("style", $nameTd.attr("style").replace("padding:0 20px;", "padding:18px 20px 0;"));
      $statusRow.remove();
    }
    replaceTextIn($row, "[MACHINE_1_FEATURES]", featuresText);
  }

  // video callout: fill it in if this machine has a video, otherwise
  // remove the whole row so no dead "Watch Video" button ever ships.
  if (m.videoUrl) {
    $videoLink.attr("href", m.videoUrl);
  } else {
    $videoLink.closest("tr").remove();
  }
});

mkdirSync(join(__dirname, "output"), { recursive: true });
const outPath = join(__dirname, "output", `${slug}.html`);
writeFileSync(outPath, $.html());
console.log(`Wrote ${outPath} (${machines.length} machine${machines.length === 1 ? "" : "s"}, style=${campaign.style})`);

function formatPrice(raw) {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "normal" -> plain price. "offer" -> price struck through + "MAKE AN OFFER"
// (Mike Basham's "slash through price / bring offers" request).
function priceDisplay(m) {
  const formatted = `$${formatPrice(m.price)}`;
  if (m.pricing === "offer") {
    return `<s>${formatted}</s> &nbsp; MAKE AN OFFER`;
  }
  return formatted;
}

// Replaces a literal [TOKEN] wherever it appears as text in the whole doc.
function replaceText($, token, value) {
  const html = $.root().html();
  $.root().html(html.split(token).join(esc(value)));
}

// Like replaceText, but `value` is already-safe HTML (e.g. a joined <br>
// list) and should be inserted as-is, not escaped.
function replaceHtml($, token, value) {
  const html = $.root().html();
  $.root().html(html.split(token).join(value));
}

// Replaces a literal [TOKEN] only within one already-selected row (used for
// per-machine fields so machine 2's data can't leak into machine 1's row).
function replaceTextIn($row, token, value) {
  const html = $row.parent().html();
  // Cheerio doesn't expose a scoped raw-html setter, so walk text nodes instead.
  $row.find("*").addBack().contents().each((_, node) => {
    if (node.type === "text" && node.data.includes(token)) {
      node.data = node.data.split(token).join(String(value));
    }
  });
  // Also cover the token appearing inside href attributes.
  $row.find("[href]").each((_, el) => {
    const href = el.attribs.href;
    if (href && href.includes(token)) el.attribs.href = href.split(token).join(String(value));
  });
}

// Like replaceTextIn, but injects real HTML (e.g. <s>...</s>) instead of
// escaped text -- used for [PRICE_DISPLAY], which needs a strikethrough tag.
function replaceHtmlIn($row, token, htmlValue) {
  $row.find("*").addBack().contents().each((_, node) => {
    if (node.type === "text" && node.data.includes(token)) {
      const idx = node.data.indexOf(token);
      const before = esc(node.data.slice(0, idx));
      const after = esc(node.data.slice(idx + token.length));
      $(node).replaceWith(`${before}${htmlValue}${after}`);
    }
  });
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
