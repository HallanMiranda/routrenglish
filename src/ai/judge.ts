// Answer judging: local check first; the AI judge only when the local check says wrong.
import { repo } from "@/data/repo";
import { applyMyName, checkAnswer } from "@/drills/check";
import { aiFor, chat } from "./client";

export type AiErrorType = "attention" | "grammar" | "vocabulary" | "word_order" | "pronunciation_or_transcription" | "meaning";
export interface AiVerdict {
  correct: boolean;
  natural_version: string;
  error_type: AiErrorType;
  wrong_words: string[];
  hint_pt: string;
  is_multa: boolean;
}

const SYSTEM = `You judge a Brazilian learner's spoken English answer. Given the Portuguese prompt (or English question), the accepted answers, the focus and the learner's transcript, return JSON {correct: boolean, natural_version: string, error_type: 'attention'|'grammar'|'vocabulary'|'word_order'|'pronunciation_or_transcription'|'meaning', wrong_words: string[], hint_pt: string (one short sentence in Portuguese, a hint that helps self-correction, never the full answer), is_multa: boolean}. Mark correct when the answer is natural English with the same meaning, even if it differs from the accepted list. Treat likely speech-recognition spelling differences (names, homophones) as correct. is_multa is true only for attention errors: his/her/their, missing or extra third-person -s, is/are/am, or a listed trap.`;

/** Replaces recognizer spellings of the learner's name. */
export async function withMyName(text: string) {
  const n = await repo.getMyName();
  return applyMyName(text, n.name, n.aliases);
}

export interface JudgeInput {
  prompt: string;
  accepted: string[];
  focus: string;
  transcript: string;
  traps?: string[];
}

/** Returns null when AI judging is off, offline, or the call fails (callers keep the local verdict). */
export async function aiJudge(input: JudgeInput, signal?: AbortSignal): Promise<AiVerdict | null> {
  const s = await aiFor("judge");
  if (!s) return null;
  try {
    const content = await chat(s, [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          prompt: input.prompt,
          accepted_answers: input.accepted,
          focus: input.focus,
          traps: input.traps ?? [],
          learner_transcript: input.transcript,
        }),
      },
    ], "judge", signal ? { signal } : {});
    const v = JSON.parse(content) as Partial<AiVerdict>;
    if (typeof v.correct !== "boolean") return null;
    return {
      correct: v.correct,
      natural_version: String(v.natural_version ?? ""),
      error_type: (v.error_type ?? "meaning") as AiErrorType,
      wrong_words: Array.isArray(v.wrong_words) ? v.wrong_words.map(String) : [],
      hint_pt: String(v.hint_pt ?? ""),
      is_multa: v.is_multa === true,
    };
  } catch {
    return null;
  }
}

/** Revisão: judge a spoken card answer (local first, AI only if local says wrong). */
export async function judgeCard(front: string, back: string, transcript: string) {
  const answer = await withMyName(transcript);
  if (checkAnswer(answer, [back]).correct) return { correct: true, verdict: null as AiVerdict | null };
  const verdict = await aiJudge({ prompt: front, accepted: [back], focus: "review", transcript: answer });
  return { correct: verdict?.correct ?? false, verdict };
}
