/**
 * Lightweight English G2P + syllable split for text-to-singing drafts.
 * Dictionary covers common words; unknown tokens use a letter-to-sound fallback.
 * Maps to tube-singer vowel keys: i I E ae A V O U u
 */

import type { VowelKey } from "@/lib/tube-singer/vowels";

/** One syllable: display text + primary vowel for the tube model + stress 0|1 */
export type Syllable = {
  text: string;
  vow: VowelKey[];
  stress: 0 | 1;
};

export type WordG2P = {
  word: string;
  syls: Syllable[];
};

/** Common-word dictionary: orthography → syllables with tube vowels */
const DICT: Record<string, Syllable[]> = {
  // Daisy Bell core + everyday
  daisy: [
    { text: "Dai", vow: ["E", "I"], stress: 1 },
    { text: "sy", vow: ["i"], stress: 0 },
  ],
  give: [{ text: "give", vow: ["I"], stress: 1 }],
  me: [{ text: "me", vow: ["i"], stress: 1 }],
  your: [{ text: "your", vow: ["O"], stress: 1 }],
  answer: [
    { text: "an", vow: ["ae"], stress: 1 },
    { text: "swer", vow: ["E"], stress: 0 },
  ],
  do: [{ text: "do", vow: ["u"], stress: 1 }],
  im: [{ text: "I'm", vow: ["A", "I"], stress: 1 }],
  "i'm": [{ text: "I'm", vow: ["A", "I"], stress: 1 }],
  half: [{ text: "half", vow: ["ae"], stress: 1 }],
  crazy: [
    { text: "cra", vow: ["E", "I"], stress: 1 },
    { text: "zy", vow: ["i"], stress: 0 },
  ],
  all: [{ text: "all", vow: ["O"], stress: 1 }],
  for: [{ text: "for", vow: ["O"], stress: 0 }],
  the: [{ text: "the", vow: ["V"], stress: 0 }],
  love: [{ text: "love", vow: ["V"], stress: 1 }],
  of: [{ text: "of", vow: ["V"], stress: 0 }],
  you: [{ text: "you", vow: ["u"], stress: 1 }],
  it: [{ text: "it", vow: ["I"], stress: 0 }],
  wont: [{ text: "won't", vow: ["O", "U"], stress: 1 }],
  "won't": [{ text: "won't", vow: ["O", "U"], stress: 1 }],
  be: [{ text: "be", vow: ["i"], stress: 1 }],
  a: [{ text: "a", vow: ["V"], stress: 0 }],
  stylish: [
    { text: "styl", vow: ["A", "I"], stress: 1 },
    { text: "ish", vow: ["I"], stress: 0 },
  ],
  marriage: [
    { text: "mar", vow: ["A"], stress: 1 },
    { text: "riage", vow: ["I"], stress: 0 },
  ],
  i: [{ text: "I", vow: ["A", "I"], stress: 1 }],
  cant: [{ text: "can't", vow: ["ae"], stress: 1 }],
  "can't": [{ text: "can't", vow: ["ae"], stress: 1 }],
  afford: [
    { text: "af", vow: ["ae"], stress: 0 },
    { text: "ford", vow: ["O"], stress: 1 },
  ],
  carriage: [
    { text: "car", vow: ["A"], stress: 1 },
    { text: "riage", vow: ["I"], stress: 0 },
  ],
  but: [{ text: "but", vow: ["V"], stress: 0 }],
  youll: [{ text: "you'll", vow: ["u"], stress: 1 }],
  "you'll": [{ text: "you'll", vow: ["u"], stress: 1 }],
  look: [{ text: "look", vow: ["U"], stress: 1 }],
  sweet: [{ text: "sweet", vow: ["i"], stress: 1 }],
  upon: [
    { text: "up", vow: ["V"], stress: 0 },
    { text: "on", vow: ["A"], stress: 1 },
  ],
  seat: [{ text: "seat", vow: ["i"], stress: 1 }],
  bicycle: [
    { text: "bi", vow: ["A", "I"], stress: 1 },
    { text: "cy", vow: ["I"], stress: 0 },
    { text: "cle", vow: ["V"], stress: 0 },
  ],
  built: [{ text: "built", vow: ["I"], stress: 1 }],
  two: [{ text: "two", vow: ["u"], stress: 1 }],
  // everyday extras for independent artists
  heart: [{ text: "heart", vow: ["A"], stress: 1 }],
  night: [{ text: "night", vow: ["A", "I"], stress: 1 }],
  day: [{ text: "day", vow: ["E", "I"], stress: 1 }],
  time: [{ text: "time", vow: ["A", "I"], stress: 1 }],
  home: [{ text: "home", vow: ["O"], stress: 1 }],
  alone: [
    { text: "a", vow: ["V"], stress: 0 },
    { text: "lone", vow: ["O"], stress: 1 },
  ],
  never: [
    { text: "nev", vow: ["E"], stress: 1 },
    { text: "er", vow: ["E"], stress: 0 },
  ],
  always: [
    { text: "al", vow: ["O"], stress: 1 },
    { text: "ways", vow: ["E", "I"], stress: 0 },
  ],
  today: [
    { text: "to", vow: ["U"], stress: 0 },
    { text: "day", vow: ["E", "I"], stress: 1 },
  ],
  tomorrow: [
    { text: "to", vow: ["U"], stress: 0 },
    { text: "mor", vow: ["O"], stress: 1 },
    { text: "row", vow: ["O"], stress: 0 },
  ],
  baby: [
    { text: "ba", vow: ["E", "I"], stress: 1 },
    { text: "by", vow: ["i"], stress: 0 },
  ],
  fire: [{ text: "fire", vow: ["A", "I"], stress: 1 }],
  rain: [{ text: "rain", vow: ["E", "I"], stress: 1 }],
  sky: [{ text: "sky", vow: ["A", "I"], stress: 1 }],
  dream: [{ text: "dream", vow: ["i"], stress: 1 }],
  sing: [{ text: "sing", vow: ["I"], stress: 1 }],
  song: [{ text: "song", vow: ["O"], stress: 1 }],
  world: [{ text: "world", vow: ["E"], stress: 1 }],
  life: [{ text: "life", vow: ["A", "I"], stress: 1 }],
  free: [{ text: "free", vow: ["i"], stress: 1 }],
  true: [{ text: "true", vow: ["u"], stress: 1 }],
  blue: [{ text: "blue", vow: ["u"], stress: 1 }],
  gone: [{ text: "gone", vow: ["O"], stress: 1 }],
  stay: [{ text: "stay", vow: ["E", "I"], stress: 1 }],
  wait: [{ text: "wait", vow: ["E", "I"], stress: 1 }],
  know: [{ text: "know", vow: ["O"], stress: 1 }],
  feel: [{ text: "feel", vow: ["i"], stress: 1 }],
  need: [{ text: "need", vow: ["i"], stress: 1 }],
  want: [{ text: "want", vow: ["A"], stress: 1 }],
  can: [{ text: "can", vow: ["ae"], stress: 1 }],
  will: [{ text: "will", vow: ["I"], stress: 1 }],
  and: [{ text: "and", vow: ["ae"], stress: 0 }],
  in: [{ text: "in", vow: ["I"], stress: 0 }],
  on: [{ text: "on", vow: ["A"], stress: 0 }],
  to: [{ text: "to", vow: ["u"], stress: 0 }],
  from: [{ text: "from", vow: ["V"], stress: 0 }],
  with: [{ text: "with", vow: ["I"], stress: 0 }],
  my: [{ text: "my", vow: ["A", "I"], stress: 0 }],
  we: [{ text: "we", vow: ["i"], stress: 1 }],
  they: [{ text: "they", vow: ["E", "I"], stress: 1 }],
  this: [{ text: "this", vow: ["I"], stress: 0 }],
  that: [{ text: "that", vow: ["ae"], stress: 0 }],
  when: [{ text: "when", vow: ["E"], stress: 0 }],
  where: [{ text: "where", vow: ["E"], stress: 0 }],
  why: [{ text: "why", vow: ["A", "I"], stress: 1 }],
  how: [{ text: "how", vow: ["A", "u"], stress: 1 }],
  oh: [{ text: "oh", vow: ["O"], stress: 1 }],
  yeah: [{ text: "yeah", vow: ["E"], stress: 1 }],
  no: [{ text: "no", vow: ["O"], stress: 1 }],
  yes: [{ text: "yes", vow: ["E"], stress: 1 }],
};

/** Letter patterns → tube vowel (very rough English) */
function vowelFromLetters(chunk: string): VowelKey {
  const c = chunk.toLowerCase();
  if (/ee|ea|ie|y$/.test(c)) return "i";
  if (/ay|ai|ei/.test(c)) return "E";
  if (/oo|u$|ew/.test(c)) return "u";
  if (/ow|ou|aw/.test(c)) return "A";
  if (/o$|oa|oe/.test(c)) return "O";
  if (/a$|ah/.test(c)) return "A";
  if (/i$|ih/.test(c)) return "I";
  if (/e$|eh/.test(c)) return "E";
  if (/u|uh|er/.test(c)) return "V";
  if (/a/.test(c)) return "ae";
  return "V";
}

/** Fallback: split unknown word into 1–3 syllable-ish chunks */
function fallbackSyllables(word: string): Syllable[] {
  const w = word.replace(/[^a-zA-Z']/g, "");
  if (!w) return [];
  // naive: split on vowel groups
  const parts = w.match(/[^aeiouy]*[aeiouy]+[^aeiouy]*/gi) || [w];
  return parts.map((p, i) => ({
    text: p,
    vow: [vowelFromLetters(p)] as VowelKey[],
    stress: (i === 0 ? 1 : 0) as 0 | 1,
  }));
}

export function g2pWord(raw: string): WordG2P {
  const cleaned = raw.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "");
  const key = cleaned.toLowerCase().replace(/'/g, "'");
  const fromDict = DICT[key] || DICT[key.replace(/'/g, "")];
  if (fromDict) return { word: cleaned || raw, syls: fromDict.map((s) => ({ ...s })) };
  return { word: cleaned || raw, syls: fallbackSyllables(cleaned || raw) };
}

/** Split a line of text into words → G2P syllables (skips pure punctuation). */
export function g2pLine(line: string): WordG2P[] {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.map(g2pWord).filter((w) => w.syls.length > 0);
}

/** Flatten line words into ordered syllables. */
export function flatSyllables(words: WordG2P[]): Syllable[] {
  return words.flatMap((w) => w.syls);
}
