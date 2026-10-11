// "Aula livre com IA": one text-model call per turn; it judges the last answer and builds the next chunk.
import systemPrompt from "./prompts/liveLesson.md?raw";
import type { AiSettings } from "@/data/types";
import { chat } from "./client";

export interface LessonTurn {
  chunk_pt: string;
  answer: string;
  correct: boolean;
}
export interface LiveLessonReply {
  correct: boolean;
  feedback_pt: string;
  model_en: string;
  is_multa: boolean;
  hint_pt: string;
  next_chunk_pt: string;
  next_accepted_en: string[];
  change_pt: string;
  focus: string;
  pulo_do_gato: string;
  end_of_chain: boolean;
}
export interface LiveLessonInput {
  topic: string;
  level: string;
  name: string;
  city: string;
  history: LessonTurn[];
  current: { chunk_pt: string; accepted_en: string[] } | null;
  answer: string | null;
}

export async function liveLessonTurn(s: AiSettings, input: LiveLessonInput, signal?: AbortSignal): Promise<LiveLessonReply> {
  const content = await chat(s, [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        topic: input.topic,
        level: input.level,
        learner_name: input.name,
        learner_city: input.city,
        last_turns: input.history.slice(-12),
        current_chunk: input.current,
        learner_answer: input.answer,
      }),
    },
  ], "converse", signal ? { signal } : {});
  const r = JSON.parse(content) as Partial<LiveLessonReply>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    correct: r.correct === true,
    feedback_pt: str(r.feedback_pt),
    model_en: str(r.model_en),
    is_multa: r.is_multa === true,
    hint_pt: str(r.hint_pt),
    next_chunk_pt: str(r.next_chunk_pt),
    next_accepted_en: Array.isArray(r.next_accepted_en) ? r.next_accepted_en.map(String).filter(Boolean) : [],
    change_pt: str(r.change_pt),
    focus: str(r.focus) || "chunks",
    pulo_do_gato: str(r.pulo_do_gato),
    end_of_chain: r.end_of_chain === true,
  };
}
