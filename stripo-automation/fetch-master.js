import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, ".env"));

const token = process.env.STRIPO_API_TOKEN;
const TEMPLATE_ID = 4542366;

console.warn(
  "WARNING: this overwrites master.html with whatever's currently saved in Stripo template " +
    TEMPLATE_ID +
    ". master.html has hand-applied layout fixes (spacing, footer alignment, license section, carousel " +
    "sizing) that only live in this file, not in Stripo itself — this will wipe them, and generate-email.js " +
    "output will look wrong again until they're reapplied. The previous version is being backed up to " +
    "master.html.before-fetch.bak just in case. Only run this if template " +
    TEMPLATE_ID +
    " genuinely got a new design change in Stripo's editor that needs pulling in."
);

const masterPath = join(__dirname, "master.html");
if (existsSync(masterPath)) {
  writeFileSync(join(__dirname, "master.html.before-fetch.bak"), readFileSync(masterPath));
}

const res = await fetch(`https://my.stripo.email/emailgeneration/v1/raw-template/${TEMPLATE_ID}`, {
  headers: { "Stripo-Api-Auth": token },
});
if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
const { html, css } = await res.json();

writeFileSync(masterPath, html);
if (css) writeFileSync(join(__dirname, "master.css"), css);
console.log(`Saved master.html (${html.length} bytes)${css ? ` + master.css (${css.length} bytes)` : ""}`);

function loadEnv(path) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
}
