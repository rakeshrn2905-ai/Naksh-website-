// Upload and delete endpoints, used by the /upload page. Admins only.
//
// Small files are sent in one request; big videos are sent in 25 MB pieces
// (R2 "multipart upload"), so there is no practical size limit and a weak
// connection only has to resend one piece.

import { VIDEO_TYPES, PHOTO_TYPES, contentTypeOf, isServableKey, cleanName, kindOf } from "../../lib/media.js";

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function guard(request, data) {
  if (!data.isAdmin) return json({ error: "Only the site owner can upload." }, 403);
  // Blocks other websites from sending requests with her login (a custom header forces a CORS check).
  if (request.headers.get("X-Upload") !== "1") return json({ error: "Missing upload header." }, 400);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Wrong origin." }, 403);
  return null;
}

function readMeta(request) {
  try {
    const raw = request.headers.get("X-Meta");
    const m = raw ? JSON.parse(decodeURIComponent(raw)) : {};
    const meta = {};
    if (m.description) meta.description = String(m.description).slice(0, 600);
    if (m.featured) meta.featured = "1";
    return meta;
  } catch {
    return {};
  }
}

async function uniqueKey(env, folder, base, ext) {
  for (let i = 1; i < 200; i++) {
    const name = i === 1 ? base : `${base} (${i})`;
    const key = folder ? `${folder}/${name}.${ext}` : `${name}.${ext}`;
    if (!(await env.MEDIA.head(key))) return key;
  }
  throw new Error("Too many files with that name");
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const blocked = guard(request, data);
  if (blocked) return blocked;
  if (!env.MEDIA) return json({ error: "Storage is not connected." }, 500);

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const key = url.searchParams.get("key") || "";

  if (action === "plan") {
    // Decide the storage name for a new file.
    const body = await request.json().catch(() => ({}));
    const ext = String(body.ext || "").toLowerCase();
    if (!VIDEO_TYPES[ext] && !PHOTO_TYPES[ext]) return json({ error: `.${ext} files aren't supported.` }, 400);
    const folder = cleanName(body.folder, 40);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : "";
    // No title typed: with a date, the date is enough (the site shows it as the title).
    const title = cleanName(body.title, 100) || (date ? "" : cleanName(body.originalName, 100) || "Untitled");
    const base = cleanName(date ? `${date} ${title}` : title, 120);
    const newKey = await uniqueKey(env, folder, base, ext);
    if (!isServableKey(newKey)) return json({ error: "That name can't be used." }, 400);
    return json({ key: newKey });
  }

  if (!isServableKey(key)) return json({ error: "Bad file name." }, 400);

  if (action === "mpu-create") {
    const mpu = await env.MEDIA.createMultipartUpload(key, {
      httpMetadata: { contentType: contentTypeOf(key) },
      customMetadata: readMeta(request),
    });
    return json({ uploadId: mpu.uploadId });
  }

  if (action === "mpu-complete" || action === "mpu-abort") {
    const uploadId = url.searchParams.get("uploadId") || "";
    const mpu = env.MEDIA.resumeMultipartUpload(key, uploadId);
    if (action === "mpu-abort") {
      await mpu.abort().catch(() => {});
      return json({ ok: true });
    }
    const { parts } = await request.json();
    await mpu.complete(parts);
    return json({ ok: true, key });
  }

  if (action === "delete") {
    await env.MEDIA.delete([key, key.replace(/\.[^.]+$/, ".poster.jpg")]);
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
}

export async function onRequestPut(context) {
  const { request, env, data } = context;
  const blocked = guard(request, data);
  if (blocked) return blocked;
  if (!env.MEDIA) return json({ error: "Storage is not connected." }, 500);

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const key = url.searchParams.get("key") || "";
  if (!isServableKey(key)) return json({ error: "Bad file name." }, 400);
  if (!request.body) return json({ error: "Empty upload." }, 400);

  if (action === "put") {
    const isPoster = /\.poster\.jpg$/i.test(key);
    if (isPoster) {
      const videoExists = await Promise.all(
        Object.keys(VIDEO_TYPES).map((ext) => env.MEDIA.head(key.replace(/\.poster\.jpg$/i, `.${ext}`)))
      );
      if (!videoExists.some(Boolean)) return json({ error: "Thumbnail has no matching video." }, 400);
    } else if (await env.MEDIA.head(key)) {
      return json({ error: "A file with that name already exists." }, 409);
    }
    await env.MEDIA.put(key, request.body, {
      httpMetadata: { contentType: contentTypeOf(key) },
      customMetadata: isPoster ? {} : readMeta(request),
    });
    return json({ ok: true, key, kind: kindOf(key) });
  }

  if (action === "mpu-part") {
    const uploadId = url.searchParams.get("uploadId") || "";
    const part = Number(url.searchParams.get("part"));
    if (!Number.isInteger(part) || part < 1 || part > 10000) return json({ error: "Bad part number." }, 400);
    const mpu = env.MEDIA.resumeMultipartUpload(key, uploadId);
    const uploaded = await mpu.uploadPart(part, request.body);
    return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
  }

  return json({ error: "Unknown action." }, 400);
}
