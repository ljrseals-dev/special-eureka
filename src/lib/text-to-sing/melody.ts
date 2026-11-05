/**
 * Auto-melody and note assignment for text-to-singing drafts.
 * Stress → strong beats; line length → bars; one octave range; rest at line end.
 */
import type { Note } from "@/lib/tube-singer/song";
import type { Syllable, WordG2P } from "./g2p";
import { flatSyllables } from "./g2p";

export type MelodyStyle = "pop" | "folk" | "ballad";

const SCALE = {
  // C major degrees relative to root MIDI
  pop: [0, 2, 4, 5, 7, 9, 7, 5], // arch
  folk: [0, 2, 4, 2, 0, -1, 0, 2],
  ballad: [0, 2, 3, 5, 7, 5, 3, 0],
};

export type LinePlan = {
  text: string;
  words: WordG2P[];
  syls: Syllable[];
};

/** Parse multi-line lyrics into line plans with G2P. */
export function planLyrics(text: string, g2pLine: (line: string) => WordG2P[]): LinePlan[] {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const words = g2pLine(line);
      return { text: line, words, syls: flatSyllables(words) };
    })
    .filter((p) => p.syls.length > 0);
}

/**
 * Assign notes for all lines.
 * bpm + style control rhythm and contour; rootMidi sets key (default C4=60).
 */
export function assignNotes(
  lines: LinePlan[],
  opts: { bpm?: number; style?: MelodyStyle; rootMidi?: number; transpose?: number } = {},
): Note[] {
  const bpm = opts.bpm ?? 92;
  const style = opts.style ?? "pop";
  const root = (opts.rootMidi ?? 60) + (opts.transpose ?? 0);
  const contour = SCALE[style];
  const spb = 60 / bpm; // seconds per quarter
  const notes: Note[] = [];
  let t = 0.25; // short pickup

  for (const line of lines) {
    const nSyl = line.syls.length;
    // Fit line into 1 or 2 bars of 4/4
    const bars = nSyl > 8 ? 2 : 1;
    const beats = bars * 4;
    const beatDur = spb;
    // Equal time per syllable within the bar window, stressed get slight stretch
    const weights = line.syls.map((s) => (s.stress ? 1.35 : 1));
    const wSum = weights.reduce((a, b) => a + b, 0);
    let localT = t;

    for (let i = 0; i < nSyl; i++) {
      const syl = line.syls[i]!;
      const frac = weights[i]! / wSum;
      const dur = beats * beatDur * frac * 0.92;
      // pitch from contour, stressed a bit higher
      const deg = contour[i % contour.length]!;
      const midi = root + deg + (syl.stress ? 0 : -2);
      const f0 = 440 * Math.pow(2, (midi - 69) / 12);
      notes.push({
        t0: localT,
        t1: localT + dur,
        f0,
        vow: syl.vow,
        tie: false,
        syl: syl.text,
        midi,
        legato: i > 0,
      });
      localT += beats * beatDur * frac;
    }
    t = localT + beatDur; // one beat rest between lines
  }

  return notes;
}

/** Build a portable project JSON. */
export type SingProject = {
  version: 1;
  title: string;
  lyrics: string;
  bpm: number;
  transpose: number;
  style: MelodyStyle;
  lines: { text: string; syls: { text: string; vow: string[]; stress: number }[] }[];
  notes: {
    t0: number;
    t1: number;
    f0: number;
    midi: number;
    syl: string;
    vow: string[];
  }[];
  createdAt: string;
};

export function toProject(
  title: string,
  lyrics: string,
  lines: LinePlan[],
  notes: Note[],
  meta: { bpm: number; transpose: number; style: MelodyStyle },
): SingProject {
  return {
    version: 1,
    title,
    lyrics,
    bpm: meta.bpm,
    transpose: meta.transpose,
    style: meta.style,
    lines: lines.map((l) => ({
      text: l.text,
      syls: l.syls.map((s) => ({ text: s.text, vow: [...s.vow], stress: s.stress })),
    })),
    notes: notes.map((n) => ({
      t0: n.t0,
      t1: n.t1,
      f0: n.f0,
      midi: n.midi,
      syl: n.syl,
      vow: [...n.vow],
    })),
    createdAt: new Date().toISOString(),
  };
}
