/**
 * Pipeline runner — FIG 1.1 Plan A (text-anchored) and FIG 1.3 Plan B (bypass).
 * Order is fixed; stages are not permuted (drawing set rule).
 */
import {
  stageDryTap,
  stageAsrText,
  stageForcedAlignFixture,
  stageF0FromNotes,
  stageF0Snap,
  stageSynthTube,
  stageVocoderDefault,
  stageReverbSend,
  stageSvc,
  assignNotes,
} from "./stages";
import type { PipelineCombo, PipelineOutput, StageReport } from "./types";
import { AUDIENCE_COMPUTE_CEILING_MS } from "./types";

export type RunInput = {
  combo: PipelineCombo;
  /** Plan A: artist lyrics (text buffer stands in for streaming ASR) */
  lyrics?: string;
  /** Optional dry mic buffer (browser may be null) */
  dryAudio?: Float32Array | null;
  sampleRate?: number;
};

function fail(stage: StageReport["stage"], impl: string, error: string): StageReport {
  return { stage, impl, status: "failed", error };
}

function ran(
  stage: StageReport["stage"],
  impl: string,
  fingerprint: string,
  ms: number,
): StageReport {
  return { stage, impl, status: "ran", fingerprint, ms };
}

function skipped(stage: StageReport["stage"], impl: string): StageReport {
  return { stage, impl, status: "skipped" };
}

/** Plan A — FIG 1.1 text-anchored (offline / near-RT). Not a 90 ms live path. */
export function runPlanA(input: RunInput): PipelineOutput {
  const combo = { ...input.combo, plan: "A" as const };
  const lyrics = (input.lyrics ?? "").trim();
  const stages: StageReport[] = [];
  const fingerprints: Record<string, string> = {};
  const stagesMs: Record<string, number> = {};
  const sr = input.sampleRate ?? 48000;

  // 1. DRY TAP
  const dry = stageDryTap(input.dryAudio ?? null);
  stages.push(ran("dry_tap", "dry_tap:v1", dry.fingerprint, dry.ms));
  fingerprints.dry_tap = dry.fingerprint;
  stagesMs.dry_tap = dry.ms;

  if (!lyrics) {
    return finalize(combo, dry.value, null, sr, stages, fingerprints, stagesMs, undefined, lyrics);
  }

  // 2. ASR → text buffer (fixture)
  const asrImpl = combo.asr ?? "text_buffer";
  try {
    const asr = stageAsrText(lyrics, asrImpl);
    stages.push(ran("asr", asrImpl, asr.fingerprint, asr.ms));
    fingerprints.asr = asr.fingerprint;
    stagesMs.asr = asr.ms;
  } catch (e) {
    stages.push(fail("asr", asrImpl, e instanceof Error ? e.message : String(e)));
    return finalize(combo, dry.value, null, sr, stages, fingerprints, stagesMs, undefined, lyrics);
  }

  // 3. FORCED ALIGNMENT
  const alignImpl = combo.forced_align ?? "align_fixture";
  let lines;
  try {
    const al = stageForcedAlignFixture(lyrics);
    if (alignImpl !== "align_fixture") throw new Error(`align not implemented: ${alignImpl}`);
    stages.push(ran("forced_align", alignImpl, al.fingerprint, al.ms));
    fingerprints.forced_align = al.fingerprint;
    stagesMs.forced_align = al.ms;
    lines = al.value.lines;
  } catch (e) {
    stages.push(fail("forced_align", alignImpl, e instanceof Error ? e.message : String(e)));
    return finalize(combo, dry.value, null, sr, stages, fingerprints, stagesMs, undefined, lyrics);
  }

  // Melody + phoneme timeline from alignment
  const notes = assignNotes(lines, {
    bpm: 92,
    style: "pop",
    keyRoot: combo.key_root ?? 0,
    scale: (combo.scale as "major") ?? "major",
    snapStrength: combo.snap_strength ?? 1,
  });

  // 4. F0 TRACK
  const f0Impl = combo.f0_track ?? "f0_from_notes";
  let f0Curve: Float32Array;
  try {
    if (f0Impl !== "f0_from_notes") throw new Error(`F0 tracker not implemented: ${f0Impl}`);
    const f0r = stageF0FromNotes(notes);
    stages.push(ran("f0_track", f0Impl, f0r.fingerprint, f0r.ms));
    fingerprints.f0_track = f0r.fingerprint;
    stagesMs.f0_track = f0r.ms;
    f0Curve = f0r.value;
  } catch (e) {
    stages.push(fail("f0_track", f0Impl, e instanceof Error ? e.message : String(e)));
    return finalize(combo, dry.value, null, sr, stages, fingerprints, stagesMs, notes, lyrics);
  }

  // 5. F0 SNAP (before synth — FIG 1.1 note 3)
  if ((combo.f0_snap ?? "on") !== "off") {
    const snap = stageF0Snap(f0Curve, {
      keyRoot: combo.key_root,
      scale: combo.scale,
      strength: combo.snap_strength,
    });
    stages.push(ran("f0_snap", "snap_f0:v1", snap.fingerprint, snap.ms));
    fingerprints.f0_snap = snap.fingerprint;
    stagesMs.f0_snap = snap.ms;
    f0Curve = snap.value;
    // Re-apply snapped F0 onto notes for synth
    for (const n of notes) {
      const mid = 0.5 * (n.t0 + n.t1);
      const idx = Math.min(f0Curve.length - 1, Math.max(0, Math.floor(mid / 0.01)));
      if (f0Curve[idx]! > 0) {
        n.f0 = f0Curve[idx]!;
        n.midi = Math.round(69 + 12 * Math.log2(n.f0 / 440));
      }
    }
  } else {
    stages.push(skipped("f0_snap", "off"));
  }

  // Plan A: SVC slot unused
  stages.push(skipped("svc", "—"));

  // 6. F0-CONDITIONED SYNTH
  const synthImpl = combo.synth ?? "tube_formant";
  let samples: Float32Array;
  let rate: number;
  try {
    const syn = stageSynthTube(notes, synthImpl);
    stages.push(ran("synth", synthImpl, syn.fingerprint, syn.ms));
    fingerprints.synth = syn.fingerprint;
    stagesMs.synth = syn.ms;
    samples = syn.value.samples;
    rate = syn.value.rate;
  } catch (e) {
    stages.push(fail("synth", synthImpl, e instanceof Error ? e.message : String(e)));
    return finalize(combo, dry.value, null, sr, stages, fingerprints, stagesMs, notes, lyrics);
  }

  // 7. VOCODER
  const vocImpl = combo.vocoder ?? "default";
  try {
    const voc = stageVocoderDefault(samples, rate);
    if (vocImpl !== "default") throw new Error(`vocoder not implemented: ${vocImpl}`);
    stages.push(ran("vocoder", vocImpl, voc.fingerprint, voc.ms));
    fingerprints.vocoder = voc.fingerprint;
    stagesMs.vocoder = voc.ms;
    samples = voc.value.samples;
    rate = voc.value.rate;
  } catch (e) {
    stages.push(fail("vocoder", vocImpl, e instanceof Error ? e.message : String(e)));
    return finalize(combo, dry.value, null, sr, stages, fingerprints, stagesMs, notes, lyrics);
  }

  // 8. REVERB SEND — last only; audience path (FIG Rev C: not on dry monitor)
  const revOn = (combo.reverb_send ?? "none") === "on";
  try {
    const rev = stageReverbSend(samples, rate, revOn);
    stages.push(
      ran("reverb_send", revOn ? "simple_send:v1" : "none", rev.fingerprint, rev.ms),
    );
    fingerprints.reverb_send = rev.fingerprint;
    stagesMs.reverb_send = rev.ms;
    samples = rev.value.samples;
    rate = rev.value.rate;
  } catch (e) {
    stages.push(fail("reverb_send", "on", e instanceof Error ? e.message : String(e)));
  }

  return finalize(combo, dry.value, samples, rate, stages, fingerprints, stagesMs, notes, lyrics);
}

/** Plan B — FIG 1.3 live SVC bypass. Runnable count 0 until SVC exists. */
export function runPlanB(input: RunInput): PipelineOutput {
  const combo = { ...input.combo, plan: "B" as const };
  const stages: StageReport[] = [];
  const fingerprints: Record<string, string> = {};
  const stagesMs: Record<string, number> = {};
  const sr = input.sampleRate ?? 48000;

  const dry = stageDryTap(input.dryAudio ?? null);
  stages.push(ran("dry_tap", "dry_tap:v1", dry.fingerprint, dry.ms));
  fingerprints.dry_tap = dry.fingerprint;
  stagesMs.dry_tap = dry.ms;

  // ASR + align omitted on bypass
  stages.push(skipped("asr", "bypass"));
  stages.push(skipped("forced_align", "bypass"));

  stages.push(
    fail("f0_track", combo.f0_track ?? "rmvpe", "Plan B F0 tracker not installed in browser"),
  );
  stages.push(skipped("f0_snap", combo.f0_snap ?? "off"));
  stages.push(skipped("synth", "—"));

  const svcImpl = combo.svc ?? "rvc";
  try {
    stageSvc(dry.value ?? new Float32Array(0), svcImpl);
  } catch (e) {
    stages.push(fail("svc", svcImpl, e instanceof Error ? e.message : String(e)));
  }

  stages.push(fail("vocoder", combo.vocoder ?? "default", "blocked: SVC failed"));
  stages.push(skipped("reverb_send", combo.reverb_send ?? "none"));

  return finalize(combo, dry.value, null, sr, stages, fingerprints, stagesMs);
}

function finalize(
  combo: PipelineCombo,
  dry: Float32Array | null,
  converted: Float32Array | null,
  sampleRate: number,
  stages: StageReport[],
  fingerprints: Record<string, string>,
  stagesMs: Record<string, number>,
  notes?: { t0: number; t1: number; midi: number; syl: string; f0: number }[],
  lyrics?: string,
): PipelineOutput {
  const audienceComputeMs = Object.values(stagesMs).reduce((a, b) => a + b, 0);
  return {
    plan: combo.plan,
    combo,
    dry,
    converted,
    sampleRate,
    stages,
    fingerprints,
    stagesMs,
    audienceComputeMs,
    audienceComputeOk: audienceComputeMs <= AUDIENCE_COMPUTE_CEILING_MS,
    monitorMs: "",
    monitorMeasured: 0,
    audienceE2eMs: "",
    audienceE2eOk: "",
    notes,
    lyrics,
  };
}

export function runPipeline(input: RunInput): PipelineOutput {
  if (input.combo.plan === "B") return runPlanB(input);
  return runPlanA(input);
}
