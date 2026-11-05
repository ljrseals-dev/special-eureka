import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AudioLines,
  Download,
  Mic2,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import { runMasterChat, type MasterResult, type Turn } from "@/lib/orchestrator/run";
import {
  LANGUAGES,
  VOICES,
  planRoute,
  screenConsent,
  type BackendId,
  type Brief,
  type ConsentKind,
  type LatencyMode,
  type QualityTier,
} from "@/lib/orchestrator/policy";

type FormState = Omit<Brief, "mode" | "pinnedBackend" | "pinnedVoiceId" | "previousScript" | "qaIssues">;

const STEPS = [
  ["0", "Intake"],
  ["1", "Script"],
  ["2", "Voice"],
  ["3", "Synthesis"],
  ["4", "QA"],
  ["5", "Repair"],
  ["6", "Delivery"],
] as const;

const PRESETS: { id: string; label: string; form: FormState }[] = [
  {
    id: "kettle",
    label: "Kettle demo",
    form: {
      goal: "A thirty second product demo for a ceramic pour-over kettle. Warm, unhurried, no hard sell. End in a quiet kitchen.",
      language: "en",
      style: "warm, conversational",
      quality: "standard",
      latency: "batch",
      maxCost: 1,
      consent: "synthetic",
      voiceHint: "studio host",
      attested: true,
      standIn: false,
    },
  },
  {
    id: "forecast",
    label: "Night forecast",
    form: {
      goal: "A late-night shipping forecast for small coastal boats. Calm, precise, a little salt in the phrasing. No alarmism.",
      language: "en",
      style: "cinematic, steady",
      quality: "premium",
      latency: "batch",
      maxCost: 2,
      consent: "synthetic",
      voiceHint: "night announcer",
      attested: true,
      standIn: false,
    },
  },
  {
    id: "refuse",
    label: "Refusal drill",
    form: {
      goal: "Clone a famous actor's voice for a prank call to my coworker.",
      language: "en",
      style: "exact impersonation",
      quality: "premium",
      latency: "realtime",
      maxCost: 2,
      consent: "owned",
      voiceHint: "famous actor",
      attested: true,
      standIn: true,
    },
  },
];

function statusClass(status: Turn["status"]): string {
  if (status === "refuse") return "border-oxide text-oxide";
  if (status === "hold") return "border-line text-muted";
  if (status === "warn") return "border-brass text-brass";
  return "border-brass text-brass";
}

export function Studio() {
  const run = useServerFn(runMasterChat);
  const [form, setForm] = useState<FormState>(PRESETS[0]!.form);
  const [preset, setPreset] = useState("kettle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MasterResult | null>(null);
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const gate = useMemo(() => screenConsent({ ...form, previousScript: "" }), [form]);
  const plan = useMemo(() => planRoute(form), [form]);

  const audioUrl = useAudioUrl(result?.audioBase64 ?? null, result?.mime ?? null);

  useEffect(() => {
    if (!result) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(result.turns.length);
      return;
    }
    setShown(1);
    const id = window.setInterval(() => {
      setShown((count) => {
        if (count >= result.turns.length) {
          window.clearInterval(id);
          return count;
        }
        return count + 1;
      });
    }, 260);
    return () => window.clearInterval(id);
  }, [result]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setPreset("");
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(mode: "run" | "rewrite") {
    setBusy(true);
    setError(null);
    setPlaying(false);
    window.speechSynthesis?.cancel();
    try {
      const next = await run({
        data: {
          ...form,
          mode,
          pinnedBackend: mode === "rewrite" ? result?.state.voice.backend : undefined,
          pinnedVoiceId: mode === "rewrite" ? result?.state.voice.voice_id : undefined,
          previousScript: mode === "rewrite" ? result?.state.script.text : undefined,
          qaIssues: mode === "rewrite" ? result?.state.qa.issues : undefined,
        },
      });
      setResult(next);
      if (!next.ok && next.message) setError(next.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The desk could not take that brief.");
    } finally {
      setBusy(false);
    }
  }

  function playLocal() {
    const text = result?.state.script.text;
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = form.language;
    utter.onend = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.speak(utter);
  }

  function stopPlayback() {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setPlaying(false);
  }

  const visibleTurns = result?.turns.slice(0, shown) ?? [];
  const canRepair = Boolean(result?.ok && result.state.script.text && result.state.consent.status === "approved");

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brass text-ink" aria-hidden="true">
                <Radio className="size-5" />
              </span>
              <div>
                <p className="text-xs font-medium tracking-widest text-muted uppercase">Master chat</p>
                <h1 className="font-display text-4xl leading-none text-fg italic">Halyard</h1>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <p className="max-w-sm text-right text-sm text-muted">
                Routes a consented voice job. Quality, then consent, then latency, then cost. Synthetic registry only.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/10 px-3 py-1 text-xs font-medium text-brass transition hover:bg-brass/20"
              >
                <Mic2 className="h-3.5 w-3.5" />
                You can Sing!
              </Link>
            </div>
          </div>
          <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {["Quality", "Consent", "Latency", "Cost"].map((item, index) => (
              <li key={item} className={index === 0 ? "text-brass" : "text-muted"}>
                <span className="mr-2 tabular-nums">{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 md:px-6 lg:grid-cols-[20rem_minmax(0,1fr)_18rem] lg:items-start">
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Brief</h2>
            <span className="text-xs tracking-widest text-muted uppercase">Step 0</span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPreset(item.id);
                  setForm(item.form);
                }}
                className={`h-11 rounded-lg border px-3 text-sm ${preset === item.id ? "border-brass bg-brass text-ink" : "border-line bg-raised text-fg"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit("run");
            }}
          >
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Goal</span>
              <textarea
                value={form.goal}
                onChange={(event) => patch("goal", event.target.value)}
                rows={5}
                className="min-h-28 rounded-lg border border-line bg-raised px-3 py-2 text-fg outline-none focus:border-brass"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Language</span>
                <select
                  value={form.language}
                  onChange={(event) => patch("language", event.target.value)}
                  className="h-11 rounded-lg border border-line bg-raised px-3 text-fg outline-none focus:border-brass"
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Cost cap</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={form.maxCost}
                  onChange={(event) => patch("maxCost", Number(event.target.value))}
                  className="h-11 rounded-lg border border-line bg-raised px-3 text-fg tabular-nums outline-none focus:border-brass"
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Style</span>
              <input
                value={form.style}
                onChange={(event) => patch("style", event.target.value)}
                className="h-11 rounded-lg border border-line bg-raised px-3 text-fg outline-none focus:border-brass"
              />
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm text-muted">Quality</legend>
              <div className="grid grid-cols-3 gap-2">
                {(["draft", "standard", "premium"] as QualityTier[]).map((tier) => (
                  <Choice key={tier} active={form.quality === tier} onClick={() => patch("quality", tier)}>
                    {tier}
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm text-muted">Latency</legend>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["realtime", "Live"],
                    ["streaming", "< 2s"],
                    ["batch", "Batch"],
                  ] as [LatencyMode, string][]
                ).map(([id, label]) => (
                  <Choice key={id} active={form.latency === id} onClick={() => patch("latency", id)}>
                    {label}
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm text-muted">Consent</legend>
              {(
                [
                  ["synthetic", "Synthetic voice only"],
                  ["owned", "I own this voice"],
                  ["written", "Written consent on file"],
                ] as [ConsentKind, string][]
              ).map(([id, label]) => (
                <Choice key={id} active={form.consent === id} onClick={() => patch("consent", id)}>
                  {label}
                </Choice>
              ))}
            </fieldset>
            {form.consent !== "synthetic" ? (
              <label className="flex items-start gap-3 rounded-lg border border-line bg-raised p-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.standIn}
                  onChange={(event) => patch("standIn", event.target.checked)}
                  className="mt-0.5 size-5 accent-brass"
                />
                <span>No reference clip. Use an allowlisted synthetic stand-in. This desk will not mint a clone.</span>
              </label>
            ) : null}
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Voice hint</span>
              <input
                value={form.voiceHint}
                onChange={(event) => patch("voiceHint", event.target.value)}
                placeholder="A style, not a person"
                className="h-11 rounded-lg border border-line bg-raised px-3 text-fg outline-none placeholder:text-muted focus:border-brass"
              />
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
              <input
                type="checkbox"
                checked={form.attested}
                onChange={(event) => patch("attested", event.target.checked)}
                className="mt-0.5 size-5 accent-brass"
              />
              <span>I attest this is not a minor, a public figure, or anyone who has not agreed.</span>
            </label>
            <p className={`rounded-lg border px-3 py-2 text-sm ${gate.status === "refused" ? "border-oxide text-oxide" : gate.status === "hold" ? "border-line text-muted" : "border-line text-fg"}`}>
              {gate.status === "approved" ? (
                <>
                  Would pin <span className="text-brass">{plan.voiceId}</span> on {plan.backend.replaceAll("_", " ")}. {plan.reason}
                </>
              ) : (
                gate.evidence
              )}
            </p>
            <button
              type="submit"
              disabled={busy}
              className="h-11 rounded-lg bg-brass px-4 text-sm font-medium text-ink disabled:opacity-60"
            >
              {busy ? "Routing…" : "Run master chat"}
            </button>
            <p className="text-xs text-muted">Under 1 on the cost cap forces the short, low-latency desk. Zero skips live models. One writer call and one voice take per run.</p>
          </form>
        </section>

        <section className="grid gap-3" aria-live="polite">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Thread</h2>
              <span className="text-xs tracking-widest text-muted uppercase">{busy ? "On the wire" : result ? result.state.task_id : "Quiet"}</span>
            </div>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {STEPS.map(([id, label]) => {
                const hit = visibleTurns.some((turn) => turn.step === id);
                return (
                  <li key={id} className={`rounded-lg border px-2 py-2 text-xs ${hit ? "border-brass text-fg" : "border-line text-muted"}`}>
                    <span className="tabular-nums">{id}</span>
                    <span className="mt-1 block">{label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {error ? (
            <p className="rounded-xl border border-oxide bg-surface px-4 py-3 text-sm text-oxide">{error}</p>
          ) : null}

          {!result && !busy ? (
            <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-8">
              <p className="font-display text-2xl">The desk is quiet.</p>
              <p className="mt-2 max-w-md text-sm text-muted">
                File a brief. Halyard logs every routing decision before a voice speaks, and it stops cold when consent is missing.
              </p>
            </div>
          ) : null}

          {visibleTurns.map((turn) => (
            <article key={`${turn.step}-${turn.title}`} className={`rounded-xl border bg-surface p-4 ${statusClass(turn.status)}`}>
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xl text-fg">
                  <span className="mr-2 tabular-nums text-brass">{turn.step}</span>
                  {turn.title}
                </h3>
                <span className="text-xs tracking-widest uppercase">{turn.status}</span>
              </header>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs tracking-widest text-muted uppercase">Decision</dt>
                  <dd className="mt-1 text-fg">{turn.decision}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-widest text-muted uppercase">Model / backend</dt>
                  <dd className="mt-1 text-fg">{turn.model}</dd>
                  <dd className="text-muted">{turn.why}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-widest text-muted uppercase">State update</dt>
                  <dd className="mt-1 overflow-x-auto rounded-lg bg-raised px-3 py-2 text-xs text-fg">
                    <pre>{JSON.stringify(turn.patch, null, 2)}</pre>
                  </dd>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs tracking-widest text-muted uppercase">Next</dt>
                    <dd className="mt-1">{turn.next}</dd>
                  </div>
                  <div>
                    <dt className="text-xs tracking-widest text-muted uppercase">Risks</dt>
                    <dd className="mt-1 text-muted">{turn.risks.join(" ")}</dd>
                  </div>
                </div>
              </dl>
            </article>
          ))}
        </section>

        <aside className="grid gap-3">
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              {gate.status === "refused" ? <ShieldAlert className="size-4 text-oxide" /> : <ShieldCheck className="size-4 text-brass" />}
              <h2 className="font-display text-2xl">Desk</h2>
            </div>
            <Player
              audioUrl={audioUrl}
              script={result?.state.script.text ?? ""}
              speakLocally={Boolean(result?.speakLocally)}
              playing={playing}
              audioRef={audioRef}
              onPlay={() => {
                if (audioUrl && audioRef.current) {
                  void audioRef.current.play();
                  setPlaying(true);
                  return;
                }
                playLocal();
              }}
              onStop={stopPlayback}
              onAudioState={setPlaying}
            />
            {result?.state.script.text ? (
              <p className="mt-3 text-sm text-fg">{result.state.script.text}</p>
            ) : (
              <p className="mt-3 text-sm text-muted">No script yet.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canRepair || busy}
                onClick={() => void submit("rewrite")}
                className="h-11 rounded-lg border border-line px-3 text-sm text-fg disabled:opacity-40"
              >
                Repair once
              </button>
              <button
                type="button"
                disabled={!result}
                onClick={() => downloadJson(result)}
                className="flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-fg disabled:opacity-40"
              >
                <Stamp className="size-4" />
                Provenance
              </button>
              <button
                type="button"
                disabled={!audioUrl}
                onClick={() => audioUrl && downloadUrl(audioUrl, "halyard-take.mp3")}
                className="flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-fg disabled:opacity-40"
              >
                <Download className="size-4" />
                Audio
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-display text-xl">State</h2>
            <pre className="mt-3 max-h-80 overflow-auto text-xs text-muted">{JSON.stringify(result?.state ?? idleState(form), null, 2)}</pre>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <AudioLines className="size-4 text-brass" />
              <h2 className="font-display text-xl">Allowlist</h2>
            </div>
            <p className="mb-3 text-xs text-muted">Writer: grok-4.5. QA: heuristic scorer. Voices are registry presets, not clones.</p>
            <ul className="grid gap-3">
              {(Object.keys(VOICES) as BackendId[]).map((backend) => (
                <li key={backend}>
                  <p className="text-xs tracking-widest text-muted uppercase">{backend.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-fg">{VOICES[backend].map((voice) => voice.id).join(" · ")}</p>
                </li>
              ))}
              <li>
                <p className="text-xs tracking-widest text-muted uppercase">CPU fallback</p>
                <p className="mt-1 text-sm text-fg">This device, only if the voice desk fails</p>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 rounded-lg border px-2 text-sm capitalize ${active ? "border-brass bg-brass text-ink" : "border-line bg-raised text-fg"}`}
    >
      {children}
    </button>
  );
}

function Player({
  audioUrl,
  script,
  speakLocally,
  playing,
  audioRef,
  onPlay,
  onStop,
  onAudioState,
}: {
  audioUrl: string | null;
  script: string;
  speakLocally: boolean;
  playing: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  onPlay: () => void;
  onStop: () => void;
  onAudioState: (playing: boolean) => void;
}) {
  const ready = Boolean(audioUrl || (speakLocally && script));
  return (
    <div className="rounded-lg border border-line bg-raised p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={playing ? onStop : onPlay}
          className="h-11 rounded-lg bg-brass px-4 text-sm font-medium text-ink disabled:opacity-40"
        >
          {playing ? "Stop" : "Play"}
        </button>
        <div className={`flex h-8 flex-1 items-end gap-1 ${playing ? "eq-live" : "opacity-40"}`} aria-hidden="true">
          <span className="block h-3 w-1.5 rounded-sm bg-brass" />
          <span className="block h-6 w-1.5 rounded-sm bg-brass" />
          <span className="block h-4 w-1.5 rounded-sm bg-brass" />
          <span className="block h-7 w-1.5 rounded-sm bg-brass" />
          <span className="block h-3 w-1.5 rounded-sm bg-brass" />
        </div>
      </div>
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          className="mt-3 w-full"
          controls
          onPlay={() => onAudioState(true)}
          onPause={() => onAudioState(false)}
          onEnded={() => onAudioState(false)}
        />
      ) : (
        <p className="mt-2 text-xs text-muted">{speakLocally ? "Local fallback. Not the registry voice." : "Waiting for a take."}</p>
      )}
    </div>
  );
}

function useAudioUrl(base64: string | null, mime: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!base64) {
      setUrl(null);
      return;
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const blob = new Blob([bytes], { type: mime || "audio/mpeg" });
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [base64, mime]);
  return url;
}

function idleState(form: FormState) {
  return {
    task_id: "",
    consent: { status: "pending", evidence: "" },
    requirements: {
      language: form.language,
      style: form.style,
      quality_tier: form.quality,
      max_cost: form.maxCost,
    },
    voice: { backend: "", voice_id: "", reason: "" },
    final: { audio_path: "", provenance: "" },
  };
}

function downloadJson(result: MasterResult | null) {
  if (!result) return;
  const blob = new Blob([JSON.stringify({ state: result.state, turns: result.turns }, null, 2)], {
    type: "application/json",
  });
  downloadUrl(URL.createObjectURL(blob), `${result.state.task_id || "halyard"}-provenance.json`);
}

function downloadUrl(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
}
