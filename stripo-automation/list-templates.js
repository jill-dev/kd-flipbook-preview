import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, ".env"));

const token = process.env.STRIPO_API_TOKEN;
if (!token) {
  console.error("Missing STRIPO_API_TOKEN in .env");
  process.exit(1);
}

const BASE = "https://my.stripo.email/emailgeneration/v1";

async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Stripo-Api-Auth": token },
  });
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  }
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

const folders = await api("/folders/TEMPLATE");
console.log("=== Template folders ===");
for (const f of folders) console.log(`  [${f.id}] ${f.name}`);

const { data: templates, total } = await api("/templates?limit=100");
console.log(`\n=== Templates (${total} total) ===`);
for (const t of templates) {
  const folder = folders.find((f) => f.id === t.folderId);
  console.log(
    `[templateId ${t.templateId}] "${t.name}" — folder: ${folder ? folder.name : t.folderId} — updated: ${t.updatedTime}`
  );
  console.log(`  editor: ${t.editorUrl}`);
}
