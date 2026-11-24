/*
 * Site settings: the name, the welcome screen and the captions under each row.
 * Videos and photos are NOT listed here. Add them on the /upload page (or in
 * the Cloudflare storage bucket) and they appear on the site automatically.
 */
window.SITE = {
  siteName: "All Our Yesterdays",

  // Welcome screen, shown once each time she opens the site (after logging in).
  welcomeTitle: "Happy Birthday, love",
  welcomeMessage: "I made this just for you.",

  // Optional: a little question she answers before coming in, just for fun.
  // (The real protection is the Cloudflare login, not this.)
  // Leave both as "" to show a simple "Come in" button instead.
  question: "",
  answer: "",

  // The heading above the videos and photos on the home page.
  rowTitle: "Our Moments",

  // The big video at the top of the home page (its title, or the start of it).
  featured: "Happy Birthday Bangari",
  // The small line above the big title at the top.
  featuredTag: "For your birthday",

  // The order of the videos in the row (titles, or the start of each title).
  // Anything not listed here comes after these, newest first.
  order: [
    "Happy Birthday Bangari",
    "This is my first kiss",
    "Still Remember Those",
    "Long drives",
    "Jam videos",
    "Just youuuuu",
    "This is how I see you",
  ],

  // Nicer names to show instead of the file names (left: file name, right: shown).
  titles: {
    "Happy Birthday Bangari 4K": "Happy Birthday, Bangari",
    "Jam videos cinematic 4K v2": "Jam Sessions",
  },

  // The line at the very bottom of the page.
  footerMessage: "Made with love, for you",
};
