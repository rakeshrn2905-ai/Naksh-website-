// Streams a video or photo out of private storage (R2).
// Only reached after the login check in functions/_middleware.js.
// Supports "Range" requests so videos start fast and can be skipped through.

import { contentTypeOf, isServableKey } from "../../lib/media.js";

function keyFrom(request) {
  const path = new URL(request.url).pathname.replace(/^\/media\//, "");
  try {
    return path.split("/").map(decodeURIComponent).join("/");
  } catch {
    return "";
  }
}

// "bytes=100-199" → {offset:100,length:100}; "bytes=100-" → {offset:100}; "bytes=-500" → {suffix:500}
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  if (m[2] === "") return { offset };
  const end = Number(m[2]);
  return end >= offset ? { offset, length: end - offset + 1 } : null;
}

async function serve(context, withBody) {
  const { request, env } = context;
  if (!env.MEDIA) return new Response("Storage is not connected", { status: 500 });
  const key = keyFrom(request);
  if (!isServableKey(key)) return new Response("Not found", { status: 404 });

  let obj;
  try {
    obj = withBody
      ? await env.MEDIA.get(key, { range: parseRange(request.headers.get("Range")) || undefined, onlyIf: request.headers })
      : await env.MEDIA.head(key);
  } catch {
    return new Response("Requested range not available", { status: 416 });
  }
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const stored = headers.get("Content-Type");
  if (!stored || stored === "application/octet-stream" || stored.startsWith("text/")) {
    headers.set("Content-Type", contentTypeOf(key));
  }
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Content-Disposition", "inline");
  headers.delete("Content-Encoding");

  // Conditional request matched (e.g. If-None-Match): nothing new to send.
  if (withBody && !("body" in obj)) return new Response(null, { status: 304, headers });

  if (!withBody) {
    headers.set("Content-Length", String(obj.size));
    return new Response(null, { status: 200, headers });
  }

  const r = parseRange(request.headers.get("Range"));
  if (r) {
    const offset = "suffix" in r ? Math.max(0, obj.size - r.suffix) : r.offset;
    const length = "suffix" in r ? obj.size - offset : Math.min(r.length ?? obj.size - offset, obj.size - offset);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

export const onRequestGet = (context) => serve(context, true);
export const onRequestHead = (context) => serve(context, false);
