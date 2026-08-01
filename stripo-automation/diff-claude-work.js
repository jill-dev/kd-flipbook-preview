import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, ".env"));

const token = process.env.STRIPO_API_TOKEN;
const BASE = "https://my.stripo.email/emailgeneration/v1";

async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Stripo-Api-Auth": token },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

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

const ids = [4542217, 4542246, 4542255, 4542366];

for (const id of ids) {
  const t = await api(`/raw-template/${id}`);
  const hash = createHash("sha256").update(t.html + t.css).digest("hex").slice(0, 12);
  writeFileSync(join(__dirname, `raw-${id}.html`), t.html);
  console.log(`[${id}] html length=${t.html.length} css length=${(t.css || "").length} hash=${hash}`);
}
