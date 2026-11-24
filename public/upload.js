(() => {
  "use strict";

  const SITE = window.SITE || {};
  const $ = (sel) => document.querySelector(sel);
  const PART = 25 * 1024 * 1024; // bigger files go up in 25 MB pieces
  const VIDEO_EXT = ["mp4", "m4v", "mov", "webm"];
  const PHOTO_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic"];

  document.querySelectorAll("[data-site-name]").forEach((n) => (n.textContent = SITE.siteName || "All Our Yesterdays"));

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  const mb = (n) => (n / 1024 / 1024 >= 1000 ? (n / 1024 / 1024 / 1024).toFixed(1) + " GB" : Math.max(0.1, n / 1024 / 1024).toFixed(1) + " MB");
  const mediaUrl = (key) => "/media/" + key.split("/").map(encodeURIComponent).join("/");

  /* ── Talking to the server ───────────────────────────────── */
  async function call(method, params, body, extraHeaders = {}) {
    const res = await fetch("/api/upload?" + new URLSearchParams(params), {
      method,
      body,
      credentials: "same-origin",
      redirect: "manual",
      headers: { "X-Upload": "1", ...extraHeaders },
    });
    if (res.type === "opaqueredirect") throw new Error("Your login expired. Reload the page and log in again.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The server said no (${res.status}).`);
    return data;
  }

  // PUT with an upload progress callback (fetch can't report upload progress).
  function put(params, blob, meta, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", "/api/upload?" + new URLSearchParams(params));
      xhr.setRequestHeader("X-Upload", "1");
      if (meta) xhr.setRequestHeader("X-Meta", encodeURIComponent(JSON.stringify(meta)));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("Connection problem."));
      xhr.send(blob);
    });
  }

  async function retry(fn, tries = 3) {
    for (let i = 1; ; i++) {
      try { return await fn(); }
      catch (e) {
        if (i >= tries || /login expired|said no|Only the site owner/.test(e.message)) throw e;
        await new Promise((r) => setTimeout(r, 1500 * i));
      }
    }
  }

  async function uploadBlob(key, blob, meta, onProgress) {
    if (blob.size <= PART) {
      return retry(() => put({ action: "put", key }, blob, meta, onProgress));
    }
    const { uploadId } = await call("POST", { action: "mpu-create", key }, null, {
      "X-Meta": encodeURIComponent(JSON.stringify(meta || {})),
    });
    const parts = [];
    try {
      for (let i = 0, n = 1; i < blob.size; i += PART, n++) {
        const chunk = blob.slice(i, i + PART);
        const done = i;
        const part = await retry(() =>
          put({ action: "mpu-part", key, uploadId, part: n }, chunk, null, (loaded) => onProgress(done + loaded))
        );
        parts.push(part);
      }
      await call("POST", { action: "mpu-complete", key, uploadId }, JSON.stringify({ parts }), {
        "Content-Type": "application/json",
      });
    } catch (e) {
      call("POST", { action: "mpu-abort", key, uploadId }).catch(() => {});
      throw e;
    }
  }

  /* ── Preparing files in the browser ──────────────────────── */
  function videoPoster(file) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(file);
      let finished = false;
      const finish = (blob) => {
        if (finished) return;
        finished = true;
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      Object.assign(v, { muted: true, playsInline: true, preload: "auto", src: url });
      v.onloadedmetadata = () => { v.currentTime = Math.min(2, (v.duration || 6) / 3); };
      v.onseeked = () => {
        if (!v.videoWidth) return finish(null);
        const w = Math.min(1280, v.videoWidth);
        const h = Math.round((w * v.videoHeight) / v.videoWidth);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(v, 0, 0, w, h);
        c.toBlob((b) => finish(b), "image/jpeg", 0.82);
      };
      v.onerror = () => finish(null);
      setTimeout(() => finish(null), 20000);
    });
  }

  async function smallerPhoto(file) {
    // Shrinks big photos to at most 2560px on the long side. Keeps the original if that fails
    // (for example, HEIC photos on browsers that can't read them).
    if (!["jpg", "jpeg", "png", "webp"].includes(extOf(file.name)) || file.size < 1.5 * 1024 * 1024) return null;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
      return blob && blob.size < file.size ? blob : null;
    } catch {
      return null;
    }
  }

  function guessDate(file) {
    const m = file.name.match(/(20\d{2}|19\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
    if (file.lastModified) return new Date(file.lastModified).toISOString().slice(0, 10);
    return "";
  }
  function guessTitle(file) {
    const base = file.name.replace(/\.[^.]+$/, "");
    if (/^(IMG|VID|PXL|DSC|MOV|MVI|DCIM|Screenshot|WhatsApp)/i.test(base) || /^\d+$/.test(base)) return "";
    return base.replace(/[_]+/g, " ").replace(/(19|20)\d{2}[-_.]?\d{2}[-_.]?\d{2}/, "").trim();
  }

  /* ── The form ────────────────────────────────────────────── */
  let entries = []; // { file, kind, row elements }
  const list = $("#up-list");

  function renderEntries() {
    list.innerHTML = "";
    entries.forEach((e, i) => {
      const li = el("li", "up-item");
      const thumb = el("div", "up-thumb");
      if (e.kind === "photo") {
        const img = el("img"); img.alt = ""; img.src = e.preview; thumb.append(img);
      } else {
        thumb.append(el("span", null, "▶"));
      }
      const fields = el("div", "up-fields");
      const name = el("div", "up-name", `${e.file.name} · ${mb(e.file.size)}`);
      const t = el("input"); t.placeholder = "Title (optional)"; t.value = e.title; t.maxLength = 100;
      t.id = `up-title-${i}`; t.setAttribute("aria-label", `Title for ${e.file.name}`);
      t.oninput = () => (e.title = t.value);
      const d = el("input"); d.type = "date"; d.value = e.date; d.id = `up-date-${i}`;
      d.setAttribute("aria-label", `Date for ${e.file.name}`);
      d.oninput = () => (e.date = d.value);
      const desc = el("textarea"); desc.rows = 2; desc.maxLength = 600; desc.placeholder = "A line about this moment (optional)";
      desc.id = `up-desc-${i}`; desc.setAttribute("aria-label", `Description for ${e.file.name}`);
      desc.value = e.description; desc.oninput = () => (e.description = desc.value);
      const row = el("div", "up-row"); row.append(t, d);
      fields.append(name, row, desc);
      if (e.kind === "video") {
        const lab = el("label", "up-check");
        const cb = el("input"); cb.type = "checkbox"; cb.checked = e.featured; cb.id = `up-feat-${i}`;
        cb.onchange = () => (e.featured = cb.checked);
        lab.append(cb, " Show this as the big video at the top");
        fields.append(lab);
      }
      const bar = el("div", "up-progress"); bar.append(el("span"));
      const state = el("div", "up-state", e.state || "");
      fields.append(bar, state);
      const remove = el("button", "icon-btn up-remove", "✕");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${e.file.name}`);
      remove.onclick = () => { entries.splice(i, 1); renderEntries(); };
      li.append(thumb, fields, remove);
      e.li = li; e.bar = bar.firstChild; e.stateEl = state;
      list.append(li);
    });
    $("#up-go").disabled = !entries.length;
    $("#up-summary").textContent = entries.length
      ? `${entries.length} file${entries.length > 1 ? "s" : ""}, ${mb(entries.reduce((s, e) => s + e.file.size, 0))}`
      : "";
  }

  $("#up-files").addEventListener("change", (ev) => {
    for (const file of ev.target.files) {
      const ext = extOf(file.name);
      const kind = VIDEO_EXT.includes(ext) ? "video" : PHOTO_EXT.includes(ext) ? "photo" : null;
      if (!kind) { alertInline(`${file.name}: this type of file isn't supported.`); continue; }
      entries.push({
        file, kind, title: guessTitle(file), date: guessDate(file), description: "", featured: false,
        preview: kind === "photo" ? URL.createObjectURL(file) : "",
      });
    }
    ev.target.value = "";
    renderEntries();
  });

  function alertInline(msg) {
    $("#up-summary").textContent = msg;
  }

  $("#up-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const folder = $("#up-folder").value.trim();
    const go = $("#up-go");
    go.disabled = true;
    $("#up-files").disabled = true;
    let ok = 0, failed = 0;

    for (const e of entries.filter((x) => !x.done)) {
      e.li.classList.add("busy");
      const setState = (s) => (e.stateEl.textContent = e.state = s);
      try {
        let blob = e.file, ext = extOf(e.file.name);
        if (e.kind === "photo" && $("#up-resize").checked) {
          setState("Preparing…");
          const small = await smallerPhoto(e.file);
          if (small) { blob = small; ext = "jpg"; }
        }
        const { key } = await call("POST", { action: "plan" }, JSON.stringify({
          folder, title: e.title, date: e.date, ext, originalName: e.file.name.replace(/\.[^.]+$/, ""),
        }), { "Content-Type": "application/json" });

        setState("Uploading…");
        await uploadBlob(key, blob, { description: e.description.trim(), featured: e.featured }, (loaded) => {
          const p = Math.min(100, (loaded / blob.size) * 100);
          e.bar.style.width = p + "%";
          setState(`Uploading… ${Math.floor(p)}%`);
        });

        if (e.kind === "video") {
          setState("Making thumbnail…");
          const poster = await videoPoster(e.file);
          if (poster) await put({ action: "put", key: key.replace(/\.[^.]+$/, ".poster.jpg") }, poster).catch(() => {});
        }
        e.bar.style.width = "100%";
        e.done = true;
        e.li.classList.add("done");
        setState("Uploaded ✓");
        ok++;
      } catch (err) {
        e.li.classList.add("failed");
        setState(`Didn't upload: ${err.message}`);
        failed++;
      }
      e.li.classList.remove("busy");
    }

    entries = entries.filter((x) => !x.done);
    $("#up-files").disabled = false;
    go.disabled = !entries.length;
    $("#up-summary").textContent = failed
      ? `${ok} uploaded, ${failed} didn't. The ones that didn't are still listed; press Upload to try them again.`
      : `${ok} uploaded. They're on the site now.`;
    // Keep failed items on screen with their messages.
    if (failed) list.querySelectorAll(".up-item.done").forEach((n) => n.remove());
    else list.innerHTML = "";
    loadExisting();
  });

  /* ── What's already uploaded (with delete) ───────────────── */
  async function loadExisting() {
    const box = $("#up-existing");
    let data;
    try {
      const res = await fetch("/api/library", { credentials: "same-origin", redirect: "manual", cache: "no-store" });
      if (res.type === "opaqueredirect") return location.reload();
      data = await res.json();
    } catch {
      box.textContent = "Couldn't load the list. Reload the page to try again.";
      return;
    }
    if (!data.isAdmin) {
      document.querySelector(".up-main").innerHTML =
        '<h1 class="up-title">Upload</h1><p class="up-lead">Only the site owner can add videos and photos.</p>';
      return;
    }
    const folders = data.folders || [];
    const dl = $("#up-folders");
    dl.innerHTML = "";
    const names = new Set(folders.map((f) => f.name).filter(Boolean));
    [...names].sort().forEach((n) => { const o = el("option"); o.value = n; dl.append(o); });

    box.innerHTML = "";
    $("#up-existing-empty").hidden = folders.some((f) => f.items.length);
    folders.forEach((f) => {
      const sec = el("div", "up-folder");
      const ul = el("ul", "up-files");
      f.items.forEach((it) => {
        const li = el("li");
        const a = el("a", null, (it.kind === "video" ? "▶ " : "◻ ") + (it.title || (it.kind === "video" ? "Untitled video" : "Untitled photo")));
        a.href = mediaUrl(it.key);
        a.target = "_blank";
        a.rel = "noopener";
        const meta = el("span", "up-meta", mb(it.size));
        const del = el("button", "btn btn-ghost btn-sm", "Delete");
        del.type = "button";
        let armed = false;
        del.onclick = async () => {
          if (!armed) {
            armed = true;
            del.textContent = "Tap again to delete";
            del.classList.add("danger");
            setTimeout(() => { armed = false; del.textContent = "Delete"; del.classList.remove("danger"); }, 4000);
            return;
          }
          del.disabled = true;
          try {
            await call("POST", { action: "delete", key: it.key });
            li.remove();
          } catch (err) {
            del.textContent = "Couldn't delete";
          }
        };
        li.append(a, meta, del);
        ul.append(li);
      });
      sec.append(ul);
      box.append(sec);
    });
  }

  window.addEventListener("beforeunload", (e) => {
    if (document.querySelector(".up-item.busy")) { e.preventDefault(); e.returnValue = ""; }
  });

  loadExisting();
})();
