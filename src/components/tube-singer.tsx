import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Mic2, Play, Square } from "lucide-react";
import {
  notes as makeNotes,
  lyricAt,
  LYRIC_LINES,
  type Note,
} from "@/lib/tube-singer/song";
import { render, toWav, BASE_LEN, type RenderCfg, type TraceFrame } from "@/lib/tube-singer/tract";

const DEFAULTS: Required<Omit<RenderCfg, "trace" | "seed">> = {
  len: BASE_LEN,
  epi: 0.35,
  vib: 28,
  jit: 0.45,
  breath: 0.35,
  oq: 0.65,
  glide: 0.07,
};

export function TubeSinger() {
  const [bpm, setBpm] = useState(92);
  const [transpose, setTranspose] = useState(0);
  const [cfg, setCfg] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceFrame[]>([]);
  const [songNotes, setSongNotes] = useState<Note[]>([]);
  const [currentSyl, setCurrentSyl] = useState("");
  const [lyricLine, setLyricLine] = useState(0);
  const [sylInLine, setSylInLine] = useState(-1);
  const [playT, setPlayT] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scoreRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  const rebuild = useCallback(() => {
    setBusy(true);
    // yield so UI can show busy
    setTimeout(() => {
      try {
        const n = makeNotes(bpm, transpose);
        const result = render(n, { ...cfg, seed: 42, trace: true });
        const wav = toWav(result.samples, result.rate);
        const blob = new Blob([wav], { type: "audio/wav" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setTrace(result.trace);
        setSongNotes(n);
        setCurrentSyl("");
        setPlayT(0);
      } finally {
        setBusy(false);
      }
    }, 30);
  }, [bpm, transpose, cfg, audioUrl]);

  useEffect(() => {
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw tract profile
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trace.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const frame =
      playing && playT > 0
        ? trace.reduce((best, f) => (Math.abs(f.t - playT) < Math.abs(best.t - playT) ? f : best), trace[0]!)
        : trace[Math.floor(trace.length * 0.35)]!;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1c1914";
    ctx.fillRect(0, 0, w, h);

    const area = frame.area;
    const maxA = 14;
    const midY = h * 0.5;
    const x0 = 24;
    const x1 = w - 16;
    const step = (x1 - x0) / (area.length - 1);

    // center line
    ctx.strokeStyle = "#3a332a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, midY);
    ctx.lineTo(x1, midY);
    ctx.stroke();

    // area function as symmetric tube
    ctx.beginPath();
    for (let i = 0; i < area.length; i++) {
      const x = x0 + i * step;
      const half = (Math.sqrt(area[i]! / Math.PI) / Math.sqrt(maxA / Math.PI)) * (h * 0.38);
      if (i === 0) ctx.moveTo(x, midY - half);
      else ctx.lineTo(x, midY - half);
    }
    for (let i = area.length - 1; i >= 0; i--) {
      const x = x0 + i * step;
      const half = (Math.sqrt(area[i]! / Math.PI) / Math.sqrt(maxA / Math.PI)) * (h * 0.38);
      ctx.lineTo(x, midY + half);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(211, 146, 58, 0.18)";
    ctx.fill();
    ctx.strokeStyle = "#d3923a";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // labels
    ctx.fillStyle = "#a39888";
    ctx.font = "11px Outfit, system-ui, sans-serif";
    ctx.fillText("glottis", x0, h - 8);
    ctx.textAlign = "right";
    ctx.fillText("lips", x1, h - 8);
    ctx.textAlign = "left";
    ctx.fillText(`${frame.f0.toFixed(0)} Hz`, x0, 16);
  }, [trace, playT, playing]);

  // Draw piano-roll score
  useEffect(() => {
    const canvas = scoreRef.current;
    if (!canvas || songNotes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1c1914";
    ctx.fillRect(0, 0, w, h);

    const tMax = Math.max(...songNotes.map((n) => n.t1)) + 0.3;
    const midis = songNotes.map((n) => n.midi);
    const lo = Math.min(...midis) - 1;
    const hi = Math.max(...midis) + 1;
    const padL = 36;
    const padR = 12;
    const padT = 12;
    const padB = 20;

    // grid
    ctx.strokeStyle = "#3a332a";
    ctx.lineWidth = 1;
    for (let m = lo; m <= hi; m++) {
      const y = padT + ((hi - m) / (hi - lo)) * (h - padT - padB);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }

    // notes
    for (const n of songNotes) {
      const x = padL + (n.t0 / tMax) * (w - padL - padR);
      const x2 = padL + (n.t1 / tMax) * (w - padL - padR);
      const y = padT + ((hi - n.midi) / (hi - lo)) * (h - padT - padB);
      const active = playing && playT >= n.t0 && playT < n.t1;
      ctx.fillStyle = active ? "#d3923a" : "rgba(211, 146, 58, 0.55)";
      ctx.fillRect(x, y - 6, Math.max(3, x2 - x - 1), 12);
      if (n.syl) {
        ctx.fillStyle = active ? "#1a1208" : "#a39888";
        ctx.font = "10px Outfit, system-ui, sans-serif";
        ctx.fillText(n.syl, x + 2, y + 3);
      }
    }

    // playhead
    if (playing && playT > 0) {
      const x = padL + (playT / tMax) * (w - padL - padR);
      ctx.strokeStyle = "#c45c3e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, h - padB);
      ctx.stroke();
    }
  }, [songNotes, playT, playing]);

  // audio clock for animation
  useEffect(() => {
    if (!playing || !audioRef.current) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const a = audioRef.current;
      if (a) {
        const t = a.currentTime;
        setPlayT(t);
        const loc = lyricAt(songNotes, t);
        setCurrentSyl(loc.syl);
        setLyricLine(loc.line);
        setSylInLine(loc.sylInLine);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, songNotes]);

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
    setPlayT(0);
    setCurrentSyl("");
    setLyricLine(0);
    setSylInLine(-1);
  };

  const download = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = "daisy-bell-tube-singer.wav";
    a.click();
  };

  const set = <K extends keyof typeof cfg>(key: K, v: (typeof cfg)[K]) =>
    setCfg((c) => ({ ...c, [key]: v }));

  const duration = songNotes.length ? Math.max(...songNotes.map((n) => n.t1)) + 0.3 : 0;
  const progress = duration > 0 ? Math.min(1, playT / duration) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">
            Karaoke · physical model · no cloning
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            You can Sing!
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Karaoke for Daisy Bell — follow the highlighted lyrics while the tube model sings.
            Tempo and key are adjustable. Everything runs in your browser.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link to="/write" className="text-brass hover:underline">
              Write → Sing (text-to-singing)
            </Link>
            <Link to="/studio" className="text-muted hover:text-brass">
              Consent studio
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1.5 text-xs text-muted">
          <Mic2 className="h-3.5 w-3.5 text-brass" />
          Daisy Bell · public domain
        </div>
      </header>

      <div className="grid gap-4">
        {/* Karaoke lyrics stage */}
        <section className="rounded-xl border border-line bg-surface p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Lyrics</h2>
            <span className="font-mono text-xs text-brass">
              {currentSyl ? `♪ ${currentSyl}` : playing ? "…" : "ready"}
            </span>
          </div>
          <div className="flex min-h-[14rem] flex-col justify-center gap-3 sm:min-h-[16rem]">
            {LYRIC_LINES.map((line, li) => {
              const active = li === lyricLine;
              const past = li < lyricLine;
              return (
                <p
                  key={li}
                  className={`text-center text-balance transition-all duration-200 ${
                    active
                      ? "font-display text-2xl font-semibold text-fg sm:text-3xl"
                      : past
                        ? "text-sm text-muted/50 sm:text-base"
                        : "text-sm text-muted sm:text-base"
                  }`}
                >
                  {active
                    ? line.syls.map((s, si) => (
                        <span key={si}>
                          <span
                            className={
                              si === sylInLine
                                ? "rounded px-0.5 text-brass"
                                : si < sylInLine
                                  ? "text-fg/70"
                                  : "text-fg"
                            }
                          >
                            {s}
                          </span>
                          {si < line.syls.length - 1 ? " " : ""}
                        </span>
                      ))
                    : line.text}
                </p>
              );
            })}
          </div>
          {/* Progress bar */}
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brass transition-[width] duration-100"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </section>

        {/* Transport */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !audioUrl}
              onClick={playing ? onStop : onPlay}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-brass px-6 text-sm font-medium text-ink disabled:opacity-40"
            >
              {playing ? (
                <>
                  <Square className="h-4 w-4" /> Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Sing along
                </>
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={rebuild}
              className="h-12 rounded-lg border border-line bg-raised px-4 text-sm text-fg disabled:opacity-40"
            >
              {busy ? "Rendering…" : "Re-render"}
            </button>
            <button
              type="button"
              disabled={!audioUrl}
              onClick={download}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm text-fg disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> WAV
            </button>
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                className="hidden"
                onEnded={() => {
                  setPlaying(false);
                  setPlayT(0);
                  setCurrentSyl("");
                  setLyricLine(0);
                  setSylInLine(-1);
                }}
              />
            )}
          </div>
        </section>

        {/* Score + tract side by side on larger screens */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Score</h2>
              <span className="font-mono text-sm text-brass">{currentSyl || "—"}</span>
            </div>
            <canvas ref={scoreRef} className="h-32 w-full rounded-lg" />
          </section>
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
                Vocal tract
              </h2>
              <span className="text-xs text-muted">{cfg.len.toFixed(1)} cm</span>
            </div>
            <canvas ref={canvasRef} className="h-32 w-full rounded-lg" />
          </section>
        </div>

        {/* Controls */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted">Controls</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Slider
              label="Tempo"
              value={bpm}
              min={60}
              max={140}
              step={1}
              unit=" BPM"
              onChange={setBpm}
            />
            <Slider
              label="Transpose"
              value={transpose}
              min={-12}
              max={12}
              step={1}
              unit=" st"
              onChange={setTranspose}
            />
            <Slider
              label="Tract length"
              value={cfg.len}
              min={14}
              max={20}
              step={0.1}
              unit=" cm"
              onChange={(v) => set("len", v)}
            />
            <Slider
              label="Singer's formant"
              value={cfg.epi}
              min={0}
              max={1}
              step={0.05}
              unit=""
              onChange={(v) => set("epi", v)}
            />
            <Slider
              label="Vibrato"
              value={cfg.vib}
              min={0}
              max={60}
              step={1}
              unit=" ¢"
              onChange={(v) => set("vib", v)}
            />
            <Slider
              label="Breath / aspiration"
              value={cfg.breath}
              min={0}
              max={1}
              step={0.05}
              unit=""
              onChange={(v) => set("breath", v)}
            />
            <Slider
              label="Open quotient"
              value={cfg.oq}
              min={0.4}
              max={0.9}
              step={0.05}
              unit=""
              onChange={(v) => set("oq", v)}
            />
            <Slider
              label="Jitter"
              value={cfg.jit}
              min={0}
              max={1}
              step={0.05}
              unit=""
              onChange={(v) => set("jit", v)}
            />
          </div>
          <p className="mt-4 text-xs text-muted">
            Change any control then press <strong className="text-fg">Re-render</strong>. The model
            re-simulates the entire song at the new settings (a couple of seconds).
          </p>
        </section>

        <footer className="pb-8 text-center text-xs text-muted">
          Karaoke · physical model only · no voice cloning · Daisy Bell is public domain ·{" "}
          <Link to="/studio" className="text-brass hover:underline">
            Halyard consent studio
          </Link>
        </footer>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-fg">{label}</span>
        <span className="font-mono text-xs text-brass">
          {typeof value === "number" && step < 1 ? value.toFixed(2) : value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-brass"
      />
    </label>
  );
}
