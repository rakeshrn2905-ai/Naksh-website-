# Our private movie site

A streaming-style website for our videos: a big featured video, rows by category,
a details popup, a full-screen player that remembers where you stopped, plays the
next video automatically, plus "My List" and search.

## Try it on your computer

```bash
python3 -m http.server 8000
```
Open http://localhost:8000. The demo password is `forever`.

## Change the name, password and message

Edit the top of **`videos.js`**: `siteName`, `password`, `welcomeTitle`, `welcomeMessage`.

## Add a video

1. Put the video somewhere it can be streamed from (see below) and copy its link.
2. Add an entry to the `videos` list in **`videos.js`**:

```js
{
  id: "goa-2026",
  title: "Goa Trip",
  category: "Our Trips",
  src: "https://.../playlist.m3u8",   // or an .mp4 link
  poster: "https://.../thumbnail.jpg",
  date: "2026-12-24",
  description: "Our first holiday together.",
},
```
3. Delete the demo entries and the `demo/` folder once you have real videos.

## Where to store the videos

| Option | Link to use as `src` |
|---|---|
| **Bunny Stream** (recommended) | The video's *HLS playlist URL* (ends in `.m3u8`). Thumbnail: its *thumbnail URL*. |
| **Cloudflare Stream** | `https://customer-<code>.cloudflarestream.com/<video-id>/manifest/video.m3u8` |
| **Cloudflare R2 / any file host** | The public `.mp4` link. |
| **Small clips** | Drop the `.mp4` in a `videos/` folder here and use `videos/name.mp4` (GitHub rejects files over 100 MB). |

## Hosting the site

The site is plain HTML, CSS and JavaScript, so it runs on any static host
(Netlify, Vercel or Cloudflare Pages, all free). The lock screen keeps casual visitors out,
but the password is visible in the page source. For real privacy, also enable
password protection on the host, and make video links private where the
video service allows it (Bunny and Cloudflare support signed or allowed-domain links).

## Notes

- "Continue Watching" and "My List" are saved in the browser, per device.
- Video player library: [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0), bundled in `vendor/`.
