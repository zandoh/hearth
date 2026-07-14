// The word widget's backend, sandbox edition: a small pack with the same
// deterministic day-index scheme as internal/widgets/word, so the demo
// flips its word at the visitor's midnight just like the real thing.

import type { WordOfTheDay } from "../widgets/wordApi";

// [word, pos, definition, example]
const PACK: [string, string, string, string][] = [
  [
    "petrichor",
    "noun",
    "the pleasant smell of earth after rain",
    "The petrichor drifted in as soon as the storm passed.",
  ],
  [
    "wanderlust",
    "noun",
    "a strong desire to travel",
    "Every spring her wanderlust flared up and the maps came out.",
  ],
  [
    "serendipity",
    "noun",
    "finding something good without looking for it",
    "Meeting their best friends at the wrong bus stop was pure serendipity.",
  ],
  [
    "luminous",
    "adjective",
    "giving off light; bright or glowing",
    "The luminous moon lit the whole backyard.",
  ],
  [
    "dawdle",
    "verb",
    "to waste time; to move slower than needed",
    "If you dawdle over breakfast we'll miss the bus.",
  ],
  [
    "whimsy",
    "noun",
    "playful, fanciful humor",
    "The garden gnome wearing a tiny scarf was a touch of whimsy.",
  ],
  [
    "nimble",
    "adjective",
    "quick and light in movement or thinking",
    "The nimble squirrel crossed the fence like a tightrope walker.",
  ],
  ["zephyr", "noun", "a soft, gentle breeze", "A zephyr moved through the curtains at dusk."],
  [
    "kindle",
    "verb",
    "to light a fire; to stir up interest or feeling",
    "One library visit kindled a lifelong love of maps.",
  ],
  [
    "hearth",
    "noun",
    "the floor of a fireplace; the warm center of a home",
    "Everyone gathered at the hearth to dry their mittens.",
  ],
  [
    "jubilant",
    "adjective",
    "feeling great joy, especially after a success",
    "The team was jubilant after the extra-inning win.",
  ],
  [
    "mirth",
    "noun",
    "laughter and amusement",
    "The kitchen filled with mirth over the pancake flip gone wrong.",
  ],
  [
    "waft",
    "verb",
    "to drift gently through the air",
    "The smell of cinnamon rolls wafted upstairs.",
  ],
  [
    "kerfuffle",
    "noun",
    "a minor fuss or commotion",
    "There was a kerfuffle over matching socks this morning.",
  ],
];

const pad = (n: number) => String(n).padStart(2, "0");

export function demoWord(now: Date): WordOfTheDay {
  const epoch = new Date(2020, 0, 1);
  const days = Math.floor((now.getTime() - epoch.getTime()) / 86400000);
  const [word, pos, definition, example] = PACK[((days % PACK.length) + PACK.length) % PACK.length];
  return {
    day: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    word,
    pos,
    definition,
    example,
  };
}
