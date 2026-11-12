import { signedIn } from "../lib/auth.js";
import { readContent } from "../lib/github.js";
import { send } from "../lib/http.js";

// The latest content straight from the repository, plus its version for conflict checks
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  if (!signedIn(req)) return send(res, 401, { error: "Please sign in." });
  try {
    return send(res, 200, await readContent());
  } catch (e) {
    console.error(e);
    return send(res, 502, { error: "Couldn't load the site content from GitHub." });
  }
}
