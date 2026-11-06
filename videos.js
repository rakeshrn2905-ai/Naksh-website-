/*
 * ─────────────────────────────────────────────────────────────
 *  THIS IS THE ONLY FILE YOU NEED TO EDIT.
 *  Change the name, the password, the message, and add videos.
 * ─────────────────────────────────────────────────────────────
 */
window.SITE = {
  // Shown as the logo in the top-left corner.
  siteName: "A Year of Us",

  // Shown on the lock screen and at the bottom of the page.
  welcomeTitle: "Hi love ❤",
  welcomeMessage: "I made this just for you. Every moment of us, in one place.",

  // Password for the lock screen (not case-sensitive).
  // Leave it as "" to turn the lock screen off.
  // Note: this keeps casual visitors out, but anyone who reads the page
  // source can see it. For real privacy, also turn on password protection
  // on your host (see README.md).
  password: "forever",

  // Rows appear on the home page in this order.
  categories: ["Our Trips", "Birthdays", "Little Moments"],

  /*
   * One entry per video.
   *   id          short unique name, no spaces
   *   title       the name she sees
   *   category    must match one of the categories above
   *   src         the video file or streaming link:
   *                 - an .mp4 file (e.g. "videos/beach.mp4"), or
   *                 - a streaming link ending in .m3u8 (Bunny Stream / Cloudflare Stream)
   *   poster      thumbnail image (optional; a colour tile is used if missing)
   *   date        "YYYY-MM-DD" (optional, used for "Recently Added")
   *   description a line or two about the moment (optional)
   *   featured    true for the big video at the top of the page (pick one)
   */
  videos: [
    {
      id: "trip-beach",
      title: "Beach Day",
      category: "Our Trips",
      src: "demo/trip-beach.mp4",
      poster: "demo/trip-beach.jpg",
      date: "2026-06-14",
      description: "Sand everywhere, sunburnt noses, and the best ice cream of the summer.",
      featured: true,
    },
    {
      id: "trip-mountains",
      title: "Up the Mountains",
      category: "Our Trips",
      src: "demo/trip-mountains.mp4",
      poster: "demo/trip-mountains.jpg",
      date: "2026-03-02",
      description: "We said it was a short hike. It was not a short hike.",
    },
    {
      id: "bday-cake",
      title: "Birthday Cake",
      category: "Birthdays",
      src: "demo/bday-cake.mp4",
      poster: "demo/bday-cake.jpg",
      date: "2026-01-20",
      description: "Candles, wishes, and frosting on your nose.",
    },
    {
      id: "bday-surprise",
      title: "The Surprise",
      category: "Birthdays",
      src: "demo/bday-surprise.mp4",
      poster: "demo/bday-surprise.jpg",
      date: "2025-11-08",
      description: "Your face when you walked in. I'll never forget it.",
    },
    {
      id: "moment-coffee",
      title: "Sunday Coffee",
      category: "Little Moments",
      src: "demo/moment-coffee.mp4",
      poster: "demo/moment-coffee.jpg",
      date: "2026-09-27",
      description: "Slow mornings are my favourite thing with you.",
    },
    {
      id: "moment-dance",
      title: "Kitchen Dance",
      category: "Little Moments",
      src: "demo/moment-dance.mp4",
      poster: "demo/moment-dance.jpg",
      date: "2026-10-11",
      description: "No music needed.",
    },
    {
      id: "moment-sunset",
      title: "First Sunset",
      category: "Little Moments",
      src: "demo/moment-sunset.mp4",
      poster: "demo/moment-sunset.jpg",
      date: "2025-08-19",
      description: "The one where it all started.",
    },
  ],
};
