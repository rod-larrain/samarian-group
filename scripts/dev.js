// Local preview with the dashboard API: node scripts/dev.js [port]
// Set ADMIN_PASSWORD, GITHUB_TOKEN (and optionally GITHUB_BRANCH) in the environment to use /admin.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 4330);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain",
};

// Send the same headers Vercel does (from vercel.json), so the security policy is tested locally too
const rules = JSON.parse(await readFile(join(root, "vercel.json"), "utf8")).headers
  .map(r => ({ test: new RegExp(`^${r.source}$`), headers: r.headers }));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  for (const r of rules) if (r.test.test(url.pathname)) for (const h of r.headers) res.setHeader(h.key, h.value);
  res.setHeader("Cache-Control", "no-store");
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, "");
      const { default: handler } = await import(join(root, "api", `${name}.js`));
      return await handler(req, res);
    }
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) throw Object.assign(new Error("outside"), { code: "ENOENT" });
    if ((await stat(path)).isDirectory()) {
      if (!url.pathname.endsWith("/")) { res.writeHead(301, { Location: `${url.pathname}/` }); return res.end(); }
      path = join(path, "index.html");
    }
    res.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
    res.end(await readFile(path));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(e);
    res.statusCode = e.code === "ENOENT" ? 404 : 500;
    if (e.code !== "ENOENT") return res.end("Server error");
    res.setHeader("Content-Type", types[".html"]);
    res.end(await readFile(join(root, "404.html")).catch(() => "Not found"));
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
