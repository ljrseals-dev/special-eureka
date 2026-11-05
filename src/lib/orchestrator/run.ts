import { createServerFn } from "@tanstack/react-start";
import {
  deskDraft,
  isAllowedVoice,
  latencyTargetMs,
  limitWords,
  planRoute,
  scoreScript,
  screenConsent,
  screenText,
  wordCap,
  type Brief,
  type ConsentKind,
  type LatencyMode,
  type QualityTier,
} from "./policy";

export type TurnPatch =
  | { consent: { status: string; evidence: string } }
  | { requirements: TaskState["requirements"] }
  | { script: { text: string; model: string; confidence: number } }
  | { voice: TaskState["voice"] }
  | { synthesis: TaskState["synthesis"] }
  | { qa: TaskState["qa"] }
  | { final: TaskState["final"] };

export type Turn = {
  step: string;
  title: string;
  decision: string;
  model: string;
  why: string;
  patch: TurnPatch;
  next: string;
  risks: string[];
  status: "ok" | "hold" | "refuse" | "warn";
};

export type TaskState = {
  task_id: string;
  consent: { status: string; evidence: string };
  requirements: {
    language: string;
    style: string;
    latency_target_ms: number;
    quality_tier: QualityTier;
    max_cost: number;
  };
  script: { text: string; model: string; confidence: number };
  voice: { backend: string; voice_id: string; reason: string };
  synthesis: { backend: string; audio_path: string; latency_ms: number; cost: number };
  qa: { score: number; issues: string[]; model: string };
  attempts: { backend: string; voice_id: string; score: number }[];
  final: { audio_path: string; provenance: string };
};

export type MasterResult = {
  ok: boolean;
  message?: string;
  turns: Turn[];
  state: TaskState;
  audioBase64: string | null;
  mime: string | null;
  speakLocally: boolean;
};

const LANGS = new Set(["en", "es", "fr", "de", "pt", "ja"]);
const QUALITY = new Set<QualityTier>(["draft", "standard", "premium"]);
const LATENCY = new Set<LatencyMode>(["realtime", "streaming", "batch"]);
const CONSENT = new Set<ConsentKind>(["synthetic", "owned", "written"]);

const hits: number[] = [];

function allowCall(): boolean {
  const now = Date.now();
  while (hits.length > 0 && now - hits[0]! > 60_000) hits.shift();
  if (hits.length >= 8) return false;
  hits.push(now);
  return true;
}

function asString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseBrief(input: unknown): Brief {
  if (!input || typeof input !== "object") throw new Error("Missing brief.");
  const raw = input as Record<string, unknown>;
  const quality = raw.quality;
  const latency = raw.latency;
  const consent = raw.consent;
  const mode = raw.mode === "rewrite" ? "rewrite" : "run";
  const maxCost = typeof raw.maxCost === "number" && Number.isFinite(raw.maxCost) ? Math.min(5, Math.max(0, raw.maxCost)) : 1;
  const brief: Brief = {
    goal: asString(raw.goal, 500),
    language: asString(raw.language, 8) || "en",
    style: asString(raw.style, 80) || "conversational",
    quality: QUALITY.has(quality as QualityTier) ? (quality as QualityTier) : "standard",
    latency: LATENCY.has(latency as LatencyMode) ? (latency as LatencyMode) : "batch",
    maxCost,
    consent: CONSENT.has(consent as ConsentKind) ? (consent as ConsentKind) : "synthetic",
    voiceHint: asString(raw.voiceHint, 60),
    attested: raw.attested === true,
    standIn: raw.standIn === true,
    mode,
    pinnedBackend: asString(raw.pinnedBackend, 40) || undefined,
    pinnedVoiceId: asString(raw.pinnedVoiceId, 40) || undefined,
    previousScript: asString(raw.previousScript, 1200) || undefined,
    qaIssues: Array.isArray(raw.qaIssues) ? raw.qaIssues.filter((item) => typeof item === "string").slice(0, 6) : undefined,
  };
  if (!LANGS.has(brief.language)) brief.language = "en";
  if (brief.goal.length < 8) throw new Error("Give the desk a goal of at least a sentence.");
  return brief;
}

function emptyState(brief: Brief, taskId: string): TaskState {
  return {
    task_id: taskId,
    consent: { status: "pending", evidence: "" },
    requirements: {
      language: brief.language,
      style: brief.style,
      latency_target_ms: latencyTargetMs(brief.latency),
      quality_tier: brief.quality,
      max_cost: brief.maxCost,
    },
    script: { text: "", model: "", confidence: 0 },
    voice: { backend: "", voice_id: "", reason: "" },
    synthesis: { backend: "", audio_path: "", latency_ms: 0, cost: 0 },
    qa: { score: 0, issues: [], model: "" },
    attempts: [],
    final: { audio_path: "", provenance: "" },
  };
}

function taskId(): string {
  return `hly_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function provenance(state: TaskState, brief: Brief): string {
  return JSON.stringify({
    generator: "halyard-master-chat",
    task_id: state.task_id,
    biometric_clone: false,
    watermark: "synthetic-registry-voice",
    consent: brief.consent,
    stand_in: brief.consent !== "synthetic",
    script_model: state.script.model,
    tts: state.synthesis.backend || "none",
    voice_id: state.voice.voice_id,
    qa_score: state.qa.score,
  });
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof json.error === "string") return json.error;
    if (json.error && typeof json.error === "object" && json.error.message) return json.error.message;
  } catch {
    /* body was not JSON */
  }
  return text.slice(0, 220) || `Request failed (${res.status})`;
}

function extractJson(raw: string): { script?: string; persona?: string; confidence?: number } | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as { script?: string; persona?: string; confidence?: number };
  } catch {
    return null;
  }
}

async function writeScript(brief: Brief, apiKey: string, cap: number): Promise<{ text: string; confidence: number; persona: string }> {
  const repair =
    brief.mode === "rewrite" && brief.previousScript
      ? `The previous take failed QA: ${(brief.qaIssues ?? []).join("; ") || "weak take"}.
Previous script:
${brief.previousScript}
Write a better take. Do not impersonate a real person.`
      : "";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.6,
      max_tokens: 380,
      messages: [
        {
          role: "system",
          content:
            "You write short spoken scripts for a consented synthetic text-to-speech voice. Return only JSON: {\"script\":\"...\",\"persona\":\"one line\",\"confidence\":0.0}. No markdown. Do not impersonate a real person, celebrity, or private individual. No stage directions, no labels, no quotes around the whole script. Write something that can be read aloud in one breath-group sequence.",
        },
        {
          role: "user",
          content: `Language: ${brief.language}
Style: ${brief.style}
Voice hint (style only, not a person): ${brief.voiceHint || "neutral host"}
Max words: ${cap}
Goal: ${brief.goal}
${repair}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  const script = (parsed?.script ?? content).replace(/^["“]|["”]$/g, "").trim();
  if (!script) throw new Error("The writer returned an empty script.");
  const confidence =
    typeof parsed?.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : parsed ? 0.72 : 0.45;
  return { text: script, confidence, persona: parsed?.persona?.slice(0, 140) ?? "" };
}

async function synthesize(text: string, voiceId: string, language: string, apiKey: string): Promise<{ base64: string; mime: string }> {
  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ text, voice_id: voiceId, language }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const mime = res.headers.get("content-type") || "audio/mpeg";
  if (mime.includes("json") || mime.includes("text")) {
    throw new Error(await readError(res));
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 64) throw new Error("The voice desk returned an empty clip.");
  return { base64: Buffer.from(bytes).toString("base64"), mime };
}

export const runMasterChat = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseBrief(input))
  .handler(async ({ data }): Promise<MasterResult> => {
    const brief = data;
    const id = taskId();
    const state = emptyState(brief, id);
    const turns: Turn[] = [];
    const gate = screenConsent(brief);
    state.consent = { status: gate.status === "approved" ? "approved" : gate.status === "refused" ? "refused" : "pending", evidence: gate.evidence };

    turns.push({
      step: "0",
      title: "Intake",
      decision:
        gate.status === "approved"
          ? "Consent accepted for a synthetic registry voice. Biometric cloning stays off."
          : gate.status === "refused"
            ? "Stopped. This request does not clear the consent gate."
            : "Paused. The desk will not call a model until the hold clears.",
      model: "rule-gate · no model",
      why: gate.evidence,
      patch: { consent: state.consent },
      next: gate.status === "approved" ? "script_generator" : "ask the operator",
      risks: gate.reasons.length ? gate.reasons : ["Provenance will say this is not a biometric clone."],
      status: gate.status === "approved" ? "ok" : gate.status === "refused" ? "refuse" : "hold",
    });

    if (gate.status !== "approved") {
      state.final.provenance = provenance(state, brief);
      return { ok: true, turns, state, audioBase64: null, mime: null, speakLocally: false };
    }

    const plan = planRoute(brief);
    state.voice = { backend: plan.backend, voice_id: plan.voiceId, reason: plan.reason };
    if (!isAllowedVoice(plan.voiceId)) {
      turns.push({
        step: "2",
        title: "Voice",
        decision: "Refused an off-list voice.",
        model: "allowlist",
        why: "Only registry voices can be pinned.",
        patch: { voice: state.voice },
        next: "stop",
        risks: ["Allowlist enforced in code."],
        status: "refuse",
      });
      state.final.provenance = provenance(state, brief);
      return { ok: true, turns, state, audioBase64: null, mime: null, speakLocally: false };
    }

    const apiKey = process.env.XAI_API_KEY;
    const cap = wordCap(brief);

    if (brief.maxCost <= 0) {
      turns.push({
        step: "1",
        title: "Script",
        decision: "Cost cap is zero. Live writer and voice desk stay dark.",
        model: "none",
        why: "Cheap-first still refuses a paid call when the cap is zero.",
        patch: { requirements: state.requirements },
        next: "raise the cap or keep the job as a plan",
        risks: ["No audio."],
        status: "hold",
      });
      state.final.provenance = provenance(state, brief);
      return { ok: true, turns, state, audioBase64: null, mime: null, speakLocally: false };
    }

    if (!allowCall()) {
      return {
        ok: false,
        message: "The desk is capped at 8 live runs a minute so it doesn't burn the voice budget. Wait and try again.",
        turns,
        state,
        audioBase64: null,
        mime: null,
        speakLocally: false,
      };
    }

    let speakLocally = false;
    const started = Date.now();

    if (!apiKey) {
      const draft = deskDraft(brief.goal, cap);
      state.script = { text: draft, model: "desk-draft", confidence: 0.5 };
      speakLocally = true;
      turns.push({
        step: "1",
        title: "Script",
        decision: "Live writer is unavailable. Using a desk draft of your goal, labeled as such.",
        model: "desk-draft",
        why: "No live model in this environment. The words are yours, trimmed to the tier cap.",
        patch: { script: state.script },
        next: "local playback",
        risks: ["Not a model-written script."],
        status: "warn",
      });
    } else {
      try {
        const written = await writeScript(brief, apiKey, cap);
        const limited = limitWords(written.text, cap);
        const blocked = screenText(limited.text);
        if (blocked) {
          state.script = { text: "", model: "grok-4.5", confidence: 0 };
          turns.push({
            step: "1",
            title: "Script",
            decision: "Writer output failed the consent screen. Synthesis cancelled.",
            model: "grok-4.5",
            why: blocked,
            patch: { script: state.script },
            next: "stop",
            risks: ["No audio was made."],
            status: "refuse",
          });
          state.consent = { status: "refused", evidence: blocked };
          state.final.provenance = provenance(state, brief);
          return { ok: true, turns, state, audioBase64: null, mime: null, speakLocally: false };
        }
        state.script = {
          text: limited.text,
          model: "grok-4.5",
          confidence: limited.trimmed ? Math.min(written.confidence, 0.6) : written.confidence,
        };
        turns.push({
          step: brief.mode === "rewrite" ? "5" : "1",
          title: brief.mode === "rewrite" ? "Repair" : "Script",
          decision:
            brief.mode === "rewrite"
              ? "Repair pass wrote a new script. Voice pin held."
              : "Script written on the creative model. Voice choice stayed rule-based.",
          model: "grok-4.5",
          why: written.persona || "Structured script returned inside the word cap.",
          patch: { script: { text: state.script.text, model: state.script.model, confidence: state.script.confidence } },
          next: "voice pin, then synthesis",
          risks: limited.trimmed ? ["Script was trimmed to the tier word cap."] : ["One writer call. No automatic rewrite."],
          status: "ok",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Writer failed.";
        turns.push({
          step: "1",
          title: "Script",
          decision: "Writer failed. No stand-in script was invented.",
          model: "grok-4.5",
          why: message,
          patch: { script: state.script },
          next: "retry the job",
          risks: ["Spend may have occurred before the failure."],
          status: "warn",
        });
        state.final.provenance = provenance(state, brief);
        return { ok: true, turns, state, audioBase64: null, mime: null, speakLocally: false, message };
      }
    }

    turns.push({
      step: "2",
      title: "Voice",
      decision: plan.pinned ? `Pinned ${plan.voiceId}.` : `Selected ${plan.voiceId} from the allowlist.`,
      model: `${plan.backend} · ${plan.voiceId}`,
      why: plan.reason,
      patch: { voice: state.voice },
      next: apiKey ? "tts_synthesize" : "local fallback voice",
      risks: [
        plan.backend === "high_fidelity_clone"
          ? "High-fidelity here means a richer registry voice, not a clone of a person."
          : "Registry voice. Watermarked as synthetic in provenance.",
      ],
      status: "ok",
    });

    let audioBase64: string | null = null;
    let mime: string | null = null;

    if (apiKey && state.script.text) {
      try {
        const clip = await synthesize(state.script.text, plan.voiceId, brief.language, apiKey);
        audioBase64 = clip.base64;
        mime = clip.mime;
        const latency = Date.now() - started;
        state.synthesis = {
          backend: "xai-tts",
          audio_path: "memory://delivery.mp3",
          latency_ms: latency,
          cost: 3,
        };
        turns.push({
          step: "3",
          title: "Synthesis",
          decision: `Spoke with ${plan.voiceId}.`,
          model: "xai-tts",
          why: `Allowlisted voice. Language ${brief.language}. Round trip ${latency} ms.`,
          patch: { synthesis: state.synthesis },
          next: "heuristic QA",
          risks: latency > latencyTargetMs(brief.latency) ? ["Slower than the latency target. Pinned voice was not swapped."] : ["Single take. Repair is a separate click."],
          status: latency > latencyTargetMs(brief.latency) ? "warn" : "ok",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Synthesis failed.";
        speakLocally = true;
        state.synthesis = { backend: "cpu_fallback", audio_path: "", latency_ms: Date.now() - started, cost: 1 };
        turns.push({
          step: "3",
          title: "Synthesis",
          decision: "Voice desk failed. Falling back to local playback of the same script.",
          model: "cpu_fallback",
          why: message,
          patch: { synthesis: state.synthesis },
          next: "local playback",
          risks: ["Local voice is not the pinned registry voice."],
          status: "warn",
        });
      }
    } else if (state.script.text) {
      state.synthesis = { backend: "cpu_fallback", audio_path: "", latency_ms: 0, cost: 0 };
      turns.push({
        step: "3",
        title: "Synthesis",
        decision: "Local playback only.",
        model: "cpu_fallback",
        why: "Live voice desk is not available here.",
        patch: { synthesis: state.synthesis },
        next: "play on this device",
        risks: ["Browser voice, not the registry voice."],
        status: "warn",
      });
    }

    const qa = scoreScript(state.script.text, brief.goal);
    state.qa = { score: qa.score, issues: qa.issues, model: "heuristic-scorer" };
    state.attempts.push({ backend: state.synthesis.backend || plan.backend, voice_id: plan.voiceId, score: qa.score });
    turns.push({
      step: "4",
      title: "QA",
      decision: qa.issues.length ? `Score ${qa.score}. Issues logged. Voice stays pinned.` : `Score ${qa.score}. Take accepted.`,
      model: "heuristic-scorer",
      why: "No listening model on this desk. Score is length, ending, and overlap with the goal.",
      patch: { qa: state.qa },
      next: qa.score < 70 ? "optional repair" : "delivery",
      risks: qa.issues.length ? qa.issues : ["Heuristic only. Listen before you ship it."],
      status: qa.score < 70 ? "warn" : "ok",
    });

    state.final = {
      audio_path: audioBase64 ? "memory://delivery.mp3" : "",
      provenance: provenance(state, brief),
    };
    turns.push({
      step: "6",
      title: "Delivery",
      decision: audioBase64 || speakLocally ? "Clip ready, with provenance." : "Nothing to deliver.",
      model: state.synthesis.backend || "none",
      why: "Watermark: synthetic registry voice. biometric_clone false.",
      patch: { final: state.final },
      next: "operator listens",
      risks: ["Do not present this clip as a real person's voice."],
      status: "ok",
    });

    return { ok: true, turns, state, audioBase64, mime, speakLocally };
  });
