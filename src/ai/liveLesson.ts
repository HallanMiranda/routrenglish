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
  /** With a source: the key item the next chunk trains. */
  key_item: string;
}
export interface LiveLessonInput {
  topic: string;
  level: string;
  name: string;
  city: string;
  history: LessonTurn[];
  current: { chunk_pt: string; accepted_en: string[] } | null;
  answer: string | null;
  /** Lesson built from a print. */
  source?: { material_text: string; key_items: string[] } | undefined;
}

const SOURCE_RULES = `Use ONLY the vocabulary, expressions, structures and situations of the SOURCE MATERIAL. Go through its key_items one by one. For each, build a 'Como eu digo…?' chain: start with the smallest useful Portuguese fragment that contains it (e.g. 'descobrir' → 'descobrir o problema' → 'eu preciso descobrir o problema' → '… hoje' → 'ele precisa descobrir o problema' → 'você conseguiu descobrir o problema?' → 'eu não consegui descobrir o problema ontem'). Grow one small piece per step, reusing the previous chunk; then transform it (other person his/her/their and he/she with -s, negative, question, past or future). When a sentence from the material is useful as it is, ask for it in pieces until the learner says the whole sentence. After every 2 key items, ask one quick review chunk mixing both. Do not introduce difficult words that are not in the material.
Also return "key_item": the exact key_items entry the next chunk trains (for a review chunk, the first of the two). Set end_of_chain true on the last chunk of each key item's chain.`;

export async function liveLessonTurn(s: AiSettings, input: LiveLessonInput, signal?: AbortSignal): Promise<LiveLessonReply> {
  const content = await chat(s, [
    { role: "system", content: input.source ? `${systemPrompt}\n\n${SOURCE_RULES}` : systemPrompt },
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
        ...(input.source ? { SOURCE_MATERIAL: { text: input.source.material_text.slice(0, 6000), key_items: input.source.key_items } } : {}),
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
    key_item: str(r.key_item),
  };
}
