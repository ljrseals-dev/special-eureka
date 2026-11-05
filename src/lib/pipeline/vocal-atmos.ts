/**
 * Vocal Atmos Chain — browser FDN reverb send (PVC glue).
 * Ported from vocal_atmos_chain FDNReverb (8 lines, Hadamard feedback).
 * Last stage only — never feeds F0 / align (FIG 1.1 note 4).
 */

export type AtmosPreset = "intimate_vocal" | "aclass_air" | "immersive_cloud" | "wide_mod";

export type AtmosParams = {
  roomSize: number;
  damping: number;
  reverbWet: number;
  reverbDry: number;
  outputGainDb: number;
};

export const ATMOS_PRESETS: Record<AtmosPreset, AtmosParams> = {
  intimate_vocal: {
    roomSize: 0.35,
    damping: 0.6,
    reverbWet: 0.15,
    reverbDry: 0.85,
    outputGainDb: 0,
  },
  aclass_air: {
    roomSize: 0.55,
    damping: 0.45,
    reverbWet: 0.22,
    reverbDry: 0.78,
    outputGainDb: -1,
  },
  immersive_cloud: {
    roomSize: 0.8,
    damping: 0.35,
    reverbWet: 0.4,
    reverbDry: 0.6,
    outputGainDb: -1.5,
  },
  wide_mod: {
    roomSize: 0.7,
    damping: 0.4,
    reverbWet: 0.3,
    reverbDry: 0.7,
    outputGainDb: -2,
  },
};

const N = 8;
const BASE_DELAYS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];

function hadamard8(v: Float64Array) {
  for (let step = 1; step < 8; step <<= 1) {
    for (let i = 0; i < 8; i += step << 1) {
      for (let j = i; j < i + step; j++) {
        const a = v[j]!;
        const b = v[j + step]!;
        v[j] = a + b;
        v[j + step] = a - b;
      }
    }
  }
  const norm = 1 / Math.SQRT2 / 2; // 1/sqrt(8)
  for (let i = 0; i < 8; i++) v[i]! *= norm;
}

/**
 * Process mono wet send through 8-line FDN; mix dry/wet + output gain.
 * Returns mono float32 (sum of FDN taps mixed with dry).
 */
export function processVocalAtmos(
  input: Float32Array,
  sampleRate: number,
  preset: AtmosPreset | AtmosParams = "intimate_vocal",
): Float32Array {
  const p: AtmosParams =
    typeof preset === "string" ? ATMOS_PRESETS[preset] : preset;

  const scale = 0.4 + p.roomSize * 1.2;
  const delayLen = BASE_DELAYS.map((d) => Math.max(16, Math.floor(d * scale * (sampleRate / 44100))));
  const lines = delayLen.map((len) => new Float64Array(len));
  const writeIdx = new Int32Array(N);
  const lpState = new Float64Array(N);
  const fbGain = 0.72 + p.roomSize * 0.24;
  const dampCoeff = 0.2 + p.damping * 0.6;
  const gain = Math.pow(10, p.outputGainDb / 20);

  const out = new Float32Array(input.length);
  const tmp = new Float64Array(N);

  for (let i = 0; i < input.length; i++) {
    const inj = input[i]!;
    // Read delay taps
    for (let k = 0; k < N; k++) {
      const line = lines[k]!;
      const ri = writeIdx[k]!;
      tmp[k] = line[ri]!;
    }
    // Hadamard feedback mix
    hadamard8(tmp);
    // Write back with damping LPF + injection on all lines (mono)
    let wetSum = 0;
    for (let k = 0; k < N; k++) {
      const line = lines[k]!;
      const wi = writeIdx[k]!;
      const filtered = tmp[k]! * (1 - dampCoeff) + lpState[k]! * dampCoeff;
      lpState[k] = filtered;
      const written = inj * 0.15 + filtered * fbGain;
      line[wi] = written;
      writeIdx[k] = (wi + 1) % line.length;
      wetSum += filtered;
    }
    const wet = (wetSum / N) * p.reverbWet;
    const dry = inj * p.reverbDry;
    out[i] = (dry + wet) * gain;
  }

  return out;
}

export const VOCAL_ATMOS_FINGERPRINT = "vocal_atmos:fdn_v1";
