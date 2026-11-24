(() => {
  "use strict";

  const SITE = window.SITE || {};
  const $ = (sel) => document.querySelector(sel);

  /* ── Library (loaded from private storage after login) ───── */
  let FOLDERS = [];  // [{ name, items: [...] }]
  let ITEMS = [];    // every item, in story order
  let VIDEOS = [];
  let byKey = new Map();
  let FEATURED = null;
  let IS_ADMIN = false;

  const mediaUrl = (key) => "/media/" + key.split("/").map(encodeURIComponent).join("/");
  const folderLabel = (name) => name || "More";
  const caption = (name) => (SITE.folderCaptions || {})[name] || "";

  /* ── Saved state (this device only) ──────────────────────── */
  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
  const KEY_PROGRESS = "aoy.progress";
  const KEY_LIST = "aoy.list";
  const KEY_WELCOMED = "aoy.welcomed";

  let progress = store.get(KEY_PROGRESS, {}); // { key: { t, d, at } }
  let myList = store.get(KEY_LIST, []);       // [key, ...]

  const pct = (k) => { const p = progress[k]; return p && p.d ? Math.min(100, (p.t / p.d) * 100) : 0; };
  const resumeTime = (k) => { const p = progress[k]; return p && p.t > 5 && p.d && p.t < p.d - 10 ? p.t : 0; };
  const inList = (k) => myList.includes(k);
  const toggleList = (k) => {
    myList = inList(k) ? myList.filter((x) => x !== k) : [k, ...myList];
    store.set(KEY_LIST, myList);
  };

  /* ── Helpers ─────────────────────────────────────────────── */
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const fmtDate = (s) => {
    if (!s) return "";
    const d = new Date(s + "T00:00:00");
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  };
  const fmtDur = (sec) => {
    if (!sec || !isFinite(sec)) return "";
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m${s ? " " + s + "s" : ""}` : `${s}s`;
  };
  const titleOf = (v) => v.title || fmtDate(v.date) || (v.kind === "photo" ? "Photo" : "Video");
  // Video lengths, remembered once any player has loaded them.
  const durations = store.get("aoy.durations", {});
  const rememberDuration = (v, d) => {
    if (!d || !isFinite(d) || durations[v.key] === Math.round(d)) return;
    durations[v.key] = Math.round(d);
    store.set("aoy.durations", durations);
  };
  const durationOf = (v) => (progress[v.key] && progress[v.key].d) || durations[v.key] || 0;
  const hue = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const tileBg = (v) => {
    const h = hue(v.key);
    return `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 50) % 360} 50% 18%))`;
  };

  // Thumbnail: the stored poster, the photo itself, or a frame grabbed from the video.
  function thumb(v, { eager } = {}) {
    if (v.kind === "photo" || v.poster) {
      const img = el("img");
      img.alt = "";
      img.decoding = "async";
      if (!eager) img.loading = "lazy";
      img.src = mediaUrl(v.kind === "photo" ? v.key : v.poster);
      img.onerror = () => img.replaceWith(tile(v));
      return img;
    }
    const wrap = el("div", "tile-wrap");
    wrap.append(tile(v));
    frameObserver.observe(wrap);
    wrap._video = v;
    return wrap;
  }
  function tile(v) {
    const t = el("div", "tile", titleOf(v));
    t.style.background = tileBg(v);
    return t;
  }
  const frameObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      frameObserver.unobserve(e.target);
      const fv = el("video", "frame");
      Object.assign(fv, { muted: true, playsInline: true, preload: "metadata" });
      const v = e.target._video;
      fv.src = mediaUrl(v.key) + "#t=1.5";
      fv.addEventListener("loadeddata", () => {
        fv.classList.add("on");
        rememberDuration(v, fv.duration);
        if (IS_ADMIN && !v.poster) savePoster(v, fv);
      }, { once: true });
      e.target.append(fv);
    });
  }, { rootMargin: "200px" });

  // Owner only: a video uploaded without a thumbnail gets one made from this frame,
  // so every viewer sees a proper picture from then on.
  const posterTried = new Set();
  function savePoster(v, fv) {
    if (posterTried.has(v.key) || !fv.videoWidth) return;
    posterTried.add(v.key);
    try {
      const w = Math.min(1280, fv.videoWidth);
      const h = Math.round((w * fv.videoHeight) / fv.videoWidth);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(fv, 0, 0, w, h);
      c.toBlob(async (blob) => {
        if (!blob || blob.size < 2000) return; // skip blank frames
        const posterKey = v.key.replace(/\.[^.]+$/, ".poster.jpg");
        const res = await fetch("/api/upload?" + new URLSearchParams({ action: "put", key: posterKey }), {
          method: "PUT", body: blob, credentials: "same-origin", headers: { "X-Upload": "1" },
        }).catch(() => null);
        if (res && res.ok) v.poster = posterKey;
      }, "image/jpeg", 0.82);
    } catch {}
  }

  function setStatus(msg) {
    const s = $("#status");
    s.textContent = msg || "";
    s.hidden = !msg;
  }

  /* ── Load ────────────────────────────────────────────────── */
  async function loadLibrary() {
    let res;
    try {
      res = await fetch("/api/library", { credentials: "same-origin", redirect: "manual", cache: "no-store" });
    } catch {
      setStatus("Couldn't reach the site. Check your internet connection and reload.");
      return false;
    }
    // Login expired: Access redirects to its login page, so reload to log in again.
    if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) {
      location.reload();
      return false;
    }
    if (!res.ok) {
      setStatus("Something went wrong loading the videos. Please reload the page.");
      return false;
    }
    const data = await res.json();
    FOLDERS = (data.folders || []).filter((f) => f.items && f.items.length);
    ITEMS = FOLDERS.flatMap((f) => f.items);
    VIDEOS = ITEMS.filter((i) => i.kind === "video");
    byKey = new Map(ITEMS.map((i) => [i.key, i]));
    FEATURED = byKey.get(data.featured) || VIDEOS[0] || ITEMS[0] || null;
    IS_ADMIN = Boolean(data.isAdmin);
    // Forget saved progress for files that were removed.
    myList = myList.filter((k) => byKey.has(k));
    return true;
  }

  /* ── Welcome screen ──────────────────────────────────────── */
  function welcome(onOpen) {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY_WELCOMED) === "1"; } catch {}
    if (seen) return onOpen();

    const answer = String(SITE.answer || "").trim().toLowerCase();
    $("#gate").hidden = false;
    $("#gate-title").textContent = SITE.welcomeTitle || "Welcome";
    $("#gate-message").textContent = SITE.welcomeMessage || "";
    const input = $("#gate-input");
    if (answer && SITE.question) {
      $("#gate-question").textContent = SITE.question;
      $("#gate-question").hidden = false;
      input.hidden = false;
      input.focus();
    } else {
      $("#gate-form .btn").focus();
    }
    $("#gate-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const ok = !answer || !SITE.question || input.value.trim().toLowerCase() === answer;
      if (ok) {
        try { sessionStorage.setItem(KEY_WELCOMED, "1"); } catch {}
        $("#gate").hidden = true;
        onOpen();
      } else {
        $("#gate-error").textContent = "Not quite. Try again ❤";
        const card = $(".gate-card");
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
        input.select();
      }
    });
  }

  /* ── Hover preview card (computers only) ─────────────────── */
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  let previewMuted = true;   // starts silent; the speaker button turns sound on for all previews
  let pop = null, popTimer = null;

  function iconBtn(cls, label, text) {
    const b = el("button", "round-btn " + cls, text);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    return b;
  }
  const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>';
  const muteIcon = (m) => SPEAKER + (m
    ? '<path d="m16 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>'
    : '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>');

  function schedulePop(card, v, group) {
    clearTimeout(popTimer);
    popTimer = setTimeout(() => openPop(card, v, group), 500);
  }
  function cancelPop() { clearTimeout(popTimer); }
  function closePop() {
    clearTimeout(popTimer);
    if (!pop) return;
    const p = pop;
    pop = null;
    const vid = p.querySelector("video");
    if (vid) { vid.pause(); vid.removeAttribute("src"); vid.load(); }
    p.classList.remove("open");
    setTimeout(() => p.remove(), 200);
  }

  function openPop(card, v, group) {
    closePop();
    if (!document.body.contains(card)) return;
    const r = card.getBoundingClientRect();
    const w = Math.min(Math.max(r.width * 1.55, 320), window.innerWidth - 32);
    const mediaH = (w * 9) / 16;
    const left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - 16 - w));
    const top = Math.max(8, r.top + r.height / 2 - mediaH / 2);

    const p = el("div", "pop");
    p.style.width = w + "px";
    p.style.left = left + window.scrollX + "px";
    p.style.top = top + window.scrollY + "px";
    p.style.transformOrigin = `${r.left + r.width / 2 - left}px ${r.top + r.height / 2 - top}px`;

    const play = () => { closePop(); v.kind === "photo" ? openLightbox(v, group) : openPlayer(v); };

    // Picture / playing preview
    const media = el("div", "pop-media");
    media.append(thumb(v, { eager: true }));
    let vid = null;
    if (v.kind === "video") {
      vid = el("video", "pop-video");
      Object.assign(vid, { muted: previewMuted, loop: true, playsInline: true, autoplay: true, preload: "auto" });
      vid.src = mediaUrl(v.key);
      vid.addEventListener("playing", () => vid.classList.add("on"), { once: true });
      vid.addEventListener("loadedmetadata", () => { rememberDuration(v, vid.duration); fillMeta(); }, { once: true });
      media.append(vid);
      vid.play().catch(() => {});
      const mute = iconBtn("pop-mute", "Sound on or off", "");
      mute.innerHTML = muteIcon(previewMuted);
      mute.onclick = (e) => {
        e.stopPropagation();
        previewMuted = !previewMuted;
        vid.muted = previewMuted;
        mute.innerHTML = muteIcon(previewMuted);
        if (!previewMuted) vid.play().catch(() => {});
      };
      media.append(mute);
    }
    media.addEventListener("click", play);

    // Buttons
    const body = el("div", "pop-body");
    const actions = el("div", "pop-actions");
    const playBtn = iconBtn("primary", v.kind === "photo" ? "View photo" : resumeTime(v.key) ? "Resume" : "Play", "");
    playBtn.append(el("span", "play-ico"));
    playBtn.onclick = play;
    actions.append(playBtn);
    if (v.kind === "video") {
      const listBtn = iconBtn("", inList(v.key) ? "Remove from My List" : "Add to My List", inList(v.key) ? "✓" : "+");
      listBtn.onclick = () => {
        toggleList(v.key);
        listBtn.textContent = inList(v.key) ? "✓" : "+";
        listBtn.title = inList(v.key) ? "Remove from My List" : "Add to My List";
        listBtn.setAttribute("aria-label", listBtn.title);
      };
      actions.append(listBtn);
    }
    actions.append(el("span", "pop-spacer"));
    if (v.kind === "video") {
      const more = iconBtn("", "More info", "⌄");
      more.onclick = () => { closePop(); openModal(v); };
      actions.append(more);
    }

    const title = el("div", "pop-title", titleOf(v));
    const meta = el("div", "pop-meta");
    function fillMeta() {
      meta.innerHTML = "";
      if (v.kind === "video" && resumeTime(v.key)) {
        meta.append(el("span", "pop-left", `${fmtDur(durationOf(v) - progress[v.key].t)} left`));
      } else if (durationOf(v)) {
        meta.append(el("span", null, fmtDur(durationOf(v))));
      }
      if (v.date && v.title) meta.append(el("span", null, fmtDate(v.date)));
      meta.append(el("span", "pill", folderLabel(v.folder)));
      if (v.kind === "photo") meta.append(el("span", null, "Photo"));
    }
    fillMeta();
    body.append(actions, title, meta);
    if (v.description) body.append(el("p", "pop-desc", v.description));
    const p100 = v.kind === "video" ? pct(v.key) : 0;
    if (p100 > 0) {
      const bar = el("div", "progress"); const fill = el("span");
      fill.style.width = p100 + "%"; bar.append(fill); media.append(bar);
    }

    p.append(media, body);
    p.addEventListener("mouseleave", closePop);
    document.body.append(p);
    pop = p;
    requestAnimationFrame(() => p.classList.add("open"));
  }
  window.addEventListener("scroll", closePop, { passive: true });
  window.addEventListener("resize", closePop);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });

  /* ── Cards ───────────────────────────────────────────────── */
  function card(v, { sub, group } = {}) {
    const c = el("div", "card" + (v.kind === "photo" ? " is-photo" : ""));
    c.tabIndex = 0;
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", `${v.kind === "photo" ? "Photo" : "Video"}: ${titleOf(v)}`);
    c.append(thumb(v));

    const info = el("div", "card-info");
    info.append(el("div", "card-title", titleOf(v)));
    const subText = sub ?? (v.title && v.date ? fmtDate(v.date) : "");
    if (subText) info.append(el("div", "card-sub", subText));
    c.append(info);

    if (v.kind === "photo") {
      c.append(el("span", "badge", "Photo"));
    } else {
      const p = pct(v.key);
      if (p > 0) {
        const bar = el("div", "progress"); const fill = el("span");
        fill.style.width = p + "%"; bar.append(fill); c.append(bar);
      }
    }

    // On a computer, resting the mouse on a card opens the bigger preview card.
    if (canHover) {
      c.addEventListener("mouseenter", () => schedulePop(c, v, group));
      c.addEventListener("mouseleave", cancelPop);
    }

    const open = () => (v.kind === "photo" ? openLightbox(v, group) : openModal(v));
    c.addEventListener("click", open);
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    return c;
  }

  function row(title, sub, list, opts) {
    if (!list.length) return null;
    const r = el("section", "row");
    const head = el("div", "row-head");
    head.append(el("h2", null, title));
    if (sub) head.append(el("p", "row-caption", sub));
    r.append(head);
    const track = el("div", "row-track");
    const photos = list.filter((v) => v.kind === "photo");
    list.forEach((v) => track.append(card(v, { group: photos, ...(opts ? opts(v) : {}) })));
    const left = el("button", "row-arrow left", "‹");
    const right = el("button", "row-arrow right", "›");
    left.setAttribute("aria-label", "Scroll left");
    right.setAttribute("aria-label", "Scroll right");
    left.onclick = () => track.scrollBy({ left: -track.clientWidth * 0.85 });
    right.onclick = () => track.scrollBy({ left: track.clientWidth * 0.85 });
    r.append(left, track, right);
    return r;
  }

  /* ── Home page ───────────────────────────────────────────── */
  function renderHero() {
    const hero = $("#hero");
    hero.innerHTML = "";
    const v = FEATURED;
    const content = el("div", "hero-content");
    if (!v) {
      hero.classList.add("hero-empty");
      content.append(el("div", "hero-tag", "Coming soon"));
      content.append(el("h1", null, SITE.siteName || "All Our Yesterdays"));
      content.append(el("p", null, IS_ADMIN
        ? "Nothing here yet. Add your first videos and photos on the Upload page."
        : "The videos are on their way. Check back soon."));
      if (IS_ADMIN) {
        const a = el("a", "btn btn-primary", "Upload videos and photos");
        a.href = "upload.html";
        content.append(a);
      }
      hero.append(content);
      return;
    }
    hero.classList.remove("hero-empty");
    const media = el("div", "hero-media");
    media.append(thumb(v, { eager: true }));
    if (v.kind === "video" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const bg = el("video");
      Object.assign(bg, { muted: true, loop: true, playsInline: true, autoplay: true });
      bg.src = mediaUrl(v.key);
      bg.addEventListener("playing", () => bg.classList.add("on"), { once: true });
      media.append(bg);
    }
    content.append(el("div", "hero-tag", [folderLabel(v.folder), v.date ? fmtDate(v.date) : ""].filter(Boolean).join(" · ")));
    content.append(el("h1", null, titleOf(v)));
    if (v.description) content.append(el("p", null, v.description));
    const actions = el("div", "hero-actions");
    const play = el("button", "btn btn-primary");
    if (v.kind === "video") {
      play.append(el("span", "play-ico"), resumeTime(v.key) ? "Resume" : "Play");
      play.onclick = () => openPlayer(v);
      const more = el("button", "btn btn-ghost", "More info");
      more.onclick = () => openModal(v);
      actions.append(play, more);
    } else {
      play.textContent = "View photo";
      play.onclick = () => openLightbox(v);
      actions.append(play);
    }
    content.append(actions);
    hero.append(media, content);
  }

  function renderRows() {
    const rows = $("#rows");
    rows.innerHTML = "";

    const continuing = Object.entries(progress)
      .filter(([k]) => byKey.has(k) && resumeTime(k))
      .sort((a, b) => b[1].at - a[1].at)
      .map(([k]) => byKey.get(k));
    const listed = myList.map((k) => byKey.get(k)).filter(Boolean);

    const sections = [
      row("Continue Watching", "", continuing, (v) => ({ sub: `${fmtDur(durationOf(v) - progress[v.key].t)} left` })),
      row("My List", "", listed),
      ...FOLDERS.map((f) => row(folderLabel(f.name), caption(f.name), f.items)),
    ];
    sections.filter(Boolean).forEach((s) => rows.append(s));
  }

  /* ── Views: home / my list / search ──────────────────────── */
  let view = "home";
  function showView(name, query = "") {
    view = name;
    document.querySelectorAll(".nav-links a[data-go]").forEach((a) => a.classList.toggle("active", a.dataset.go === name));
    const home = name === "home";
    $("#hero").hidden = !home;
    $("#rows").hidden = !home;
    $("#grid-view").hidden = home;
    if (home) { renderHero(); renderRows(); return; }

    let list, title, empty;
    if (name === "list") {
      list = myList.map((k) => byKey.get(k)).filter(Boolean);
      title = "My List";
      empty = "Nothing here yet. Tap “+ My List” on any video to save it here.";
    } else {
      const q = query.toLowerCase();
      list = ITEMS.filter((v) =>
        [v.title, v.description, v.folder, caption(v.folder), v.date, fmtDate(v.date)].join(" ").toLowerCase().includes(q)
      );
      title = `Results for “${query}”`;
      empty = "Nothing matches that search.";
    }
    $("#grid-title").textContent = title;
    const grid = $("#grid");
    grid.innerHTML = "";
    const photos = list.filter((v) => v.kind === "photo");
    list.forEach((v) => grid.append(card(v, { group: photos })));
    $("#grid-empty").textContent = empty;
    $("#grid-empty").hidden = list.length > 0;
  }
  const refresh = () => {
    if (view === "search") showView("search", $("#search").value.trim());
    else showView(view);
  };

  /* ── Video details ───────────────────────────────────────── */
  let modalVideo = null;
  function openModal(v) {
    closePop();
    stopModalPreview();
    modalVideo = v;
    const img = $("#modal-img");
    const media = $(".modal-media");
    if (v.poster) { img.src = mediaUrl(v.poster); img.hidden = false; media.style.background = ""; }
    else { img.hidden = true; img.removeAttribute("src"); media.style.background = tileBg(v); }

    // The video itself plays at the top of the popup.
    const pv = el("video", "modal-preview");
    Object.assign(pv, { muted: previewMuted, loop: true, playsInline: true, autoplay: true, preload: "auto" });
    pv.src = mediaUrl(v.key) + (resumeTime(v.key) ? `#t=${Math.floor(resumeTime(v.key))}` : "");
    pv.addEventListener("playing", () => pv.classList.add("on"), { once: true });
    pv.addEventListener("loadedmetadata", () => rememberDuration(v, pv.duration), { once: true });
    pv.addEventListener("click", () => openPlayer(v));
    const mute = iconBtn("modal-mute", "Sound on or off", "");
    mute.innerHTML = muteIcon(previewMuted);
    mute.onclick = () => {
      previewMuted = !previewMuted;
      pv.muted = previewMuted;
      mute.innerHTML = muteIcon(previewMuted);
      if (!previewMuted) pv.play().catch(() => {});
    };
    media.append(pv, mute);
    pv.play().catch(() => {});
    $("#modal-title").textContent = titleOf(v);

    const meta = $("#modal-meta");
    meta.innerHTML = "";
    if (v.date && v.title) meta.append(el("span", null, fmtDate(v.date)));
    if (durationOf(v)) meta.append(el("span", null, fmtDur(durationOf(v))));
    meta.append(el("span", "pill", folderLabel(v.folder)));

    $("#modal-desc").textContent = v.description || "";
    $("#modal-desc").hidden = !v.description;
    $("#modal-play-label").textContent = resumeTime(v.key) ? "Resume" : "Play";
    updateListBtn();

    const more = VIDEOS.filter((x) => x.folder === v.folder && x.key !== v.key);
    const moreBox = $("#modal-more");
    moreBox.innerHTML = "";
    more.forEach((x) => moreBox.append(card(x)));
    $("#modal-more-title").textContent = `More from ${folderLabel(v.folder)}`;
    $("#modal-more-title").hidden = !more.length;

    $("#modal").hidden = false;
    $("#modal").scrollTop = 0;
    document.body.classList.add("no-scroll");
    $("#modal-play").focus({ preventScroll: true });
  }
  function stopModalPreview() {
    document.querySelectorAll(".modal-media video, .modal-media .modal-mute").forEach((n) => {
      if (n.tagName === "VIDEO") { n.pause(); n.removeAttribute("src"); n.load(); }
      n.remove();
    });
  }
  function closeModal() {
    stopModalPreview();
    $("#modal").hidden = true;
    if ($("#lightbox").hidden && $("#player").hidden) document.body.classList.remove("no-scroll");
    modalVideo = null;
  }
  function updateListBtn() {
    if (modalVideo) $("#modal-list").textContent = inList(modalVideo.key) ? "✓  In My List" : "+  My List";
  }

  /* ── Photo viewer ────────────────────────────────────────── */
  let lbList = [], lbIndex = 0, lbTouchX = null;
  function openLightbox(v, group) {
    lbList = group && group.length ? group : ITEMS.filter((x) => x.kind === "photo" && x.folder === v.folder);
    lbIndex = Math.max(0, lbList.indexOf(v));
    $("#lightbox").hidden = false;
    document.body.classList.add("no-scroll");
    showPhoto();
    $("#lb-close").focus({ preventScroll: true });
  }
  function showPhoto() {
    const v = lbList[lbIndex];
    if (!v) return;
    $("#lb-img").src = mediaUrl(v.key);
    $("#lb-img").alt = titleOf(v);
    $("#lb-title").textContent = titleOf(v);
    $("#lb-sub").textContent = [v.title && v.date ? fmtDate(v.date) : "", v.description, lbList.length > 1 ? `${lbIndex + 1} of ${lbList.length}` : ""]
      .filter(Boolean).join(" · ");
    $("#lb-prev").hidden = $("#lb-next").hidden = lbList.length < 2;
    // Load the next photo in advance so swiping feels instant.
    const next = lbList[(lbIndex + 1) % lbList.length];
    if (next && next !== v) new Image().src = mediaUrl(next.key);
  }
  const stepPhoto = (d) => { if (lbList.length > 1) { lbIndex = (lbIndex + d + lbList.length) % lbList.length; showPhoto(); } };
  function closeLightbox() {
    $("#lightbox").hidden = true;
    $("#lb-img").removeAttribute("src");
    if ($("#modal").hidden && $("#player").hidden) document.body.classList.remove("no-scroll");
  }
  $("#lb-prev").onclick = () => stepPhoto(-1);
  $("#lb-next").onclick = () => stepPhoto(1);
  $("#lb-close").onclick = closeLightbox;
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });
  $("#lightbox").addEventListener("touchstart", (e) => { lbTouchX = e.touches[0].clientX; }, { passive: true });
  $("#lightbox").addEventListener("touchend", (e) => {
    if (lbTouchX == null) return;
    const dx = e.changedTouches[0].clientX - lbTouchX;
    lbTouchX = null;
    if (Math.abs(dx) > 50) stepPhoto(dx < 0 ? 1 : -1);
  });

  /* ── Player ──────────────────────────────────────────────── */
  const video = $("#video");
  const player = $("#player");
  let current = null, lastSave = 0, idleTimer, nextTimer;

  function openPlayer(v) {
    closePop();
    closeModal();
    cancelNext();
    player.classList.remove("zoom-in"); void player.offsetWidth; player.classList.add("zoom-in");
    video.muted = false;
    video.addEventListener("loadedmetadata", () => rememberDuration(v, video.duration), { once: true });
    current = v;
    $("#player-title").textContent = titleOf(v);
    player.hidden = false;
    document.body.classList.add("no-scroll");
    document.querySelectorAll(".hero-media video").forEach((b) => b.pause());

    const start = resumeTime(v.key);
    video.poster = v.poster ? mediaUrl(v.poster) : "";
    video.src = mediaUrl(v.key);
    video.addEventListener("loadedmetadata", () => { if (start) video.currentTime = start; }, { once: true });
    video.play().catch(() => {});
    if (player.requestFullscreen && matchMedia("(max-width: 900px)").matches) {
      player.requestFullscreen().catch(() => {});
    }
    poke();
  }

  function saveProgress(force) {
    if (!current || !video.duration || !isFinite(video.duration)) return;
    const now = Date.now();
    if (!force && now - lastSave < 3000) return;
    lastSave = now;
    progress[current.key] = { t: video.currentTime, d: video.duration, at: now };
    store.set(KEY_PROGRESS, progress);
  }

  function closePlayer() {
    saveProgress(true);
    cancelNext();
    video.pause();
    video.removeAttribute("src");
    video.load();
    current = null;
    player.hidden = true;
    document.body.classList.remove("no-scroll");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    refresh();
  }

  // Next video in story order (the rest of this year, then on into the next).
  const nextAfter = (v) => VIDEOS[VIDEOS.indexOf(v) + 1] || null;

  function showNext() {
    const n = nextAfter(current);
    if (!n) return;
    $("#next-title").textContent = titleOf(n);
    const img = $("#next-img");
    if (n.poster) { img.src = mediaUrl(n.poster); img.hidden = false; } else img.hidden = true;
    let count = 8;
    $("#next-count").textContent = count;
    $("#next-up").hidden = false;
    $("#next-play").onclick = () => openPlayer(n);
    nextTimer = setInterval(() => {
      count -= 1;
      $("#next-count").textContent = count;
      if (count <= 0) openPlayer(n);
    }, 1000);
  }
  function cancelNext() {
    clearInterval(nextTimer);
    $("#next-up").hidden = true;
  }

  function poke() {
    player.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!video.paused) player.classList.add("idle"); }, 2500);
  }

  video.addEventListener("timeupdate", () => saveProgress(false));
  video.addEventListener("pause", () => { saveProgress(true); poke(); });
  video.addEventListener("ended", () => {
    if (current) { delete progress[current.key]; store.set(KEY_PROGRESS, progress); }
    player.classList.remove("idle");
    showNext();
  });
  video.addEventListener("contextmenu", (e) => e.preventDefault());
  ["mousemove", "touchstart", "keydown"].forEach((e) => player.addEventListener(e, poke, { passive: true }));
  $("#player-back").onclick = closePlayer;
  $("#next-cancel").onclick = cancelNext;
  window.addEventListener("pagehide", () => saveProgress(true));

  /* ── Wiring ──────────────────────────────────────────────── */
  async function start() {
    $("#app").hidden = false;
    setStatus("Loading…");
    const ok = await loadLibrary();
    if (!ok) return;
    setStatus("");
    $("#nav-upload").hidden = !IS_ADMIN;
    showView("home");
  }

  document.querySelectorAll("[data-site-name]").forEach((n) => (n.textContent = SITE.siteName || "All Our Yesterdays"));
  document.title = SITE.siteName || "All Our Yesterdays";
  $("#footer-message").textContent = SITE.welcomeMessage || "Made with love";

  document.querySelectorAll("[data-go]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      $("#search").value = "";
      showView(a.dataset.go);
      window.scrollTo({ top: 0 });
    })
  );

  let searchTimer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => (q ? showView("search", q) : showView("home")), 200);
  });

  $("#modal").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  $("#modal-play").onclick = () => modalVideo && openPlayer(modalVideo);
  $("#modal-list").onclick = () => {
    if (!modalVideo) return;
    toggleList(modalVideo.key);
    updateListBtn();
    const keep = modalVideo;
    refresh();
    modalVideo = keep;
  };

  document.addEventListener("keydown", (e) => {
    if (!$("#lightbox").hidden) {
      if (e.key === "ArrowRight") stepPhoto(1);
      else if (e.key === "ArrowLeft") stepPhoto(-1);
      else if (e.key === "Escape") closeLightbox();
      return;
    }
    if (e.key !== "Escape") return;
    if (!player.hidden) closePlayer();
    else if (!$("#modal").hidden) closeModal();
  });

  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("solid", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  welcome(start);
})();
