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

  // ── A letter for her ──────────────────────────────────────────
  // Opens from "A letter for you" at the top. Leave paragraphs empty ([]) to hide it.
  letter: {
    title: "My Bangari,",
    paragraphs: [
      "There are some things I can never say properly on camera, so I'm writing them here.",
      "We started by taking blurry selfies, laughing at nothing, with no idea where life would take us. I didn't know then that I was looking at my whole future.",
      "You're the first person I want to tell everything to: the good news, the bad days and the stupid jokes. You've seen me at my worst and still chose to stay. I don't think I'll ever stop being amazed by that.",
      "I love the little things most. The way you laugh with your whole face. The way you fall asleep anywhere, like the world can wait. The way you dance when you think no one is watching, and the way you look at me like I'm someone special.",
      "So here's my promise. I'll keep choosing you every day, in every city and every version of our lives.",
      "Thank you for being my best friend, my safe place and my home.",
      "You are, and always will be, my favourite person.",
    ],
    signoff: "Forever yours,\nRakesh",
  },

  // ── Reasons I love you ────────────────────────────────────────
  // Each one is a card she taps to flip. Leave the list empty ([]) to hide the row.
  reasonsTitle: "Reasons I love you",
  // Each card shows "front" first; she taps it to flip and read "back".
  reasons: [
    { front: "Your smile", back: "Your smile still makes my whole day, just like it did in 2017." },
    { front: "Your laugh", back: "Your laugh is my favourite sound in the world, even through a phone screen." },
    { front: "The long drives", back: "Every slow drive with you felt shorter than it should have, because I never wanted it to end." },
    { front: "Kumbhakarna mode", back: "Even when you fall asleep anywhere (the auto, the bed, mid-conversation), you're the cutest thing I've ever seen." },
    { front: "Your silly side", back: "Your dances, your jam videos, your funny faces: you make every ordinary day fun." },
    { front: "Your patience", back: "You've stayed strong through the distance and believed in us, even when I was far away." },
    { front: "Simply you", back: "Because you're my Bangari: my best friend, my home, and my favourite person." },
    { front: "One more…", back: "And the best reason? I get to keep finding new ones, every year, for the rest of our lives." },
  ],

  // The line at the very bottom of the page.
  footerMessage: "Made with love, for you",
};
