// Shared AI layer: the user's own OpenAI key from this device, called straight from the browser.
// Every caller falls back to the local version when this returns null or throws.
import { repo } from "@/data/repo";
import type { AiSettings, AiUsage } from "@/data/types";
import { chatJson, testKey, transcribeAudio, type ChatMessage } from "./openai";
import { estimateCost } from "./generatePack";

export { AiError } from "./openai";
export type AiFeature = "listen" | "judge" | "converse";

/** Settings when the feature is usable now (key saved, switch on, online); otherwise null. */
export async function aiFor(feature: AiFeature): Promise<AiSettings | null> {
  const s = await repo.getAiSettings();
  if (!s.api_key) return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const on = feature === "listen" ? s.listen_ai : feature === "judge" ? s.judge_ai : s.converse_ai;
  return on ? s : null;
}

/** Settings when the key is saved and the device is online (voice and pronunciation have no switch). */
export async function aiOnline(): Promise<AiSettings | null> {
  const s = await repo.getAiSettings();
  if (!s.api_key) return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  return s;
}

export async function chat(
  s: AiSettings,
  messages: ChatMessage[],
  kind: AiUsage["kind"],
  opts: { json?: boolean; signal?: AbortSignal; model?: string; cost?: (tin: number, tout: number) => number } = {},
) {
  const r = await chatJson(s.api_key!, opts.model ?? s.model, messages, opts.signal, opts.json ?? true);
  void repo.logAiUsage({ kind, cost_usd: (opts.cost ?? estimateCost)(r.tokensIn, r.tokensOut) });
  return r.content;
}

// Approximate USD per audio minute, only for the spending estimate.
const TRANSCRIBE_PER_MIN = 0.003;
export async function transcribe(s: AiSettings, audio: Blob, seconds: number, prompt: string, signal?: AbortSignal) {
  const text = await transcribeAudio(s.api_key!, s.transcribe_model, audio, prompt, signal);
  void repo.logAiUsage({ kind: "listen", cost_usd: (Math.max(seconds, 1) / 60) * TRANSCRIBE_PER_MIN });
  return text;
}

/** Checks that the key works with every model in Ajustes. */
export async function testModels(s: AiSettings) {
  for (const m of [s.model, s.transcribe_model, s.tts_model, s.audio_model]) await testKey(s.api_key!, m);
}
