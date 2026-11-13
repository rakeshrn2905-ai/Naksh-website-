/*
 * Site settings: the name, the welcome screen and the captions under each row.
 * Videos and photos are NOT listed here. Add them on the /upload page (or in
 * the Cloudflare storage bucket) and they appear on the site automatically.
 */
window.SITE = {
  siteName: "All Our Yesterdays",

  // Welcome screen, shown once each time she opens the site (after logging in).
  welcomeTitle: "Happy Birthday, love",
  welcomeMessage: "Eleven years of yesterdays, and every one of them was better because of you.",

  // Optional: a little question she answers before coming in, just for fun.
  // (The real protection is the Cloudflare login, not this.)
  // Leave both as "" to show a simple "Come in" button instead.
  question: "",
  answer: "",

  // A short line under each row. The key is the folder name used when uploading.
  folderCaptions: {
    "2015": "The year it all began",
  },
};
