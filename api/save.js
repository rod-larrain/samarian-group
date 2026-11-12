import { randomBytes } from "node:crypto";
import { signedIn, sameOrigin } from "../lib/auth.js";
import { readContent, commit, CONTENT_PATH } from "../lib/github.js";
import { renderSite, slugify } from "../lib/render.js";
import { send, readJson } from "../lib/http.js";

const PHOTO_PATH = /^assets\/people\/[a-z0-9-]+\.jpg$/;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

class Invalid extends Error {}

const str = (v, label, max = 6000) => {
  if (typeof v !== "string") throw new Invalid(`${label} is missing.`);
  const s = v.replace(/\r\n?/g, "\n").trim();
  if (s.length > max) throw new Invalid(`${label} is too long.`);
  return s;
};
const required = (v, label, max) => {
  const s = str(v, label, max);
  if (!s) throw new Invalid(`${label} can't be empty.`);
  return s;
};
const blocks = (list, label) => {
  if (!Array.isArray(list) || list.length > 12) throw new Invalid(`${label} has too many items.`);
  return list.map((b, i) => ({ title: required(b?.title, `${label} ${i + 1} heading`, 200), text: str(b?.text, `${label} ${i + 1} text`) }));
};

// Rebuild the content from the editor's submission, keeping only known fields
function clean(input, previous) {
  const known = new Set(previous.people.map(p => p.photo));
  if (!Array.isArray(input?.people) || input.people.length > 40) throw new Invalid("The people list isn't valid.");
  const uploads = {};
  const people = input.people.map((p, i) => {
    const label = `Person ${i + 1}`;
    const person = { name: required(p?.name, `${label}'s name`, 120), role: str(p?.role, `${label}'s title`, 160), photo: "", bio: str(p?.bio, `${label}'s bio`, 12000) };
    if (p?.upload) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(p.upload);
      const bytes = m && Buffer.from(m[1], "base64");
      if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.length > MAX_PHOTO_BYTES) throw new Invalid(`${person.name}'s photo couldn't be read.`);
      person.photo = `assets/people/${slugify(person.name)}-${randomBytes(3).toString("hex")}.jpg`;
      uploads[person.photo] = m[1];
    } else if (typeof p?.photo === "string" && PHOTO_PATH.test(p.photo) && known.has(p.photo)) {
      person.photo = p.photo;
    } else {
      throw new Invalid(`${person.name} needs a photo.`);
    }
    return person;
  });
  const email = required(input?.contact?.email, "Email", 200);
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) throw new Invalid("The email address doesn't look right.");
  const content = {
    home: { intro: required(input?.home?.intro, "Home paragraph") },
    about: {
      intro: required(input?.about?.intro, "About introduction"),
      sections: blocks(input?.about?.sections, "About point"),
      valuesTitle: required(input?.about?.valuesTitle, "Values heading", 120),
      values: blocks(input?.about?.values, "Value"),
    },
    people,
    contact: { email, office: required(input?.contact?.office, "Office", 200) },
    referral: required(input?.referral, "Referral line", 200),
    copyright: required(input?.copyright, "Copyright line", 200),
    legal: { sections: blocks(input?.legal?.sections, "Privacy & legal section") },
    seo: Object.fromEntries(["home", "about", "people", "contact", "legal"].map(k => [k, required(input?.seo?.[k], `Search description (${k})`, 300)])),
  };
  // Old photos nobody uses any more are removed from the site
  const used = new Set(people.map(p => p.photo));
  const deletes = [...known].filter(p => PHOTO_PATH.test(p) && !used.has(p));
  return { content, uploads, deletes };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return send(res, 403, { error: "Forbidden" });
  if (!signedIn(req)) return send(res, 401, { error: "Your session has ended. Please sign in again." });
  try {
    const body = await readJson(req);
    const current = await readContent();
    if (body.sha !== current.sha) {
      return send(res, 409, { error: "Someone else saved changes since you opened the dashboard. Reload to see them, then make your edits again." });
    }
    const { content, uploads, deletes } = clean(body.content, current.content);
    const files = { [CONTENT_PATH]: { text: JSON.stringify(content, null, 2) + "\n" } };
    for (const [path, html] of Object.entries(renderSite(content))) files[path] = { text: html };
    for (const [path, base64] of Object.entries(uploads)) files[path] = { base64 };
    const result = await commit({ files, deletes, message: "Update site content from the dashboard" });
    return send(res, 200, { ok: true, commit: result.sha, content, sha: result.blobs[CONTENT_PATH] });
  } catch (e) {
    if (e instanceof Invalid) return send(res, 400, { error: e.message });
    if (e instanceof SyntaxError) return send(res, 400, { error: "The request wasn't readable." });
    console.error(e);
    return send(res, 502, { error: "Saving to GitHub failed. Nothing was changed; please try again." });
  }
}
