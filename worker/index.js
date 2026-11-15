// Entry point when the site runs as a Cloudflare Worker.
//
// wrangler.jsonc sets "run_worker_first": true, so EVERY request (pages, scripts,
// videos, photos, API) comes here first and must pass the login check in
// functions/_middleware.js before anything is served.

import { onRequest as middleware } from "../functions/_middleware.js";
import { onRequestGet as libraryGet } from "../functions/api/library.js";
import { onRequestPost as uploadPost, onRequestPut as uploadPut } from "../functions/api/upload.js";
import { onRequestGet as mediaGet, onRequestHead as mediaHead } from "../functions/media/[[path]].js";

const notAllowed = () => new Response("Method not allowed", { status: 405 });

function route(context) {
  const { request, env } = context;
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === "/api/library") return method === "GET" ? libraryGet(context) : notAllowed();
  if (pathname === "/api/upload") {
    if (method === "POST") return uploadPost(context);
    if (method === "PUT") return uploadPut(context);
    return notAllowed();
  }
  if (pathname.startsWith("/media/")) {
    if (method === "GET") return mediaGet(context);
    if (method === "HEAD") return mediaHead(context);
    return notAllowed();
  }
  if (pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

  // Everything else is a page, script or style from the public/ folder.
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const context = {
      request,
      env,
      data: {},
      waitUntil: ctx.waitUntil.bind(ctx),
      next: () => route(context),
    };
    return middleware(context);
  },
};
