// Shared-password sign-in for the dashboard, kept in a signed, HTTP-only cookie.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "sg_admin";
const TTL = 12 * 60 * 60; // seconds

const sha = s => createHash("sha256").update(s).digest();
// Changing the password (or the GitHub token) signs everyone out
const key = () => sha(`${process.env.ADMIN_PASSWORD}\0${process.env.GITHUB_TOKEN}`);
const sign = v => createHmac("sha256", key()).update(v).digest("hex");

export const configured = () => Boolean(process.env.ADMIN_PASSWORD && process.env.GITHUB_TOKEN);

export function passwordMatches(input) {
  return configured() && timingSafeEqual(sha(String(input ?? "")), sha(process.env.ADMIN_PASSWORD));
}

export function sessionCookie() {
  const exp = String(Math.floor(Date.now() / 1000) + TTL);
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function signedIn(req) {
  if (!configured()) return false;
  const raw = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [exp, mac] = raw.slice(COOKIE.length + 1).split(".");
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false;
  const good = Buffer.from(sign(exp)), given = Buffer.from(mac);
  return good.length === given.length && timingSafeEqual(good, given);
}

// Writes must come from this site's own pages
export function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || new URL(origin).host === req.headers.host;
}
