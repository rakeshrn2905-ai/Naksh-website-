# All Our Yesterdays

A private, streaming-style website for our videos and photos: a row for each year,
a full-screen video player that remembers where you stopped, a photo viewer,
"My List", search, and an upload page.

It runs entirely on Cloudflare (as a Worker), behind a real login. Only the email addresses you
approve can see anything: no page, thumbnail, video or photo is sent to anyone else.

---

## How it's protected

| Layer | What it does |
|---|---|
| **Cloudflare Access** (the login) | Sits in front of the whole site. Visitors must prove they own an approved email (a one-time code sent to that inbox, or Google sign-in). Everyone else is stopped before reaching the site. |
| **Second check on every request** (`functions/_middleware.js`) | Verifies Cloudflare's signed login token on every page, video and photo, and checks the email against our own list. If Access were ever switched off or set up wrong, the site shows nothing. |
| **Private storage** (Cloudflare R2) | Videos and photos are kept in a private bucket with no public link. They can only be fetched through the site, after the login. |
| **Upload page** | Only emails in `ADMIN_EMAILS` can open it or upload/delete anything. |
| **Browser protections** | Strict security headers: the site can't be embedded in other sites, loads no outside scripts, and asks search engines not to index it. |

**What keeps it safe from your side:** turn on two-step verification (2FA) on your
Cloudflare, GitHub and email accounts, and ask her to turn it on for her email.
The site is only as secure as the email inboxes that can log in.

---

## One-time setup

The site runs as a **Cloudflare Worker** (`naksh`), connected to this GitHub repo.
Every push to `master` rebuilds and redeploys it automatically. The storage bucket and
the security settings are declared in `wrangler.jsonc`, so there's nothing to connect by hand.

### 1. Cloudflare account
Sign up at **dash.cloudflare.com** (free plan) and turn on two-step verification:
**profile icon → Profile → Authentication**.

### 2. Private storage bucket
**R2 Object Storage → Create bucket**, named **`naksh`** (the name used in `wrangler.jsonc`).
Leave **Public access** turned **off**.

### 3. The website (Worker)
**Workers & Pages → Create → Import a repository** → GitHub → this repo.
- Worker name: **`naksh`** (must match `name` in `wrangler.jsonc`)
- Branch: **`master`**
- Build command: *(empty)*. Deploy command: **`npx wrangler deploy`** (the default)

Until the login is configured, every address shows *"This site is private. The login isn't set up yet."*

### 4. Turn on the login (Cloudflare Access)
1. **Workers & Pages → naksh → Settings → Domains & Routes**.
2. Next to the **workers.dev** address, choose **Enable Cloudflare Access**.
3. Choose **Manage Cloudflare Access**. In the policy, set **Include → Emails** to her email and yours
   (remove anything else, so only the two of you are allowed). One-time PIN login is on by default;
   you can add Google as a login method too.
4. In the Access application's details, copy the **Application Audience (AUD) Tag**.
5. Note your **team domain**: **Zero Trust → Settings → Team name and domain**, e.g. `yourteam.cloudflareaccess.com`.

### 5. Tell the site who's allowed
**Workers & Pages → naksh → Settings → Variables and Secrets → Add** (type: Text):

| Name | Value |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `yourteam.cloudflareaccess.com` |
| `ACCESS_AUD` | the AUD tag you copied |
| `ALLOWED_EMAILS` | `her@example.com, you@example.com` |
| `ADMIN_EMAILS` | `you@example.com` |

Then **Deploy**. These settings are kept on every future deploy (`keep_vars` in `wrangler.jsonc`).

> Keep the emails the same in the Access policy and in `ALLOWED_EMAILS`. Both must allow a person for them to get in.

### 6. Check it
1. Open your `naksh.allouryesterdays.workers.dev` address in a **private/incognito window**. You should see Cloudflare's login page.
2. Enter your email, type the code you receive, and the site opens.
3. Try an email that isn't on the list. It should be refused.

---

## Adding videos and photos

Open **`/upload.html`** on your site (or tap **Upload** in the top bar, which only you see).

1. Type the **row**, e.g. `2015`. Each row on the home page is a year (or any name you like).
2. Choose files. You can pick many at once, from your phone or computer.
3. Optionally give each one a **title**, **date** and a line about the moment.
   Tick **"Show this as the big video at the top"** for the featured video.
4. Press **Upload**. Big videos go up in small pieces, so a slow connection is fine.
   Video thumbnails are made automatically, and photos are resized so they load fast.

You can delete things from the same page.

**Tips**
- **iPhone videos** are often saved as HEVC, which Safari plays but some Chrome/Windows
  browsers don't. For the best compatibility, set **Settings → Camera → Formats → Most Compatible**
  before recording, or export videos as MP4 (H.264).
- Free storage covers **10 GB**; beyond that it's about $0.015 per GB per month.

---

## Changing the words

Edit **`public/site.js`**: site name, the birthday welcome screen, an optional fun question,
and the short caption under each year's row. Commit to GitHub and Cloudflare redeploys automatically.

---

## How the code is organised

```
public/              the website (what the browser loads)
  index.html, app.js the home page, player and photo viewer
  upload.html, upload.js
  site.js            names and wording
  styles.css
wrangler.jsonc       Worker settings: storage bucket, run the login check before every file
worker/index.js      Worker entry point: sends every request through the login check
functions/           code that runs on Cloudflare's servers
  _middleware.js     login check + security headers for every request
  api/library.js     lists the videos and photos for the home page
  api/upload.js      upload / delete (admins only)
  media/[[path]].js  streams files out of private storage
lib/media.js         shared file-type rules
```

## Trying it on a computer (for developers)

```bash
npx wrangler dev --var DEV_SKIP_AUTH:true
```
Open http://localhost:8787. `DEV_SKIP_AUTH` only works on `localhost`; it is ignored on any real address.
