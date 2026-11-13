// Shared rules for which files the site will store and serve.

export const VIDEO_TYPES = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
export const PHOTO_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
};

export const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
export const kindOf = (key) => {
  const ext = extOf(key);
  if (VIDEO_TYPES[ext]) return "video";
  if (PHOTO_TYPES[ext]) return "photo";
  return null;
};
export const contentTypeOf = (key) => VIDEO_TYPES[extOf(key)] || PHOTO_TYPES[extOf(key)] || "application/octet-stream";

/** A storage key the site is willing to serve: known file type, no hidden parts, no tricks. */
export function isServableKey(key) {
  if (!key || key.length > 512) return false;
  const parts = key.split("/");
  if (parts.length > 2) return false;
  if (parts.some((p) => !p || p.startsWith(".") || p.startsWith("_") || p.includes("\\"))) return false;
  return kindOf(key) !== null;
}

/** Make a safe folder or file name from what the uploader typed. */
export function cleanName(s, max = 80) {
  return String(s || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f/\\?#%*:|"<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[._\s]+/, "")
    .slice(0, max)
    .trim();
}
