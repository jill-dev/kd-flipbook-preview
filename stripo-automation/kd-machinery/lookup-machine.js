// Looks up a machine on kdmachinery.com by its ref # (= WooCommerce SKU) and
// returns the fields the email templates need. Requires WOOCOMMERCE_URL,
// WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET in .env.
//
// Returns raw attrLines (Year/Make/Model excluded -- already folded into
// the name) rather than pre-grouped spec lines, since the two templates
// split them differently (master-1machine.html wants 3 spec lines + a
// separate features paragraph; master-newer.html wants 3 combined spec
// lines and no features section) -- grouping happens per-template in each
// generator via groupAttrLines() below.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { load } from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));

let env;
function loadEnv() {
  if (env) return env;
  env = {};
  const text = readFileSync(join(__dirname, ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

export async function lookupMachine(refNumber) {
  const { WOOCOMMERCE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET } = loadEnv();
  const auth = Buffer.from(`${WOOCOMMERCE_CONSUMER_KEY}:${WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${WOOCOMMERCE_URL}/wp-json/wc/v3/products?sku=${encodeURIComponent(refNumber)}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`WooCommerce lookup for ${refNumber} -> HTTP ${res.status}: ${await res.text()}`);
  const [product] = await res.json();
  if (!product) return null;

  const attrs = (product.attributes || []).filter(
    (a) => !["Year", "Make", "Model"].includes(a.name)
  );
  const attrLines = attrs.map((a) => decodeEntities(`${a.name} ${a.options.join(", ")}`));

  const meta = {};
  for (const m of product.meta_data || []) meta[m.key] = m.value;

  return {
    refNumber: product.sku,
    yearMakeModel: decodeEntities(product.name),
    type: decodeEntities(stripHtml(product.short_description)),
    price: product.price,
    photoUrl: product.images?.[0]?.src || "",
    linkUrl: product.permalink,
    attrLines,
    // WooCommerce stores a YouTube link here when the listing has a video
    // (confirmed via meta_data key "product_videos_0_video") -- lets us
    // auto-detect "this machine has a video" instead of Jill telling us.
    // The field is inconsistent across listings: sometimes a plain URL,
    // sometimes a full <iframe src="..."> embed blob -- normalize to a URL.
    videoUrl: extractVideoUrl(meta.product_videos_0_video),
    // Tall/vertical product photos look oversized at the card's full
    // width, so the generator narrows those. Originally detected from the
    // srcset's resized-variant filenames ("-WIDTHxHEIGHT.ext"), but that's
    // missing/unreliable for some images (Jill found several vertical
    // photos that stayed at full width) -- the WP media endpoint returns
    // the image's real width/height directly, no guessing.
    isPortrait: await detectPortrait(product.images?.[0]?.id, WOOCOMMERCE_URL, auth),
    // 2-letter salesman initials (e.g. "NK", "MB") -- used to auto-fill the
    // contact line when a whole campaign's machines belong to one rep.
    repInitials: meta.inventory_rep || "",
  };
}

// The raw field is wildly inconsistent across listings -- a plain
// youtube.com/watch?v= or youtu.be/ link, a full <iframe src="..."> embed
// blob (sometimes with stray leading characters, e.g. a typo'd "t" before
// the tag), or a youtube.com/shorts/ link. Whatever the source, extracting
// just the video ID and rebuilding a plain "watch?v=" URL is what actually
// works when someone clicks it in an email -- youtube.com/embed/VIDEO_ID
// is meant for <iframe> embedding, not for people to click directly, and
// behaves inconsistently (no YouTube app deep-link, stripped-down player)
// when opened as a normal link. This was Jill's "some videos not working,
// looks like the embedded-code ones" report, confirmed by auditing every
// real listing's raw field: iframe-derived entries were the only ones
// producing /embed/ links, everything else already used /watch?v= or
// youtu.be/.
function extractVideoUrl(raw) {
  if (!raw) return "";
  const iframeSrcMatch = raw.match(/src=["']([^"']+)["']/);
  const url = iframeSrcMatch ? iframeSrcMatch[1] : raw.trim();

  const idMatch =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (idMatch) return `https://www.youtube.com/watch?v=${idMatch[1]}`;

  return url.startsWith("http") ? url : "";
}

async function detectPortrait(imageId, wooCommerceUrl, auth) {
  if (!imageId) return false;
  const res = await fetch(`${wooCommerceUrl}/wp-json/wp/v2/media/${imageId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return false;
  const media = await res.json();
  const { width, height } = media.media_details || {};
  return Boolean(width && height && height > width);
}

// Splits attrLines into two continuous, comma-joined strings (no forced
// line breaks within either one -- Jill asked for the spec text to read as
// one flowing block instead of choppy <br>-separated chunks). `ratio` is
// the fraction of attrLines that goes into the first ("Specifications")
// string; the rest goes into the second ("Features").
export function splitAttrLines(attrLines, ratio) {
  const cut = Math.ceil(attrLines.length * ratio);
  return [attrLines.slice(0, cut).join(", "), attrLines.slice(cut).join(", ")];
}

// Reorders attrLines so any attribute whose name matches one of
// `priorityTerms` (case-insensitive substring match, in the given order)
// comes first -- e.g. a CNC router campaign asking to always show table
// size/spindle HP/tool changer up front, regardless of where WooCommerce
// happens to list them.
export function prioritizeAttrLines(attrLines, priorityTerms) {
  if (!priorityTerms || priorityTerms.length === 0) return attrLines;
  const remaining = [...attrLines];
  const prioritized = [];
  for (const term of priorityTerms) {
    const idx = remaining.findIndex((line) => line.toLowerCase().includes(term.toLowerCase()));
    if (idx !== -1) prioritized.push(...remaining.splice(idx, 1));
  }
  return [...prioritized, ...remaining];
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, "").trim();
}

// WooCommerce's CMS-authored text (short_description, attribute values)
// often contains literal HTML entities as source text -- e.g. a salesman
// typing 6.5' gets auto-converted by WordPress into "6.5&#8242;" (the prime
// mark). generate-machinery-email.js inserts these strings as plain text
// nodes, which cheerio then re-escapes on serialization ("&" -> "&amp;"),
// turning "&#8242;" into the literal text "&amp;#8242;" on the page instead
// of rendering as ′. Decoding entities here (once, at the source) so every
// downstream consumer already has plain Unicode text fixes it for good --
// found via Jill's screenshot showing "6.5&#8242; x 13.1&#8242; CNC
// Waterjet" instead of 6.5′ x 13.1′.
function decodeEntities(s) {
  if (!s) return s;
  return load(`<div>${s}</div>`).text();
}

// CLI usage: node lookup-machine.js 8078645
if (process.argv[1] && process.argv[1].endsWith("lookup-machine.js")) {
  const ref = process.argv[2];
  if (!ref) {
    console.error("Usage: node lookup-machine.js <ref-number>");
    process.exit(1);
  }
  const result = await lookupMachine(ref);
  console.log(JSON.stringify(result, null, 2));
}
