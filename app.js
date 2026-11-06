(() => {
  "use strict";

  const SITE = window.SITE || {};
  const VIDEOS = (SITE.videos || []).filter((v) => v && v.id && v.src);
  const $ = (sel) => document.querySelector(sel);
  const byId = new Map(VIDEOS.map((v) => [v.id, v]));

  /* ── Saved state (this device only) ─────────────────────── */
  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
  const KEY_PROGRESS = "ourmovies.progress";
  const KEY_LIST = "ourmovies.list";
  const KEY_UNLOCK = "ourmovies.unlocked";

  let progress = store.get(KEY_PROGRESS, {}); // { id: { t, d, at } }
  let myList = store.get(KEY_LIST, []);       // [id, ...]

  const pct = (id) => {
    const p = progress[id];
    return p && p.d ? Math.min(100, (p.t / p.d) * 100) : 0;
  };
  const resumeTime = (id) => {
    const p = progress[id];
    return p && p.t > 5 && p.d && p.t < p.d - 10 ? p.t : 0;
  };
  const inList = (id) => myList.includes(id);
  const toggleList = (id) => {
    myList = inList(id) ? myList.filter((x) => x !== id) : [id, ...myList];
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
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m ${s ? s + "s" : ""}`.trim() : `${s}s`;
  };
  const durationOf = (v) => v.duration || (progress[v.id] && progress[v.id].d) || 0;
  const isHls = (src) => /\.m3u8(\?|#|$)/i.test(src);
  const hue = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  function thumb(v) {
    if (v.poster) {
      const img = el("img");
      img.src = v.poster; img.alt = ""; img.loading = "lazy";
      img.onerror = () => img.replaceWith(tile(v));
      return img;
    }
    return tile(v);
  }
  function tile(v) {
    const h = hue(v.id);
    const t = el("div", "tile", v.title);
    t.style.background = `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 60% 25%))`;
    return t;
  }

  /* ── Lock screen ─────────────────────────────────────────── */
  function initGate(onOpen) {
    const pw = (SITE.password || "").trim().toLowerCase();
    let unlocked = false;
    try { unlocked = sessionStorage.getItem(KEY_UNLOCK) === "1"; } catch {}
    if (!pw || unlocked) return onOpen();

    $("#gate").hidden = false;
    $("#gate-title").textContent = SITE.welcomeTitle || "Welcome";
    $("#gate-message").textContent = SITE.welcomeMessage || "";
    const input = $("#gate-input");
    input.focus();
    $("#gate-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (input.value.trim().toLowerCase() === pw) {
        try { sessionStorage.setItem(KEY_UNLOCK, "1"); } catch {}
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

  /* ── Cards ───────────────────────────────────────────────── */
  function card(v, { sub } = {}) {
    const c = el("div", "card");
    c.tabIndex = 0;
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", v.title);
    c.append(thumb(v));

    const info = el("div", "card-info");
    info.append(el("div", "card-title", v.title));
    const subText = sub || (v.date ? fmtDate(v.date) : v.category || "");
    if (subText) info.append(el("div", "card-sub", subText));
    c.append(info);

    const p = pct(v.id);
    if (p > 0) {
      const bar = el("div", "progress"); const fill = el("span");
      fill.style.width = p + "%"; bar.append(fill); c.append(bar);
    }

    // Short silent preview on hover (desktop only, .mp4 files only)
    let timer, vid;
    if (matchMedia("(hover: hover)").matches && !isHls(v.src)) {
      c.addEventListener("mouseenter", () => {
        timer = setTimeout(() => {
          vid = el("video");
          Object.assign(vid, { muted: true, loop: true, playsInline: true, src: v.src });
          vid.addEventListener("playing", () => vid.classList.add("on"), { once: true });
          c.insertBefore(vid, info);
          vid.play().catch(() => {});
        }, 700);
      });
      c.addEventListener("mouseleave", () => {
        clearTimeout(timer);
        if (vid) { vid.pause(); vid.removeAttribute("src"); vid.load(); vid.remove(); vid = null; }
      });
    }

    c.addEventListener("click", () => openModal(v));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(v); } });
    return c;
  }

  function row(title, list, opts) {
    if (!list.length) return null;
    const r = el("section", "row");
    r.append(el("h2", null, title));
    const track = el("div", "row-track");
    list.forEach((v) => track.append(card(v, opts && opts(v))));
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
    const v = VIDEOS.find((x) => x.featured) || VIDEOS[0];
    if (!v) {
      hero.append(el("div", "hero-content")).append(el("h1", null, "No videos yet"));
      return;
    }
    const media = el("div", "hero-media");
    media.append(thumb(v));
    if (!isHls(v.src) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const bg = el("video");
      Object.assign(bg, { muted: true, loop: true, playsInline: true, autoplay: true, src: v.src });
      bg.addEventListener("playing", () => bg.classList.add("on"), { once: true });
      media.append(bg);
    }
    const content = el("div", "hero-content");
    content.append(el("div", "hero-tag", v.category || "Featured"));
    content.append(el("h1", null, v.title));
    if (v.description) content.append(el("p", null, v.description));
    const actions = el("div", "hero-actions");
    const play = el("button", "btn btn-primary");
    play.innerHTML = '<span class="play-ico"></span>';
    play.append(resumeTime(v.id) ? "Resume" : "Play");
    play.onclick = () => openPlayer(v);
    const more = el("button", "btn btn-ghost", "ⓘ  More info");
    more.onclick = () => openModal(v);
    actions.append(play, more);
    content.append(actions);
    hero.append(media, content);
  }

  function renderRows() {
    const rows = $("#rows");
    rows.innerHTML = "";

    const continuing = Object.entries(progress)
      .filter(([id]) => byId.has(id) && resumeTime(id))
      .sort((a, b) => b[1].at - a[1].at)
      .map(([id]) => byId.get(id));
    const listed = myList.map((id) => byId.get(id)).filter(Boolean);
    const recent = VIDEOS.filter((v) => v.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    const sections = [
      row("Continue Watching", continuing, (v) => ({ sub: `${fmtDur(durationOf(v) - progress[v.id].t)} left` })),
      row("My List", listed),
      row("Recently Added", recent),
    ];
    const cats = [...(SITE.categories || [])];
    VIDEOS.forEach((v) => { if (v.category && !cats.includes(v.category)) cats.push(v.category); });
    cats.forEach((c) => sections.push(row(c, VIDEOS.filter((v) => v.category === c))));
    const uncategorised = VIDEOS.filter((v) => !v.category);
    sections.push(row("More Videos", uncategorised));
    sections.filter(Boolean).forEach((s) => rows.append(s));
  }

  /* ── Views: home / my list / search ──────────────────────── */
  let view = "home";
  function showView(name, query = "") {
    view = name;
    document.querySelectorAll(".nav-links a").forEach((a) => a.classList.toggle("active", a.dataset.go === name));
    const home = name === "home";
    $("#hero").hidden = !home;
    $("#rows").hidden = !home;
    $("#grid-view").hidden = home;
    if (home) { renderHero(); renderRows(); return; }

    let list, title, empty;
    if (name === "list") {
      list = myList.map((id) => byId.get(id)).filter(Boolean);
      title = "My List";
      empty = "Nothing here yet. Tap “+ My List” on any video to save it here.";
    } else {
      const q = query.toLowerCase();
      list = VIDEOS.filter((v) => [v.title, v.description, v.category, v.date].join(" ").toLowerCase().includes(q));
      title = `Results for “${query}”`;
      empty = "No videos match that search.";
    }
    $("#grid-title").textContent = title;
    const grid = $("#grid");
    grid.innerHTML = "";
    list.forEach((v) => grid.append(card(v)));
    $("#grid-empty").textContent = empty;
    $("#grid-empty").hidden = list.length > 0;
  }
  const refresh = () => {
    if (view === "search") showView("search", $("#search").value.trim());
    else showView(view);
  };

  /* ── Details popup ───────────────────────────────────────── */
  let modalVideo = null;
  function openModal(v) {
    modalVideo = v;
    const img = $("#modal-img");
    if (v.poster) { img.src = v.poster; img.hidden = false; } else { img.hidden = true; }
    $(".modal-media").style.background = v.poster ? "" : tile(v).style.background;
    $("#modal-title").textContent = v.title;

    const meta = $("#modal-meta");
    meta.innerHTML = "";
    if (v.date) meta.append(el("span", null, fmtDate(v.date)));
    if (durationOf(v)) meta.append(el("span", null, fmtDur(durationOf(v))));
    if (v.category) meta.append(el("span", "pill", v.category));

    $("#modal-desc").textContent = v.description || "";
    $("#modal-play").lastChild.textContent = resumeTime(v.id) ? " Resume" : " Play";
    updateListBtn();

    const more = VIDEOS.filter((x) => x.category === v.category && x.id !== v.id);
    const moreBox = $("#modal-more");
    moreBox.innerHTML = "";
    more.forEach((x) => moreBox.append(card(x)));
    $("#modal-more-title").hidden = !more.length;

    $("#modal").hidden = false;
    $("#modal").scrollTop = 0;
    document.body.classList.add("no-scroll");
    $("#modal-play").focus({ preventScroll: true });
  }
  function closeModal() {
    $("#modal").hidden = true;
    document.body.classList.remove("no-scroll");
    modalVideo = null;
  }
  function updateListBtn() {
    if (modalVideo) $("#modal-list").textContent = inList(modalVideo.id) ? "✓  In My List" : "+  My List";
  }

  /* ── Player ──────────────────────────────────────────────── */
  const video = $("#video");
  const player = $("#player");
  let hls = null, current = null, lastSave = 0, idleTimer, nextTimer;

  function attachSource(src) {
    if (hls) { hls.destroy(); hls = null; }
    if (isHls(src) && !video.canPlayType("application/vnd.apple.mpegurl") && window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }
  }

  function openPlayer(v) {
    closeModal();
    cancelNext();
    current = v;
    $("#player-title").textContent = v.title;
    player.hidden = false;
    document.body.classList.add("no-scroll");
    document.querySelectorAll(".hero-media video").forEach((b) => b.pause());

    const start = resumeTime(v.id);
    video.poster = v.poster || "";
    attachSource(v.src);
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
    progress[current.id] = { t: video.currentTime, d: video.duration, at: now };
    store.set(KEY_PROGRESS, progress);
  }

  function closePlayer() {
    saveProgress(true);
    cancelNext();
    video.pause();
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute("src");
    video.load();
    current = null;
    player.hidden = true;
    document.body.classList.remove("no-scroll");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    refresh();
  }

  function nextAfter(v) {
    const same = VIDEOS.filter((x) => x.category === v.category);
    const i = same.indexOf(v);
    if (i >= 0 && i < same.length - 1) return same[i + 1];
    const j = VIDEOS.indexOf(v);
    return VIDEOS[(j + 1) % VIDEOS.length] !== v ? VIDEOS[(j + 1) % VIDEOS.length] : null;
  }

  function showNext() {
    const n = nextAfter(current);
    if (!n) return;
    const box = $("#next-up");
    $("#next-title").textContent = n.title;
    const img = $("#next-img");
    if (n.poster) { img.src = n.poster; img.hidden = false; } else img.hidden = true;
    let count = 8;
    $("#next-count").textContent = count;
    box.hidden = false;
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
    if (current) { delete progress[current.id]; store.set(KEY_PROGRESS, progress); }
    player.classList.remove("idle");
    showNext();
  });
  ["mousemove", "touchstart", "keydown"].forEach((e) => player.addEventListener(e, poke, { passive: true }));
  $("#player-back").onclick = closePlayer;
  $("#next-cancel").onclick = cancelNext;
  window.addEventListener("pagehide", () => saveProgress(true));

  /* ── Wiring ──────────────────────────────────────────────── */
  function start() {
    document.querySelectorAll("[data-site-name]").forEach((n) => (n.textContent = SITE.siteName || "Our Movies"));
    document.title = SITE.siteName ? `${SITE.siteName}` : "Our Movies";
    $("#footer-message").textContent = SITE.welcomeMessage || "Made with love";
    $("#app").hidden = false;
    showView("home");

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
      toggleList(modalVideo.id);
      updateListBtn();
      const keep = modalVideo;
      refresh();
      modalVideo = keep;
    };

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!player.hidden) closePlayer();
      else if (!$("#modal").hidden) closeModal();
    });

    const nav = $("#nav");
    const onScroll = () => nav.classList.toggle("solid", window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  document.querySelectorAll("[data-site-name]").forEach((n) => (n.textContent = SITE.siteName || "Our Movies"));
  initGate(start);
})();
