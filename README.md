# All Our Yesterdays

A private, streaming-style website for our videos and photos: a row for each year,
a full-screen video player that remembers where you stopped, a photo viewer,
"My List", search, and an upload page.

It runs entirely on Cloudflare, behind a real login. Only the email addresses you
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

## One-time setup (about 30 minutes)

You need: a free Cloudflare account, and this GitHub repository.

### 1. Create your Cloudflare account
1. Sign up at **dash.cloudflare.com** (free plan).
2. Turn on two-step verification: **profile icon → Profile → Authentication**.

### 2. Create the private storage bucket
1. In the left menu open **R2 Object Storage**. Cloudflare asks for a payment card to
   activate R2, even though the first 10 GB are free.
2. **Create bucket** → name it `all-our-yesterdays-media` → **Create**.
3. Leave **Public access** turned **off**. Don't turn on the `r2.dev` URL or add a custom domain to the bucket.

### 3. Put the website online
1. Open **Workers & Pages → Create → Pages → Connect to Git**.
2. Connect GitHub and choose **this repository** (allow Cloudflare to see this private repo).
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`public`**
4. Project name: e.g. `all-our-yesterdays` (your address becomes `all-our-yesterdays.pages.dev`).
5. **Save and Deploy**. It will say *"The login isn't set up yet"* until the steps below are done. That's expected.

### 4. Connect the storage to the website
Pages project → **Settings → Bindings → Add → R2 bucket**:
- Variable name: **`MEDIA`**
- Bucket: **`all-our-yesterdays-media`**

### 5. Set up the login (Cloudflare Access)
1. In the left menu open **Zero Trust**. The first time, pick a **team name** (e.g. `allouryesterdays`;
   your login address becomes `allouryesterdays.cloudflareaccess.com`) and choose the **Free** plan.
2. **Access → Applications → Add an application → Self-hosted**.
3. Application name: `All Our Yesterdays`. Session duration: e.g. **1 month**.
4. Add two public hostnames:
   - `all-our-yesterdays.pages.dev`
   - `*.all-our-yesterdays.pages.dev` (this protects test versions too)
5. Add a policy: **Action: Allow**, **Include → Emails** → her email and yours.
6. Login methods: **One-time PIN** is on by default. If she uses Gmail you can also add **Google**.
7. Save. Open the application again and copy its **Application Audience (AUD) Tag**.

### 6. Tell the website who's allowed
Pages project → **Settings → Variables and Secrets**. Add these for **Production** (and also for **Preview**):

| Name | Value |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `yourteam.cloudflareaccess.com` |
| `ACCESS_AUD` | the AUD tag you copied |
| `ALLOWED_EMAILS` | `her@example.com, you@example.com` |
| `ADMIN_EMAILS` | `you@example.com` |

Then **Deployments → ⋯ on the latest → Retry deployment** so the settings take effect.

> Keep the email list the same in the Access policy and in `ALLOWED_EMAILS`. Both must allow a person for them to get in.

### 7. Check it
1. Open your `.pages.dev` address in a **private/incognito window**. You should see Cloudflare's login page.
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
functions/           code that runs on Cloudflare's servers
  _middleware.js     login check + security headers for every request
  api/library.js     lists the videos and photos for the home page
  api/upload.js      upload / delete (admins only)
  media/[[path]].js  streams files out of private storage
lib/media.js         shared file-type rules
```

## Trying it on a computer (for developers)

```bash
npx wrangler pages dev public --r2 MEDIA --binding DEV_SKIP_AUTH=true
```
Open http://localhost:8788. `DEV_SKIP_AUTH` only works on `localhost`; it is ignored on any real address.
