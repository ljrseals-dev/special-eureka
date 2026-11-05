import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, GitBranch, Play, Square } from "lucide-react";
import { runPipeline } from "@/lib/pipeline/run";
import type { PipelineCombo, PipelineOutput, StageReport } from "@/lib/pipeline/types";
import { toWav } from "@/lib/tube-singer/tract";

const DEFAULT_LYRICS = `Daisy, Daisy, give me your answer do
I'm half crazy all for the love of you
It won't be a stylish marriage
I can't afford a carriage`;

const STAGE_ORDER: StageReport["stage"][] = [
  "dry_tap",
  "asr",
  "forced_align",
  "f0_track",
  "f0_snap",
  "synth",
  "svc",
  "vocoder",
  "reverb_send",
];

export function PipelineStudio() {
  const [plan, setPlan] = useState<"A" | "B">("A");
  const [lyrics, setLyrics] = useState(DEFAULT_LYRICS);
  const [reverb, setReverb] = useState<"none" | "on">("on");
  const [atmosPreset, setAtmosPreset] = useState<
    "intimate_vocal" | "aclass_air" | "immersive_cloud" | "wide_mod"
  >("intimate_vocal");
  const [keyRoot, setKeyRoot] = useState(0);
  const [scale, setScale] = useState("major");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<PipelineOutput | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const combo: PipelineCombo = useMemo(
    () => ({
      plan,
      asr: "text_buffer",
      forced_align: "align_fixture",
      f0_track: "f0_from_notes",
      f0_snap: "on",
      key_root: keyRoot,
      scale,
      snap_strength: 1,
      synth: "tube_formant",
      svc: "rvc",
      vocoder: "default",
      reverb_send: reverb,
      atmos_preset: atmosPreset,
      buffer_samples: 128,
    }),
    [plan, reverb, atmosPreset, keyRoot, scale],
  );

  const run = useCallback(() => {
    setBusy(true);
    setOut(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setTimeout(() => {
      try {
        const result = runPipeline({ combo, lyrics });
        setOut(result);
        if (result.converted && result.converted.length) {
          const wav = toWav(result.converted, result.sampleRate);
          setAudioUrl(URL.createObjectURL(new Blob([wav], { type: "audio/wav" })));
        }
      } finally {
        setBusy(false);
      }
    }, 20);
  }, [combo, lyrics, audioUrl]);

  const onPlay = () => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    a.currentTime = 0;
    void a.play();
    setPlaying(true);
  };

  const onStop = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlaying(false);
  };

  const download = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `plan-${plan}-converted.wav`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">
          Harmonia pipeline · Engineering Drawing Set Rev D
        </p>
        <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">
          Pipeline studio
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Fixed stage order from FIG 1.1 / 1.3. Plan A is text-anchored offline draft (not a 90&nbsp;ms
          live path). Plan B is live SVC bypass — blocked until an SVC is installed. Monitor = dry
          (≤35&nbsp;ms ceiling on hardware I/O, not measured here). Audience = converted.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link to="/" className="text-brass hover:underline">
            Karaoke
          </Link>
          <Link to="/write" className="text-muted hover:text-brass">
            Write → Sing
          </Link>
          <Link to="/studio" className="text-muted hover:text-brass">
            Consent studio
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
            Configuration
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={() => setPlan("A")}
              className={`rounded-lg px-4 py-2 text-sm ${
                plan === "A" ? "bg-brass text-ink" : "border border-line bg-raised text-fg"
              }`}
            >
              Plan A · text-anchored
            </button>
            <button
              type="button"
              onClick={() => setPlan("B")}
              className={`rounded-lg px-4 py-2 text-sm ${
                plan === "B" ? "bg-brass text-ink" : "border border-line bg-raised text-fg"
              }`}
            >
              Plan B · live SVC
            </button>
          </div>

          {plan === "A" && (
            <>
              <label className="mb-2 block text-sm text-muted">Lyrics (ASR text buffer)</label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                rows={8}
                className="mb-3 w-full rounded-lg border border-line bg-raised px-3 py-2 font-mono text-sm text-fg"
              />
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label className="text-sm">
                  <span className="text-muted">Key root</span>
                  <input
                    type="number"
                    min={0}
                    max={11}
                    value={keyRoot}
                    onChange={(e) => setKeyRoot(+e.target.value || 0)}
                    className="mt-1 w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-fg"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">Scale</span>
                  <select
                    value={scale}
                    onChange={(e) => setScale(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-fg"
                  >
                    <option value="major">major</option>
                    <option value="minor">minor</option>
                    <option value="chromatic">chromatic</option>
                    <option value="major_pent">major_pent</option>
                    <option value="minor_pent">minor_pent</option>
                  </select>
                </label>
              </div>
            </>
          )}

          {plan === "B" && (
            <p className="mb-3 text-sm text-muted">
              Bypass path: ASR + alignment omitted. Requires F0 tracker + SVC (RVC) — not present in
              browser zips. Run will report failed stages honestly.
            </p>
          )}

          <label className="mb-2 flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={reverb === "on"}
              onChange={(e) => setReverb(e.target.checked ? "on" : "none")}
            />
            Vocal Atmos reverb send (last stage · audience only · PVC glue)
          </label>
          {reverb === "on" && (
            <label className="mb-4 block text-sm">
              <span className="text-muted">Atmos preset</span>
              <select
                value={atmosPreset}
                onChange={(e) =>
                  setAtmosPreset(
                    e.target.value as
                      | "intimate_vocal"
                      | "aclass_air"
                      | "immersive_cloud"
                      | "wide_mod",
                  )
                }
                className="mt-1 w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-fg"
              >
                <option value="intimate_vocal">Intimate Vocal</option>
                <option value="aclass_air">A-Class Air</option>
                <option value="immersive_cloud">Immersive Cloud</option>
                <option value="wide_mod">Wide MOD</option>
              </select>
            </label>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={run}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brass px-5 text-sm font-medium text-ink disabled:opacity-40"
          >
            <GitBranch className="h-4 w-4" />
            {busy ? "Running…" : "Run pipeline"}
          </button>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
            FIG stage chain
          </h2>
          <ol className="space-y-2">
            {STAGE_ORDER.map((id) => {
              const rep = out?.stages.find((s) => s.stage === id);
              const status = rep?.status ?? "—";
              const color =
                status === "ran"
                  ? "border-brass/50 bg-brass/10"
                  : status === "failed"
                    ? "border-oxide/50 bg-oxide/10"
                    : status === "skipped"
                      ? "border-line bg-raised/50"
                      : "border-line bg-raised";
              return (
                <li
                  key={id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${color}`}
                >
                  <span className="font-mono text-fg">{id}</span>
                  <span className="text-xs text-muted">
                    {rep ? `${rep.status} · ${rep.impl}` : "pending"}
                    {rep?.fingerprint ? ` · ${rep.fingerprint}` : ""}
                    {rep?.ms != null ? ` · ${rep.ms.toFixed(1)}ms` : ""}
                  </span>
                  {rep?.error && (
                    <span className="w-full text-xs text-oxide">{rep.error}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {out && (
        <section className="mt-4 rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
            Path results (FIG 3.5)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-lg border border-line bg-raised p-3">
              <p className="text-xs uppercase text-muted">Monitor (dry)</p>
              <p className="text-fg">
                {out.dry ? `${out.dry.length} samples` : "no mic buffer (browser)"}
              </p>
              <p className="text-xs text-muted">
                ceiling 35 ms · measured: {out.monitorMeasured ? out.monitorMs : "blank"}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-raised p-3">
              <p className="text-xs uppercase text-muted">Audience (converted)</p>
              <p className="text-fg">
                {out.converted ? `${out.converted.length} samples @ ${out.sampleRate} Hz` : "none"}
              </p>
              <p className="text-xs text-muted">
                compute {out.audienceComputeMs.toFixed(1)} ms · compute_ok=
                {out.audienceComputeOk ? 1 : 0} · e2e blank
              </p>
            </div>
          </div>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-line bg-raised p-2 font-mono text-xs text-muted">
            {JSON.stringify({ fingerprints: out.fingerprints, stages_ms: out.stagesMs }, null, 2)}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!audioUrl}
              onClick={playing ? onStop : onPlay}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm text-fg disabled:opacity-40"
            >
              {playing ? (
                <>
                  <Square className="h-4 w-4" /> Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Play converted
                </>
              )}
            </button>
            <button
              type="button"
              disabled={!audioUrl}
              onClick={download}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm text-fg disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> WAV
            </button>
            {audioUrl && (
              <audio ref={audioRef} src={audioUrl} className="hidden" onEnded={() => setPlaying(false)} />
            )}
          </div>
          {out.plan === "A" && (
            <p className="mt-3 text-xs text-muted">
              Plan A is offline / near-real-time only (FIG 3.5). Do not score it against a 90&nbsp;ms
              live audience ceiling.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
