// Coach voice: OpenAI text-to-speech with an IndexedDB cache; falls back to the browser voice.
import { repo } from "@/data/repo";
import type { AiSettings } from "@/data/types";
import { speechAudio } from "./openai";
import { aiOnline } from "./client";
import { speak, stopSpeaking } from "@/speech/speak";

export type VoiceStyle = "pt" | "en" | "repeat";
export type VoiceSpeed = "normal" | "slow";
export const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"] as const;

const INSTRUCTIONS: Record<VoiceStyle, string> = {
  pt: "Fale em português do Brasil, como um professor animado e simpático numa chamada de vídeo. Ritmo natural, frases curtas.",
  en: "Speak natural American English with clear, natural intonation and sentence stress, at a slightly slow learner-friendly pace. Do not over-articulate.",
  repeat: "Speak natural American English with clear, natural intonation and sentence stress, at a slow learner-friendly pace, a bit slower than usual, stressing the key words. Do not over-articulate.",
};
// Approximate USD per character (≈ $0.015/min, ~15 chars/s), only for the spending estimate.
const PER_CHAR = 0.015 / 900;

// ---- IndexedDB cache ----
const DB = "speak-lab-tts";
let dbP: Promise<IDBDatabase | null> | null = null;
function db() {
  if (!dbP)
    dbP = new Promise((res) => {
      if (typeof indexedDB === "undefined") return res(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("audio");
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
  return dbP;
}
async function getCached(key: string): Promise<Blob | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((res) => {
    const r = d.transaction("audio").objectStore("audio").get(key);
    r.onsuccess = () => res((r.result as Blob | undefined) ?? null);
    r.onerror = () => res(null);
  });
}
async function putCached(key: string, b: Blob) {
  const d = await db();
  if (!d) return;
  d.transaction("audio", "readwrite").objectStore("audio").put(b, key);
}

const inflight = new Map<string, Promise<Blob>>();
const keyOf = (s: AiSettings, text: string, style: VoiceStyle, speed: VoiceSpeed) => `${s.tts_model}|${s.tts_voice}|${speed}|${style}|${text}`;

async function audioFor(s: AiSettings, text: string, style: VoiceStyle, speed: VoiceSpeed, voice = s.tts_voice): Promise<Blob> {
  const st = { ...s, tts_voice: voice };
  const key = keyOf(st, text, style, speed);
  const cached = await getCached(key);
  if (cached) return cached;
  let p = inflight.get(key);
  if (!p) {
    const instr = INSTRUCTIONS[style] + (speed === "slow" ? " Speak more slowly than usual." : "");
    p = speechAudio(s.api_key!, s.tts_model, voice, text, instr, speed === "slow" ? 0.8 : 1).then((b) => {
      void putCached(key, b);
      void repo.logAiUsage({ kind: "voice", cost_usd: text.length * PER_CHAR });
      return b;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

// One reusable element, unlocked on the first tap (iPhone blocks autoplay otherwise).
let el: HTMLAudioElement | null = null;
const player = () => (el ??= new Audio());
export function unlockAudio() {
  const a = player();
  a.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA";
  void a.play().catch(() => {});
}

/** Plays a blob and resolves when it ends (or is stopped). */
export function playBlob(b: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const a = player();
    a.pause();
    const url = URL.createObjectURL(b);
    const done = () => { URL.revokeObjectURL(url); a.onended = a.onpause = a.onerror = null; resolve(); };
    a.onended = done;
    a.onpause = done;
    a.onerror = () => { URL.revokeObjectURL(url); a.onended = a.onpause = a.onerror = null; reject(new Error("play")); };
    a.src = url;
    a.play().catch(reject);
  });
}

/** Coach says a line: natural AI voice when possible, otherwise the browser voice. Never throws. */
export async function coachSay(text: string, style: VoiceStyle, speed: VoiceSpeed = "normal") {
  if (!text.trim()) return;
  const s = await aiOnline();
  if (s) {
    try {
      return await playBlob(await audioFor(s, text, style, speed));
    } catch {
      /* fall back */
    }
  }
  await speak(text, { lang: style === "pt" ? "pt-BR" : "en-US", rate: style === "pt" ? 1 : speed === "slow" || style === "repeat" ? 0.7 : 0.9 }).catch(() => {});
}

/** Fetches a line into the cache in the background. */
export function preload(text: string, style: VoiceStyle, speed: VoiceSpeed = "normal") {
  if (!text.trim()) return;
  void aiOnline().then((s) => (s ? audioFor(s, text, style, speed).catch(() => {}) : undefined));
}

export async function previewVoice(s: AiSettings, voice: string) {
  await playBlob(await audioFor(s, "Oi! Eu sou o seu Coach. Hi, I'm your coach. Let's practice!", "pt", "normal", voice));
}

export function stopCoach() {
  el?.pause();
  stopSpeaking();
}
