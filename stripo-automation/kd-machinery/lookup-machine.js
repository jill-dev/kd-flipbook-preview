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
  const attrLines = attrs.map((a) => `${a.name} ${a.options.join(", ")}`);

  const meta = {};
  for (const m of product.meta_data || []) meta[m.key] = m.value;

  return {
    refNumber: product.sku,
    yearMakeModel: product.name,
    type: stripHtml(product.short_description),
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
    // width, so the generator narrows those -- detected from the WordPress
    // srcset (its resized-variant filenames encode "WIDTHxHEIGHT", no need
    // to fetch/decode the image itself).
    isPortrait: detectPortrait(product.images?.[0]?.srcset),
    // 2-letter salesman initials (e.g. "NK", "MB") -- used to auto-fill the
    // contact line when a whole campaign's machines belong to one rep.
    repInitials: meta.inventory_rep || "",
  };
}

function extractVideoUrl(raw) {
  if (!raw) return "";
  const iframeMatch = raw.match(/src=["']([^"']+)["']/);
  const url = iframeMatch ? iframeMatch[1] : raw.trim();
  return url.startsWith("http") ? url : "";
}

function detectPortrait(srcset) {
  if (!srcset) return false;
  const match = srcset.match(/-(\d+)x(\d+)\.\w+/);
  if (!match) return false;
  const [, width, height] = match;
  return Number(height) > Number(width);
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
