/**
 * Scale / key intelligence for text-to-singing.
 * Mirrors bench f0_snap degrees; works in MIDI space.
 */

export type ScaleName = "chromatic" | "major" | "minor" | "major_pent" | "minor_pent";

export const SCALES: Record<ScaleName, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major_pent: [0, 2, 4, 7, 9],
  minor_pent: [0, 3, 5, 7, 10],
};

export const SCALE_LABELS: Record<ScaleName, string> = {
  chromatic: "Chromatic",
  major: "Major",
  minor: "Natural minor",
  major_pent: "Major pentatonic",
  minor_pent: "Minor pentatonic",
};

/** Snap a MIDI note to the nearest scale degree in key_root (0=C … 11=B). */
export function snapMidi(
  midi: number,
  keyRoot = 0,
  scale: ScaleName = "major",
  strength = 1,
): number {
  const degrees = SCALES[scale] ?? SCALES.major;
  const allowed: number[] = [];
  for (let oct = -1; oct < 12; oct++) {
    for (const d of degrees) {
      allowed.push(oct * 12 + ((keyRoot + d) % 12));
    }
  }
  allowed.sort((a, b) => a - b);
  let best = allowed[0]!;
  let bestDist = Math.abs(midi - best);
  for (const a of allowed) {
    const dist = Math.abs(midi - a);
    if (dist < bestDist) {
      best = a;
      bestDist = dist;
    }
  }
  return midi + strength * (best - midi);
}

/** Build a one-octave contour of scale degrees for auto-melody phrase shape. */
export function scaleContour(scale: ScaleName, keyRoot = 0, style: "arch" | "rise" | "fall" = "arch"): number[] {
  const degs = SCALES[scale] ?? SCALES.major;
  const mid = degs.map((d) => (keyRoot + d) % 12);
  // phrase shapes over ~8 slots
  if (style === "rise") {
    return [mid[0]!, mid[1] ?? mid[0]!, mid[2] ?? mid[1]!, mid[3] ?? mid[2]!, mid[4] ?? mid[3]!, mid[4] ?? mid[3]!, mid[3] ?? mid[2]!, mid[2] ?? mid[1]!];
  }
  if (style === "fall") {
    return [mid[4] ?? mid[3]!, mid[3] ?? mid[2]!, mid[2] ?? mid[1]!, mid[1] ?? mid[0]!, mid[0]!, mid[0]!, mid[1] ?? mid[0]!, mid[0]!];
  }
  // arch
  return [
    mid[0]!,
    mid[1] ?? mid[0]!,
    mid[2] ?? mid[1]!,
    mid[4] ?? mid[3] ?? mid[2]!,
    mid[4] ?? mid[3]!,
    mid[3] ?? mid[2]!,
    mid[1] ?? mid[0]!,
    mid[0]!,
  ];
}
