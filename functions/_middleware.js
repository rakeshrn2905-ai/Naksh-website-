/**
 * Runs in front of EVERY request (pages, scripts, videos, photos, API).
 *
 * Cloudflare Access is the login gate. It sits in front of the site and only lets
 * through people whose email is on the allow-list. This file is a second,
 * independent check: it verifies the signed login token that Access attaches
 * to each request, and refuses the request if the token is missing, forged,
 * expired, issued for another site, or belongs to an email not on our own list.
 * If Access is ever switched off or misconfigured, nothing is served.
 *
 * Settings (Cloudflare dashboard → Pages project → Settings → Variables):
 *   ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
 *   ACCESS_AUD          the "Application Audience (AUD) Tag" of the Access app
 *   ALLOWED_EMAILS      comma-separated emails allowed to view the site
 *   ADMIN_EMAILS        comma-separated emails allowed to upload (usually just yours)
 */

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Strict-Transport-Security": "max-age=31536000",
};

const list = (s) =>
  String(s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

function deny(status, message) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0a0f;color:#f6eef2;font:16px system-ui,sans-serif;text-align:center;padding:16px">
<div><h1 style="font-weight:600">This site is private</h1><p style="color:#b8a9b2">${message}</p></div>`;
  const res = new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

/* ── Access token verification ─────────────────────────────── */

const decoder = new TextDecoder();
const b64url = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

let certCache = { team: "", at: 0, keys: [] };
async function signingKeys(team, force) {
  if (!force && certCache.team === team && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("Could not load Access signing keys");
  const { keys } = await res.json();
  certCache = { team, at: Date.now(), keys: keys || [] };
  return certCache.keys;
}

async function verifyAccessToken(token, team, aud) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, p, s] = parts;
  const header = JSON.parse(decoder.decode(b64url(h)));
  if (header.alg !== "RS256") throw new Error("unexpected algorithm");

  let jwk = (await signingKeys(team)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await signingKeys(team, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown signing key");

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("bad signature");

  const claims = JSON.parse(decoder.decode(b64url(p)));
  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) throw new Error("token is for a different application");
  if (claims.iss !== `https://${team}`) throw new Error("token from a different team");
  if (typeof claims.exp !== "number" || claims.exp < now - 30) throw new Error("token expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) throw new Error("token not yet valid");
  return claims;
}

function readToken(request) {
  const fromHeader = request.headers.get("Cf-Access-Jwt-Assertion");
  if (fromHeader) return fromHeader;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : "";
}

/* ── Middleware ────────────────────────────────────────────── */

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // Local testing only: never active on a real web address.
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (isLocal && env.DEV_SKIP_AUTH === "true") {
    data.email = env.DEV_EMAIL || "dev@localhost";
    data.isAdmin = true;
  } else {
    const team = String(env.ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const aud = String(env.ACCESS_AUD || "").trim();
    const allowed = list(env.ALLOWED_EMAILS);
    if (!team || !aud || !allowed.length) {
      return deny(503, "The login isn't set up yet, so nothing is shown.");
    }
    const token = readToken(request);
    if (!token) return deny(403, "Please open the site from its normal address so you can log in.");
    let claims;
    try {
      claims = await verifyAccessToken(token, team, aud);
    } catch {
      return deny(403, "Your login couldn't be confirmed. Close this tab and open the site again.");
    }
    const email = String(claims.email || "").toLowerCase();
    if (!email || !allowed.includes(email)) {
      return deny(403, "This account doesn't have access.");
    }
    data.email = email;
    data.isAdmin = list(env.ADMIN_EMAILS).includes(email);
  }

  // The upload page itself is for admins only.
  if (/^\/upload(\.html|\.js)?\/?$/.test(url.pathname) && !data.isAdmin) {
    return deny(403, "Only the site owner can add videos and photos.");
  }

  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  // Keep private content out of shared caches; browsers may still keep media for a while.
  if (!url.pathname.startsWith("/media/")) out.headers.set("Cache-Control", "private, no-cache");
  out.headers.append("Vary", "Cookie");
  return out;
}
