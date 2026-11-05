/**
 * Kelly-Lochbaum singer: 44-section lossless-tube vocal tract (scattering junctions),
 * Rosenberg glottal pulses, vibrato, optional epilarynx narrowing.
 * No DOM, no Web Audio: renders Float32 samples.
 * Ported from tube-singer (verified formants, pitch, singer's formant).
 */
import { VOWELS, type VowelKey } from "./vowels";
import type { Note } from "./song";

export const N = 44;
export const BASE_LEN = 17.5; // cm

const rng = (s: number) => () => {
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  return (s / 4294967296) * 2 - 1;
};

/** one sample of delay per section per direction: section = c / fs, tract length = N c / fs, c = 35000 cm/s */
export function simRate(lenCm: number): number {
  return 1540000 / lenCm;
}

/** Singer's-formant shaping, epi 0..1 */
function shaped(area: Float64Array | number[], epi: number): Float64Array {
  const a = Float64Array.from(area);
  if (epi > 0) {
    for (let i = 1; i <= 6; i++) {
      a[i] = Math.exp((1 - epi) * Math.log(a[i]!) + epi * Math.log(Math.min(a[i]!, 0.6)));
    }
    for (let i = 7; i <= 14; i++) {
      a[i] = Math.exp((1 - epi) * Math.log(a[i]!) + epi * Math.log(Math.max(a[i]!, 5)));
    }
  }
  return a;
}

/** Rosenberg glottal flow pulse, phase 0..1. */
function pulse(ph: number, oq: number): number {
  const tp = (0.4 * oq) / 0.65;
  const tn = (0.16 * oq) / 0.65;
  if (ph < tp) return 0.5 * (1 - Math.cos((Math.PI * ph) / tp));
  if (ph < tp + tn) return Math.cos((Math.PI / 2) * (ph - tp) / tn);
  return 0;
}

export type RenderCfg = {
  len?: number;
  epi?: number;
  vib?: number;
  jit?: number;
  breath?: number;
  oq?: number;
  seed?: number;
  trace?: boolean;
  glide?: number;
};

export type TraceFrame = {
  t: number;
  area: Float64Array;
  f0: number;
  amp: number;
};

export type RenderResult = {
  samples: Float32Array;
  rate: number;
  simRate: number;
  trace: TraceFrame[];
  len: number;
};

/**
 * notes: [{t0, t1, f0, vow: [key] or [key, key] (diphthong), tie, rest?}] in seconds.
 * cfg: len (tract cm), epi (0..1), vib (cents), jit (0..1), breath (0..1), oq (0.4..0.9)
 */
export function render(notes: Note[], cfg: RenderCfg = {}): RenderResult {
  const c = {
    len: BASE_LEN,
    epi: 0,
    vib: 28,
    jit: 0.5,
    breath: 0.4,
    oq: 0.65,
    seed: 1,
    trace: false,
    glide: 0.07,
    ...cfg,
  };
  const fs = simRate(c.len);
  const total = Math.max(...notes.map((n) => n.t1), 0) + 0.5;
  const len = Math.ceil(total * fs);
  const out = new Float32Array(len);
  const r = rng(c.seed);
  const tr: TraceFrame[] = [];

  const area = new Float64Array(N).fill(3);
  const ks = new Float64Array(N - 1);
  let f = new Float64Array(N);
  let b = new Float64Array(N);
  let nf = new Float64Array(N);
  let nb = new Float64Array(N);
  let lp = 0;
  let ph = 0;
  let jit = 0;
  let vph = 0;
  let ni = 0;
  let hz = 120;

  const target = new Float64Array(N);
  const logA = new Float64Array(N).fill(Math.log(3));

  const setTarget = (n: Note, frac: number) => {
    const v = n.vow;
    const a = VOWELS[v[0]!].area;
    const cArea = v.length > 1 ? VOWELS[v[v.length - 1]!].area : a;
    const s = v.length > 1 ? Math.min(1, Math.max(0, (frac - 0.55) / 0.4)) : 0;
    const w = s * s * (3 - 2 * s);
    const m = new Float64Array(N);
    for (let i = 0; i < N; i++) m[i] = a[i]! * (1 - w) + cArea[i]! * w;
    const sh = shaped(m, c.epi);
    for (let i = 0; i < N; i++) target[i] = Math.log(sh[i]!);
  };

  const coef = 1 - Math.exp(-32 / (c.glide * fs));
  const ampK = 1 - Math.exp(-1 / (0.006 * fs));
  const jitK = 1 - Math.exp(-1 / (0.0115 * fs));
  const loss = Math.pow(0.9995, 0.5);
  const lpa = 0.5;
  let amp = 0;
  let ampT = 0;
  let started = false;

  for (let s = 0; s < len; s++) {
    const t = s / fs;
    while (ni < notes.length && t >= notes[ni]!.t1) ni++;
    const n = ni < notes.length && t >= notes[ni]!.t0 ? notes[ni]! : null;

    if (s % 32 === 0) {
      if (n && !n.rest) {
        setTarget(n, (t - n.t0) / (n.t1 - n.t0));
        if (!started) {
          for (let i = 0; i < N; i++) logA[i] = target[i]!;
          started = true;
        }
      }
      for (let i = 0; i < N; i++) {
        logA[i]! += (target[i]! - logA[i]!) * coef;
        area[i] = Math.exp(logA[i]!);
      }
      for (let j = 0; j < N - 1; j++) {
        ks[j] = (area[j]! - area[j + 1]!) / (area[j]! + area[j + 1]!);
      }
      if (n && !n.rest) {
        const tt = t - n.t0;
        const dur = n.t1 - n.t0;
        const atk = Math.min(0.03, dur / 4);
        const rel = Math.min(0.06, dur / 3);
        let e = Math.min(1, tt / atk) * Math.min(1, (n.t1 - t) / rel);
        if (!n.tie && tt < 0.05 && !n.legato) e *= 0.55 + 0.45 * Math.min(1, tt / 0.05);
        ampT = e;
      } else {
        ampT = 0;
      }
      if (c.trace && s % 640 === 0) {
        tr.push({ t, area: Float64Array.from(area), f0: hz, amp: ampT });
      }
    }

    amp += (ampT - amp) * ampK;

    // glottal source
    let u = 0;
    if (n && !n.rest) {
      const dur = n.t1 - n.t0;
      const tt = t - n.t0;
      const vd = dur > 0.35 ? c.vib * Math.min(1, Math.max(0, (tt - 0.25) / 0.3)) : 0;
      vph += (2 * Math.PI * 5.6) / fs;
      jit += (r() * 0.0025 * c.jit - jit) * jitK;
      hz = n.f0 * Math.pow(2, (vd * Math.sin(vph)) / 1200) * (1 + jit);
      ph += hz / fs;
      if (ph >= 1) ph -= 1;
      u = pulse(ph, c.oq) * amp + c.breath * 0.03 * r() * amp;
    }

    nf[0] = u + 0.9 * b[0]!;
    for (let j = 0; j < N - 1; j++) {
      const k = ks[j]!;
      nf[j + 1] = (1 + k) * f[j]! - k * b[j + 1]!;
      nb[j] = k * f[j]! + (1 - k) * b[j + 1]!;
    }
    lp += lpa * (f[N - 1]! - lp);
    nb[N - 1] = -0.9 * lp;
    out[s] = f[N - 1]! + nb[N - 1]!;
    for (let j = 0; j < N; j++) {
      nf[j]! *= loss;
      nb[j]! *= loss;
    }
    let t1 = f;
    f = nf;
    nf = t1;
    t1 = b;
    b = nb;
    nb = t1;
  }

  // decimate by 2 with a 63-tap windowed-sinc low-pass (cutoff 0.45 of the new rate)
  const taps = 63;
  const h = new Float64Array(taps);
  const mid = (taps - 1) / 2;
  const fc = 0.225;
  let hs = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - mid;
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1));
    h[i] = (x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x)) * w;
    hs += h[i]!;
  }
  for (let i = 0; i < taps; i++) h[i]! /= hs;

  const dn = new Float32Array(Math.floor(len / 2));
  for (let i = 0; i < dn.length; i++) {
    let a = 0;
    const cIdx = i * 2;
    for (let k = 0; k < taps; k++) {
      const j = cIdx + k - mid;
      if (j >= 0 && j < len) a += h[k]! * out[j]!;
    }
    dn[i] = a;
  }

  return { samples: dn, rate: fs / 2, simRate: fs, trace: tr, len: c.len };
}

/** 16-bit PCM mono WAV. */
export function toWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  let m = 0;
  for (let i = 0; i < samples.length; i++) m = Math.max(m, Math.abs(samples[i]!));
  const k = m > 0 ? 0.95 / m : 1;
  const n = samples.length;
  const b = new ArrayBuffer(44 + n * 2);
  const d = new DataView(b);
  const s = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) d.setUint8(o + i, t.charCodeAt(i));
  };
  s(0, "RIFF");
  d.setUint32(4, 36 + n * 2, true);
  s(8, "WAVE");
  s(12, "fmt ");
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, sampleRate, true);
  d.setUint32(28, sampleRate * 2, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  s(36, "data");
  d.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]! * k));
    d.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return b;
}

export const KLTract = { render, simRate, shaped, VOWELS, N, BASE_LEN, toWav };
