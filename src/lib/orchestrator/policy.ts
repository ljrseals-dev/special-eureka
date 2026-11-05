export type ConsentKind = "synthetic" | "owned" | "written";
export type QualityTier = "draft" | "standard" | "premium";
export type LatencyMode = "realtime" | "streaming" | "batch";
export type BackendId = "low_latency" | "expressive" | "high_fidelity_clone";

export type Brief = {
  goal: string;
  language: string;
  style: string;
  quality: QualityTier;
  latency: LatencyMode;
  maxCost: number;
  consent: ConsentKind;
  voiceHint: string;
  attested: boolean;
  standIn: boolean;
  mode: "run" | "rewrite";
  pinnedBackend?: string;
  pinnedVoiceId?: string;
  previousScript?: string;
  qaIssues?: string[];
};

export type Gate = {
  status: "approved" | "refused" | "hold";
  evidence: string;
  reasons: string[];
};

export type VoicePlan = {
  backend: BackendId;
  voiceId: string;
  reason: string;
  pinned: boolean;
};

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "pt", label: "Portuguese" },
  { id: "ja", label: "Japanese" },
] as const;

export const VOICES: Record<BackendId, { id: string; note: string }[]> = {
  low_latency: [
    { id: "ara", note: "Warm, short-form" },
    { id: "eve", note: "Upbeat, British" },
    { id: "rex", note: "Clear, direct" },
  ],
  expressive: [
    { id: "ursa", note: "Friendly, warm" },
    { id: "iris", note: "Upbeat" },
    { id: "helix", note: "Bold commentary" },
    { id: "lumen", note: "Warm, articulate" },
    { id: "carina", note: "Soft, soothing" },
  ],
  high_fidelity_clone: [
    { id: "orion", note: "Cinematic narration" },
    { id: "altair", note: "Elegant, refined" },
    { id: "zagan", note: "Dramatic character" },
  ],
};

const ALLOWED = new Set(
  Object.values(VOICES)
    .flat()
    .map((voice) => voice.id),
);

const PUBLIC_FIGURES = [
  "taylor swift",
  "barack obama",
  "donald trump",
  "joe biden",
  "elon musk",
  "kamala harris",
  "morgan freeman",
  "scarlett johansson",
  "emma watson",
  "oprah winfrey",
  "beyonce",
  "beyoncé",
  "tom hanks",
  "keanu reeves",
  "dwayne johnson",
  "mark zuckerberg",
  "sam altman",
  "lebron james",
  "cristiano ronaldo",
  "lionel messi",
  "vladimir putin",
  "volodymyr zelensky",
  "xi jinping",
  "narendra modi",
  "queen elizabeth",
  "king charles",
  "kim kardashian",
  "kendall jenner",
  "ryan reynolds",
  "margot robbie",
  "timothee chalamet",
  "timothée chalamet",
  "pedro pascal",
  "morgan wallen",
  "ariana grande",
  "selena gomez",
  "billie eilish",
  "adele",
];

const SHORT_NAMES = ["drake", "zendaya", "oprah", "mrbeast", "putin", "beyonce"];

const STYLE_PICKS: { test: RegExp; voiceId: string; backend: BackendId; note: string }[] = [
  { test: /calm|sooth|wellness|soft|quiet|unhurried|gentle/, voiceId: "carina", backend: "expressive", note: "soft register" },
  { test: /dramatic|character|villain|epic/, voiceId: "zagan", backend: "high_fidelity_clone", note: "dramatic register" },
  { test: /cinematic|audiobook|narrat|story|forecast/, voiceId: "orion", backend: "high_fidelity_clone", note: "narration register" },
  { test: /podcast|commentary|bold/, voiceId: "helix", backend: "expressive", note: "commentary register" },
  { test: /elegant|advert|luxury|refined/, voiceId: "altair", backend: "high_fidelity_clone", note: "refined register" },
  { test: /warm|friendly|conversational|host|kitchen/, voiceId: "ursa", backend: "expressive", note: "warm host" },
];

export function latencyTargetMs(mode: LatencyMode): number {
  if (mode === "realtime") return 800;
  if (mode === "streaming") return 2000;
  return 15000;
}

export function wordCap(brief: Pick<Brief, "quality" | "maxCost" | "latency">): number {
  if (brief.quality === "draft" || brief.maxCost < 1 || brief.latency === "realtime") return 45;
  if (brief.quality === "premium") return 100;
  return 75;
}

export function screenText(text: string): string | null {
  const hay = text.toLowerCase();

  const minorNear =
    /\b(child|children|kid|kids|minor|minors|toddler|infant|baby|underage|teenager|schoolgirl|schoolboy)\b.{0,48}\b(voice|clone|cloning|impersonat|sound like|deepfake)\b/i.test(
      text,
    ) ||
    /\b(voice|clone|cloning|impersonat|sound like|deepfake)\b.{0,48}\b(child|children|kid|kids|minor|toddler|infant|baby|underage|teen)\b/i.test(
      text,
    ) ||
    /\b(my |a )?(young |little )?(son|daughter|niece|nephew)['’]?s voice\b/i.test(text);

  if (minorNear) return "Request targets a minor's voice.";

  for (const phrase of PUBLIC_FIGURES) {
    if (hay.includes(phrase)) return `Request names a public figure (${phrase}).`;
  }
  for (const name of SHORT_NAMES) {
    const re = new RegExp(`\\b${name}\\b`, "i");
    if (re.test(text)) return `Request names a public figure (${name}).`;
  }
  if (/\bfamous (actor|actress|singer|rapper|politician|celebrity|youtuber)\b/i.test(text)) {
    return "Request asks for a famous person's voice.";
  }
  if (/\b(prank|deepfake|without (their|his|her) consent|they (don['’]?t|do not) know|revenge)\b/i.test(text)) {
    return "Request looks like impersonation without consent.";
  }
  if (
    /\b(clone|cloning|impersonat|mimic|sound exactly like|copy (his|her|their) voice)\b/i.test(text) &&
    /\b(my ex|my boss|coworker|co-worker|colleague|neighbor|neighbour|teacher)\b/i.test(text)
  ) {
    return "Request targets a private person who has not consented here.";
  }
  return null;
}

export function screenConsent(brief: Pick<Brief, "goal" | "style" | "voiceHint" | "consent" | "attested" | "standIn" | "previousScript">): Gate {
  const blob = [brief.goal, brief.style, brief.voiceHint, brief.previousScript ?? ""].join("\n");
  const blocked = screenText(blob);
  if (blocked) {
    return {
      status: "refused",
      evidence: blocked,
      reasons: [
        blocked,
        "No model was called.",
        "Halyard does not clone minors, public figures, or anyone who has not consented.",
      ],
    };
  }
  if (!brief.attested) {
    return {
      status: "hold",
      evidence: "Attestation missing.",
      reasons: ["Check the attestation before any voice work runs.", "The desk is paused, not refused."],
    };
  }
  if (brief.consent !== "synthetic" && !brief.standIn) {
    return {
      status: "hold",
      evidence: "Owned-voice claim without a vault.",
      reasons: [
        "This desk has no consented-voice vault and will not mint a custom clone from a clip.",
        "Confirm a synthetic stand-in, or keep the job paused.",
      ],
    };
  }
  if (brief.consent === "synthetic") {
    return {
      status: "approved",
      evidence: "Synthetic registry voice. Attestation on file for this job.",
      reasons: [],
    };
  }
  return {
    status: "approved",
    evidence: "Rights claimed, but no vault is connected. Synthetic stand-in confirmed. Not a biometric clone.",
    reasons: ["Provenance will mark this as a stand-in, not the claimed voice."],
  };
}

function hashIndex(seed: string, size: number): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return size === 0 ? 0 : hash % size;
}

export function isAllowedVoice(id: string): boolean {
  return ALLOWED.has(id);
}

export function planRoute(brief: Pick<Brief, "goal" | "style" | "voiceHint" | "quality" | "latency" | "maxCost" | "pinnedBackend" | "pinnedVoiceId">): VoicePlan {
  if (
    brief.pinnedVoiceId &&
    brief.pinnedBackend &&
    isAllowedVoice(brief.pinnedVoiceId) &&
    brief.pinnedBackend in VOICES
  ) {
    return {
      backend: brief.pinnedBackend as BackendId,
      voiceId: brief.pinnedVoiceId,
      reason: "Pinned from the open job. Same voice unless you start a new brief.",
      pinned: true,
    };
  }

  const tight = brief.quality === "draft" || brief.maxCost < 1 || brief.latency === "realtime";
  const styleText = `${brief.style} ${brief.voiceHint} ${brief.goal}`;
  const styleHit = STYLE_PICKS.find((pick) => pick.test.test(styleText));

  if (tight) {
    const bucket = VOICES.low_latency;
    const voice = bucket[hashIndex(styleText, bucket.length)] ?? bucket[0];
    const deferred = styleHit ? ` Style wanted ${styleHit.voiceId}; cheap-first and the latency cap keep the light desk.` : "";
    return {
      backend: "low_latency",
      voiceId: voice.id,
      reason: `Low-latency allowlisted voice ${voice.id} (${voice.note}).${deferred}`,
      pinned: false,
    };
  }

  const premium = brief.quality === "premium" && brief.latency === "batch";
  if (styleHit && (styleHit.backend !== "high_fidelity_clone" || premium || brief.latency === "batch")) {
    if (styleHit.backend === "high_fidelity_clone" && !premium && brief.quality !== "premium") {
      const bucket = VOICES.expressive;
      const voice = bucket[hashIndex(styleText, bucket.length)] ?? bucket[0];
      return {
        backend: "expressive",
        voiceId: voice.id,
        reason: `Standard tier stays on the expressive desk (${voice.id}, ${voice.note}) instead of the heavier narration voice.`,
        pinned: false,
      };
    }
    return {
      backend: styleHit.backend,
      voiceId: styleHit.voiceId,
      reason: `Rule match: ${styleHit.note}. Voice ${styleHit.voiceId} is on the allowlist. Not a biometric clone.`,
      pinned: false,
    };
  }

  const backend: BackendId = premium ? "high_fidelity_clone" : "expressive";
  const bucket = VOICES[backend];
  const voice = bucket[hashIndex(styleText, bucket.length)] ?? bucket[0];
  return {
    backend,
    voiceId: voice.id,
    reason: `${premium ? "Premium batch" : "Standard"} tier → ${backend.replaceAll("_", " ")} / ${voice.id} (${voice.note}).`,
    pinned: false,
  };
}

export function scoreScript(script: string, goal: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  const words = script.trim().split(/\s+/).filter(Boolean);
  let score = 86;
  if (words.length < 18) {
    score -= 28;
    issues.push("Script is too short to carry the brief.");
  }
  if (words.length > 120) {
    score -= 12;
    issues.push("Script runs long for a single take.");
  }
  const goalWords = new Set(
    goal
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((word) => word.length > 4),
  );
  const scriptWords = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9']/g, "")));
  let overlap = 0;
  for (const word of goalWords) if (scriptWords.has(word)) overlap += 1;
  if (goalWords.size > 2 && overlap === 0) {
    score -= 18;
    issues.push("Script may have drifted off the goal.");
  }
  if (!/[.!?]$/.test(script.trim())) {
    score -= 4;
    issues.push("Script does not land on a full stop.");
  }
  return { score: Math.max(0, Math.min(100, score)), issues };
}

export function limitWords(text: string, max: number): { text: string; trimmed: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length <= max) return { text: clean, trimmed: false };
  let cut = parts.slice(0, max).join(" ");
  cut = cut.replace(/[,:;]+$/g, "");
  if (!/[.!?]$/.test(cut)) cut = `${cut}.`;
  return { text: cut, trimmed: true };
}

export function deskDraft(goal: string, max: number): string {
  const spoken = goal
    .replace(/^\[|\]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return limitWords(spoken, max).text;
}
