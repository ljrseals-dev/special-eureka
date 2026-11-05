import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileJson, Mic2, Play, Square, Wand2 } from "lucide-react";
import { g2pLine } from "@/lib/text-to-sing/g2p";
import {
  assignNotes,
  planLyrics,
  toProject,
  type LinePlan,
  type MelodyStyle,
  type SingProject,
} from "@/lib/text-to-sing/melody";
import { lyricAt, LYRIC_LINES, type Note } from "@/lib/tube-singer/song";
import { render, toWav, BASE_LEN, type RenderCfg } from "@/lib/tube-singer/tract";

const DEFAULT_LYRICS = `Daisy, Daisy, give me your answer do
I'm half crazy all for the love of you
It won't be a stylish marriage
I can't afford a carriage
But you'll look sweet upon the seat
Of a bicycle built for two`;

const VOICE: Required<Omit<RenderCfg, "trace" | "seed">> = {
  len: BASE_LEN,
  epi: 0.3,
  vib: 32,
  jit: 0.4,
  breath: 0.3,
  oq: 0.65,
  glide: 0.08,
};

export function TextToSing() {
  const [lyrics, setLyrics] = useState(DEFAULT_LYRICS);
  const [bpm, setBpm] = useState(92);
  const [transpose, setTranspose] = useState(0);
  const [style, setStyle] = useState<MelodyStyle>("pop");
  const [lines, setLines] = useState<LinePlan[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playT, setPlayT] = useState(0);
  const [currentSyl, setCurrentSyl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);

  const analyze = useCallback(() => {
    setError(null);
    try {
      const planned = planLyrics(lyrics, g2pLine);
      if (!planned.length) {
        setError("Add at least one line of lyrics.");
        return;
      }
      const assigned = assignNotes(planned, { bpm, style, transpose });
      setLines(planned);
      setNotes(assigned);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze lyrics.");
    }
  }, [lyrics, bpm, style, transpose]);

  const doRender = useCallback(() => {
    if (!notes.length) {
      setError("Analyze lyrics first.");
      return;
    }
    setBusy(true);
    setError(null);
    setTimeout(() => {
      try {
        const result = render(notes, { ...VOICE, seed: 7, trace: false });
        const wav = toWav(result.samples, result.rate);
        const blob = new Blob([wav], { type: "audio/wav" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        setPlayT(0);
        setCurrentSyl("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Render failed.");
      } finally {
        setBusy(false);
      }
    }, 30);
  }, [notes, audioUrl]);

  useEffect(() => {
    analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const loc = lyricAt(notes, t);
        setCurrentSyl(loc.syl);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, notes]);

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
  };

  const downloadWav = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = "text-to-sing-draft.wav";
    a.click();
  };

  const downloadProject = () => {
    if (!lines.length || !notes.length) return;
    const project: SingProject = toProject("Draft", lyrics, lines, notes, {
      bpm,
      transpose,
      style,
    });
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "text-to-sing-project.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const duration = notes.length ? Math.max(...notes.map((n) => n.t1)) + 0.2 : 0;
  const progress = duration > 0 ? Math.min(1, playT / duration) : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">
            Text-to-singing · draft tool
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Write → Sing
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Paste lyrics. We G2P, assign a draft melody, and sing them with the tube model.
            Fast draft — not a finished master. Your lyrics stay yours.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link to="/" className="text-brass hover:underline">
              Karaoke
            </Link>
            <Link to="/studio" className="text-muted hover:text-brass">
              Consent studio
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1.5 text-xs text-muted">
          <Mic2 className="h-3.5 w-3.5 text-brass" />
          Generic model · no cloning
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Left: lyrics + G2P */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Lyrics</h2>
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={10}
            spellCheck
            className="w-full resize-y rounded-lg border border-line bg-raised px-3 py-2 font-mono text-sm text-fg outline-none focus:border-brass"
            placeholder="One line per lyric line…"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={analyze}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm text-fg"
            >
              <Wand2 className="h-4 w-4 text-brass" />
              Analyze (G2P + melody)
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-oxide">{error}</p>}

          {lines.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
                Pronunciation
              </h3>
              {lines.map((line, i) => (
                <div key={i} className="rounded-lg border border-line bg-raised px-3 py-2">
                  <p className="text-xs text-muted">{line.text}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5 font-mono text-sm">
                    {line.syls.map((s, j) => (
                      <span
                        key={j}
                        className={`rounded px-1.5 py-0.5 ${
                          s.stress ? "bg-brass/20 text-brass" : "bg-line/40 text-fg"
                        }`}
                        title={`vow: ${s.vow.join("-")} stress:${s.stress}`}
                      >
                        {s.text}
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: transport + note list + playback */}
        <div className="grid gap-4 content-start">
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
              Voice & melody
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="text-muted">Tempo</span>
                <input
                  type="number"
                  min={60}
                  max={160}
                  value={bpm}
                  onChange={(e) => setBpm(+e.target.value || 92)}
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-fg"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Transpose</span>
                <input
                  type="number"
                  min={-12}
                  max={12}
                  value={transpose}
                  onChange={(e) => setTranspose(+e.target.value || 0)}
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-fg"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Style</span>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as MelodyStyle)}
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-fg"
                >
                  <option value="pop">Pop</option>
                  <option value="folk">Folk</option>
                  <option value="ballad">Ballad</option>
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              After changing tempo, transpose, or style, click Analyze again, then Render.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || !notes.length}
                onClick={doRender}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-brass px-5 text-sm font-medium text-ink disabled:opacity-40"
              >
                {busy ? "Rendering…" : "Render"}
              </button>
              <button
                type="button"
                disabled={!audioUrl}
                onClick={playing ? onStop : onPlay}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm text-fg disabled:opacity-40"
              >
                {playing ? (
                  <>
                    <Square className="h-4 w-4" /> Stop
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Play
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={!audioUrl}
                onClick={downloadWav}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm text-fg disabled:opacity-40"
              >
                <Download className="h-4 w-4" /> WAV
              </button>
              <button
                type="button"
                disabled={!notes.length}
                onClick={downloadProject}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm text-fg disabled:opacity-40"
              >
                <FileJson className="h-4 w-4" /> Project JSON
              </button>
            </div>
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                className="hidden"
                onEnded={() => {
                  setPlaying(false);
                  setPlayT(0);
                  setCurrentSyl("");
                }}
              />
            )}
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brass transition-[width] duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-sm text-brass">
              {currentSyl ? `♪ ${currentSyl}` : notes.length ? `${notes.length} notes ready` : "—"}
            </p>
          </section>

          {notes.length > 0 && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Note lane (draft)
              </h2>
              <div className="max-h-48 overflow-y-auto font-mono text-xs">
                <div className="grid grid-cols-[3rem_1fr_3rem] gap-x-2 gap-y-1 text-muted">
                  <span>t</span>
                  <span>syl</span>
                  <span>midi</span>
                  {notes.map((n, i) => (
                    <div key={i} className="contents text-fg">
                      <span>{n.t0.toFixed(2)}</span>
                      <span className={n.syl === currentSyl ? "text-brass" : ""}>{n.syl}</span>
                      <span>{n.midi}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <footer className="mt-8 pb-8 text-center text-xs text-muted">
        Draft tool · auto-melody is a starting point · no third-party voice cloning ·{" "}
        <Link to="/" className="text-brass hover:underline">
          back to karaoke
        </Link>
      </footer>
    </div>
  );
}
