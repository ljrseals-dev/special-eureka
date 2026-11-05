/**
 * Harmonia pipeline types — aligned with Engineering Drawing Set
 * Sheet 1 (FIG 1.1 / 1.3) and Sheet 3 (Plan A / Plan B).
 */

export type PlanId = "A" | "B";

/** FIG 1.1 / 1.3 stage ids in fixed order */
export type StageId =
  | "dry_tap"
  | "asr"
  | "forced_align"
  | "f0_track"
  | "f0_snap"
  | "synth"
  | "svc"
  | "vocoder"
  | "reverb_send";

export type StageResult<T = unknown> = {
  value: T;
  /** Must equal requested impl — silent fallback is a hard fail */
  fingerprint: string;
  /** Compute time ms (not e2e I/O) */
  ms: number;
};

export type StageStatus = "ran" | "skipped" | "failed" | "not_implemented";

export type StageReport = {
  stage: StageId;
  impl: string;
  status: StageStatus;
  fingerprint?: string;
  ms?: number;
  error?: string;
};

export type PipelineCombo = {
  plan: PlanId;
  /** Plan A */
  asr?: string;
  forced_align?: string;
  f0_track: string;
  f0_snap?: "off" | "on";
  key_root?: number;
  scale?: string;
  snap_strength?: number;
  synth?: string;
  /** Plan B */
  svc?: string;
  vocoder?: string;
  reverb_send?: "none" | "on";
  /** Vocal Atmos FDN preset (PVC glue) when reverb_send is on */
  atmos_preset?: "intimate_vocal" | "aclass_air" | "immersive_cloud" | "wide_mod";
  buffer_samples?: 64 | 128 | 256;
};

export type PipelineOutput = {
  plan: PlanId;
  combo: PipelineCombo;
  /** Dry path — monitor reference (FIG 3.5: performer hears dry) */
  dry: Float32Array | null;
  /** Converted path — audience (Plan A offline / Plan B live) */
  converted: Float32Array | null;
  sampleRate: number;
  stages: StageReport[];
  fingerprints: Record<string, string>;
  stagesMs: Record<string, number>;
  /** Compute-only sum; not e2e */
  audienceComputeMs: number;
  audienceComputeOk: boolean;
  /** Blank until real I/O loopback */
  monitorMs: string;
  monitorMeasured: 0;
  audienceE2eMs: string;
  audienceE2eOk: string;
  notes?: { t0: number; t1: number; midi: number; syl: string; f0: number }[];
  lyrics?: string;
};

export const AUDIENCE_COMPUTE_CEILING_MS = 90;
/** Monitor ceiling applies to DRY path only (Rev C / FIG 3.5) */
export const MONITOR_DRY_CEILING_MS = 35;
