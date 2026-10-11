// Pronunciation and intonation feedback from the learner's recorded audio (audio chat model).
import type { AiSettings } from "@/data/types";
import { chat } from "./client";
import { blobToBase64 } from "@/speech/wav";

export interface PronIssue {
  word: string;
  problem_pt: string;
  /** Short category, e.g. "vogal extra no fim das palavras". */
  kind_pt: string;
}
export interface PronResult {
  pronunciation_score: number;
  intonation_score: number;
  verdict_pt: string;
  issues: PronIssue[];
  stress_words: string[];
  intonation: "rising" | "falling";
  intonation_tip_pt: string;
}

const SYSTEM = `You are a pronunciation coach for a Brazilian Portuguese speaker. Compare the learner's audio with the target sentence. The goal is to be easily understood, not to sound native: ignore accent features that don't hurt understanding. Focus on what Brazilians usually get wrong: extra vowel at the end or start of words (bigi, eschool), -ed endings (worked = /t/), th sounds, initial h said like Portuguese r, short vs long vowels (live/leave, ship/sheep), final -s, word stress and sentence stress, and question intonation (rising for yes/no questions, falling for wh- questions and statements). Return JSON: {pronunciation_score: 0-100, intonation_score: 0-100, verdict_pt: one short spoken sentence in Portuguese, issues: [{word, problem_pt (short, practical: what to do with the mouth or the rhythm), kind_pt (a 2-6 word Portuguese category, e.g. "vogal extra no fim das palavras", "som do th", "final -ed")}] (max 2, most important first, empty if none), stress_words: [words that should be stressed in the target], intonation: 'rising'|'falling', intonation_tip_pt: short tip or empty}.`;

// Approximate USD per 1M tokens (audio input is the expensive part), only for the estimate.
const cost = (tin: number, tout: number) => (tin * 10 + tout * 2.4) / 1_000_000;

export async function assessPronunciation(s: AiSettings, wav: Blob, target: string, signal?: AbortSignal): Promise<PronResult> {
  const content = await chat(s, [
    { role: "system", content: SYSTEM },
    { role: "user", content: [
      { type: "text", text: `Target sentence: "${target}". Return the JSON object.` },
      { type: "input_audio", input_audio: { data: await blobToBase64(wav), format: "wav" } },
    ] },
  ], "pronunciation", { model: s.audio_model, cost, ...(signal ? { signal } : {}) });
  const r = JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim()) as Partial<PronResult>;
  const n = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    pronunciation_score: n(r.pronunciation_score),
    intonation_score: n(r.intonation_score),
    verdict_pt: str(r.verdict_pt),
    issues: (Array.isArray(r.issues) ? r.issues : []).slice(0, 2).map((i) => ({ word: str(i?.word), problem_pt: str(i?.problem_pt), kind_pt: str(i?.kind_pt) || str(i?.problem_pt) })).filter((i) => i.problem_pt),
    stress_words: Array.isArray(r.stress_words) ? r.stress_words.map(String) : [],
    intonation: r.intonation === "rising" ? "rising" : "falling",
    intonation_tip_pt: str(r.intonation_tip_pt),
  };
}
