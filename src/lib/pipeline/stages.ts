/**
 * Stage implementations — fixtures prove the contract (FIG 3.6 fingerprints).
 * Real RMVPE / DiffSinger / RVC remain not_implemented until installed.
 */
import { snapMidi, type ScaleName } from "@/lib/text-to-sing/scales";
import { g2pLine } from "@/lib/text-to-sing/g2p";
import { assignNotes, planLyrics } from "@/lib/text-to-sing/melody";
import { render, BASE_LEN } from "@/lib/tube-singer/tract";
import {
  processVocalAtmos,
  VOCAL_ATMOS_FINGERPRINT,
  type AtmosPreset,
} from "./vocal-atmos";
import type { StageResult } from "./types";

function nowMs() {
  return performance.now();
}

/** DRY TAP — mandatory reference copy (FIG 1.1 note 1) */
export function stageDryTap(audio: Float32Array | null): StageResult<Float32Array | null> {
  const t0 = nowMs();
  const value = audio ? new Float32Array(audio) : null;
  return { value, fingerprint: "dry_tap:v1", ms: nowMs() - t0 };
}

/** ASR — Plan A only. Browser fixture: lyrics provided as text, not mic ASR. */
export function stageAsrText(lyrics: string, impl: string): StageResult<string> {
  const t0 = nowMs();
  if (impl === "text_buffer") {
    return { value: lyrics.trim(), fingerprint: "text_buffer", ms: nowMs() - t0 };
  }
  throw new Error(`ASR impl not implemented: ${impl}`);
}

/** Forced alignment fixture — syllable timings from G2P + equal-weight plan */
export function stageForcedAlignFixture(lyrics: string): StageResult<{
  lines: ReturnType<typeof planLyrics>;
}> {
  const t0 = nowMs();
  const lines = planLyrics(lyrics, g2pLine);
  return { value: { lines }, fingerprint: "align_fixture", ms: nowMs() - t0 };
}

/** F0 tracker fixture — from assigned MIDI notes (not audio analysis) */
export function stageF0FromNotes(
  notes: { t0: number; t1: number; f0: number }[],
  hopS = 0.01,
): StageResult<Float32Array> {
  const t0 = nowMs();
  const dur = notes.length ? Math.max(...notes.map((n) => n.t1)) + 0.05 : 0.1;
  const n = Math.max(1, Math.ceil(dur / hopS));
  const f0 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * hopS;
    const note = notes.find((nn) => t >= nn.t0 && t < nn.t1);
    f0[i] = note ? note.f0 : 0;
  }
  return { value: f0, fingerprint: "f0_from_notes", ms: nowMs() - t0 };
}

export function stageF0Rmvpe(_audio: Float32Array, _sr: number): StageResult<Float32Array> {
  throw new Error("RMVPE not installed");
}

/** F0 snap — MIDI-space quantize (browser port of bench f0_snap intelligence) */
export function stageF0Snap(
  f0: Float32Array,
  opts: { keyRoot?: number; scale?: string; strength?: number },
): StageResult<Float32Array> {
  const t0 = nowMs();
  const keyRoot = opts.keyRoot ?? 0;
  const scale = (opts.scale ?? "major") as ScaleName;
  const strength = opts.strength ?? 1;
  const out = new Float32Array(f0.length);
  for (let i = 0; i < f0.length; i++) {
    const hz = f0[i]!;
    if (hz <= 0) {
      out[i] = 0;
      continue;
    }
    const midi = 69 + 12 * Math.log2(hz / 440);
    const snapped = snapMidi(midi, keyRoot, scale, strength);
    out[i] = 440 * Math.pow(2, (snapped - 69) / 12);
  }
  return { value: out, fingerprint: "snap_f0:v1", ms: nowMs() - t0 };
}

/** Plan A synth — tube / formant path (phoneme+F0 contract via note list) */
export function stageSynthTube(
  notes: Parameters<typeof render>[0],
  impl: string,
): StageResult<{ samples: Float32Array; rate: number }> {
  const t0 = nowMs();
  if (impl !== "tube_formant" && impl !== "formant_fixture") {
    throw new Error(`Synth not implemented: ${impl}`);
  }
  const result = render(notes, {
    len: BASE_LEN,
    epi: 0.3,
    vib: 28,
    jit: 0.35,
    breath: 0.3,
    oq: 0.65,
    glide: 0.07,
    seed: 7,
  });
  return {
    value: { samples: result.samples, rate: result.rate },
    fingerprint: impl,
    ms: nowMs() - t0,
  };
}

/** Vocoder — pass-through fixture (waveform already from tube) */
export function stageVocoderDefault(
  samples: Float32Array,
  rate: number,
): StageResult<{ samples: Float32Array; rate: number }> {
  const t0 = nowMs();
  return {
    value: { samples, rate },
    fingerprint: "default",
    ms: nowMs() - t0,
  };
}

/** Reverb send — LAST stage only (FIG 1.1 note 4). Vocal Atmos FDN (PVC glue). */
export function stageReverbSend(
  samples: Float32Array,
  rate: number,
  on: boolean,
  preset: AtmosPreset = "intimate_vocal",
): StageResult<{ samples: Float32Array; rate: number }> {
  const t0 = nowMs();
  if (!on) {
    return { value: { samples, rate }, fingerprint: "none", ms: nowMs() - t0 };
  }
  const out = processVocalAtmos(samples, rate, preset);
  return {
    value: { samples: out, rate },
    fingerprint: VOCAL_ATMOS_FINGERPRINT,
    ms: nowMs() - t0,
  };
}

/** Plan B SVC — not in browser zips */
export function stageSvc(_audio: Float32Array, impl: string): StageResult<Float32Array> {
  throw new Error(`SVC not implemented: ${impl}`);
}

export { assignNotes, planLyrics, g2pLine };
