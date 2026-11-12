// Rebuilds the pages from content/site.json: node scripts/build.js
import { readFile, writeFile } from "node:fs/promises";
import { renderSite } from "../lib/render.js";

const root = new URL("../", import.meta.url);
const content = JSON.parse(await readFile(new URL("content/site.json", root), "utf8"));
for (const [path, html] of Object.entries(renderSite(content))) {
  await writeFile(new URL(path, root), html);
  console.log("wrote", path);
}
