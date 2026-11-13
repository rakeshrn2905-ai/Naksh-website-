// Lists everything in storage and turns it into rows for the home page.
//
// How files are organised in storage:
//   <Folder>/<YYYY-MM-DD> <Title>.mp4        a video (the folder becomes a row, e.g. "2015")
//   <Folder>/<YYYY-MM-DD> <Title>.poster.jpg its thumbnail (made automatically on upload)
//   <Folder>/<YYYY-MM-DD> <Title>.jpg        a photo
// The date and title are optional; a description is kept with the file itself.

import { extOf, kindOf, isServableKey } from "../../lib/media.js";

const POSTER_SUFFIX = /\.poster\.jpg$/i;

function parseName(file) {
  const base = file.replace(/\.[^.]+$/, "");
  const m = base.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+|$)(.*)$/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, title: m[4].trim() };
  return { date: "", title: base.replace(/[_]+/g, " ").trim() };
}

function folderSort(a, b) {
  const ya = /^\d{4}$/.test(a), yb = /^\d{4}$/.test(b);
  if (ya && yb) return Number(a) - Number(b);
  if (ya !== yb) return ya ? -1 : 1;
  return a.localeCompare(b);
}

export async function onRequestGet({ env, data }) {
  if (!env.MEDIA) return Response.json({ error: "Storage is not connected" }, { status: 500 });

  const objects = [];
  let cursor;
  do {
    const page = await env.MEDIA.list({ cursor, limit: 1000, include: ["customMetadata"] });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const posters = new Set(objects.filter((o) => POSTER_SUFFIX.test(o.key)).map((o) => o.key));
  const folders = new Map();
  let featured = null;

  for (const o of objects) {
    if (!isServableKey(o.key) || POSTER_SUFFIX.test(o.key)) continue;
    const kind = kindOf(o.key);
    const slash = o.key.indexOf("/");
    const folder = slash > 0 ? o.key.slice(0, slash) : "";
    const file = slash > 0 ? o.key.slice(slash + 1) : o.key;
    const { date, title } = parseName(file);
    const meta = o.customMetadata || {};
    const item = {
      key: o.key,
      kind,
      ext: extOf(o.key),
      title,
      date,
      folder,
      description: meta.description || "",
      size: o.size,
      uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : "",
    };
    if (kind === "video") {
      const poster = o.key.replace(/\.[^.]+$/, ".poster.jpg");
      if (posters.has(poster)) item.poster = poster;
      if (meta.featured === "1" && (!featured || item.uploaded > featured.uploaded)) featured = item;
    }
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder).push(item);
  }

  const out = [...folders.keys()].sort(folderSort).map((name) => ({
    name,
    items: folders
      .get(name)
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.uploaded.localeCompare(b.uploaded)),
  }));

  return Response.json(
    { folders: out, featured: featured ? featured.key : null, isAdmin: Boolean(data.isAdmin) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
