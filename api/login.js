import { configured, passwordMatches, sessionCookie, clearCookie, sameOrigin } from "../lib/auth.js";
import { send, readJson } from "../lib/http.js";

// POST { password } signs in; DELETE signs out
export default async function handler(req, res) {
  if (req.method === "DELETE") return send(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return send(res, 403, { error: "Forbidden" });
  if (!configured()) return send(res, 503, { error: "The dashboard isn't set up yet: ADMIN_PASSWORD and GITHUB_TOKEN are missing." });
  const { password } = await readJson(req).catch(() => ({}));
  if (!passwordMatches(password)) {
    await new Promise(r => setTimeout(r, 800)); // slow down guessing
    return send(res, 401, { error: "That password isn't right." });
  }
  return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie() });
}
