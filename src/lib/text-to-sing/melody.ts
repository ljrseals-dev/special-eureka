/**
 * Auto-melody and note assignment for text-to-singing drafts.
 * Stress → strong beats; line length → bars; scale-aware pitch; rest at line end.
 */
import type { Note } from "@/lib/tube-singer/song";
import type { Syllable, WordG2P } from "./g2p";
import { flatSyllables } from "./g2p";
import { snapMidi, scaleContour, type ScaleName } from "./scales";

export type MelodyStyle = "pop" | "folk" | "ballad";

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

export type AssignOpts = {
  bpm?: number;
  style?: MelodyStyle;
  /** MIDI of tonic in target octave, default C4 = 60 */
  rootMidi?: number;
  transpose?: number;
  /** Pitch-class of key (0=C … 11=B) */
  keyRoot?: number;
  scale?: ScaleName;
  /** 0 = free contour, 1 = hard snap to scale */
  snapStrength?: number;
};

/**
 * Assign notes for all lines.
 * Contour from style + scale degrees; optional snap to key/scale (f0_snap intelligence).
 */
export function assignNotes(lines: LinePlan[], opts: AssignOpts = {}): Note[] {
  const bpm = opts.bpm ?? 92;
  const style = opts.style ?? "pop";
  const keyRoot = opts.keyRoot ?? 0;
  const scale = opts.scale ?? "major";
  const snapStrength = opts.snapStrength ?? 1;
  const root = (opts.rootMidi ?? 60) + (opts.transpose ?? 0);
  // Contour as pitch-class offsets from scale, then placed near root
  const phrase =
    style === "folk" ? "rise" : style === "ballad" ? "fall" : "arch";
  const contour = scaleContour(scale, keyRoot, phrase);
  const spb = 60 / bpm;
  const notes: Note[] = [];
  let t = 0.25;

  for (const line of lines) {
    const nSyl = line.syls.length;
    const bars = nSyl > 8 ? 2 : 1;
    const beats = bars * 4;
    const weights = line.syls.map((s) => (s.stress ? 1.35 : 1));
    const wSum = weights.reduce((a, b) => a + b, 0);
    let localT = t;

    for (let i = 0; i < nSyl; i++) {
      const syl = line.syls[i]!;
      const frac = weights[i]! / wSum;
      const dur = beats * spb * frac * 0.92;
      // Base pitch: root octave + contour degree; unstressed slightly lower
      const deg = contour[i % contour.length]!;
      let midi = root - (root % 12) + deg + (syl.stress ? 0 : -1);
      // Keep near root octave
      while (midi < root - 5) midi += 12;
      while (midi > root + 14) midi -= 12;
      midi = snapMidi(midi, keyRoot, scale, snapStrength);
      midi = Math.round(midi * 10) / 10;
      const f0 = 440 * Math.pow(2, (midi - 69) / 12);
      notes.push({
        t0: localT,
        t1: localT + dur,
        f0,
        vow: syl.vow,
        tie: false,
        syl: syl.text,
        midi: Math.round(midi),
        legato: i > 0,
      });
      localT += beats * spb * frac;
    }
    t = localT + spb;
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
  keyRoot: number;
  scale: ScaleName;
  snapStrength: number;
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
  meta: {
    bpm: number;
    transpose: number;
    style: MelodyStyle;
    keyRoot: number;
    scale: ScaleName;
    snapStrength: number;
  },
): SingProject {
  return {
    version: 1,
    title,
    lyrics,
    bpm: meta.bpm,
    transpose: meta.transpose,
    style: meta.style,
    keyRoot: meta.keyRoot,
    scale: meta.scale,
    snapStrength: meta.snapStrength,
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
