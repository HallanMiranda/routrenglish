// Types mirroring the future database tables. Study content stays in English.

export type ISODate = string; // ISO 8601 timestamp

export interface DialogueLine {
  speaker: "A" | "B";
  text: string;
}

export interface Mission {
  id: string;
  phase: number;
  day: number;
  title: string;
  situation: string;
  goal?: string;
  key_phrases: string[];
  model_dialogue: DialogueLine[];
  listening_text?: string;
  fluency_prompt?: string;
}

export type StepIndex = 1 | 2 | 3 | 4 | 5 | 6;
export type SessionStatus = "in_progress" | "finished";

export interface Session {
  id: string;
  mission_id: string;
  status: SessionStatus;
  current_step: StepIndex;
  completed_steps: StepIndex[];
  started_at: ISODate;
  finished_at: ISODate | null;
}

export interface Utterance {
  id: string;
  session_id: string;
  step: StepIndex;
  role: "user" | "ai";
  text: string;
  duration_ms?: number;
  created_at: ISODate;
}

export interface ErrorItem {
  id: string;
  session_id: string | null;
  original: string;
  correction: string;
  explanation?: string;
  br_error_id?: string | null;
  occurrences: number;
  active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export type CardRating = "again" | "hard" | "good" | "easy";

export interface Card {
  id: string;
  error_id: string | null;
  front: string;
  back: string;
  ease: number;
  interval_days: number;
  reps: number;
  due_at: ISODate;
  created_at: ISODate;
}

export interface Checkpoint {
  id: string;
  session_id: string | null;
  kind: string; // e.g. "fluency_432"
  metrics: Record<string, number>;
  created_at: ISODate;
}

export interface MaterialItem {
  id: string;
  material_id: string;
  position: number;
  text: string;
  translation?: string;
}

export interface Material {
  id: string;
  title: string;
  source?: string;
  created_at: ISODate;
  items: MaterialItem[];
  /** Prints tab: what was uploaded and the pack generated from it. */
  kind?: "image" | "pdf" | "text" | undefined;
  thumbnail?: string | undefined;
  /** Compressed JPEG data URLs sent to the model (dropped if storage is full). */
  images?: string[] | undefined;
  text?: string | undefined;
  truncated?: boolean | undefined;
  pack_id?: string | undefined;
  level?: string | undefined;
  focus?: string | undefined;
  tokens_in?: number | undefined;
  tokens_out?: number | undefined;
  cost_usd?: number | undefined;
}

export interface AiSettings {
  api_key: string | null;
  model: string;
}

export interface BrError {
  id: string;
  wrong: string;
  right: string;
  explanation: string;
  tags?: string[];
}

export interface ConverseTurn {
  role: "user" | "ai";
  text: string;
}

// ---- UberClass drills ----
export interface DrillTrap {
  word: string;
  hint_pt: string;
}
export interface TranslateItem {
  id: string;
  mode: "translate";
  pt: string;
  /** Accepted answers; the first is the model answer. */
  en: string[];
  focus: string;
  traps: DrillTrap[];
  variations?: { pt: string; en: string[] }[];
}
export interface QaItem {
  id: string;
  mode: "qa";
  q_en: string;
  q_pt: string;
  accept_patterns: string[];
  model_answers: string[];
  focus: string;
  traps: DrillTrap[];
}
export interface LadderStep {
  pt: string;
  /** Accepted answers; the first is the model answer. */
  en: string[];
  focus: string;
  /** Short label of what changed from the previous step, e.g. "+ quando". */
  change_pt: string;
  traps: DrillTrap[];
}
export interface LadderItem {
  id: string;
  mode: "ladder";
  title_pt: string;
  steps: LadderStep[];
  free?: { prompt_pt: string; accept_patterns: string[]; model_answers: string[] };
}
export type DrillItem = TranslateItem | QaItem | LadderItem;
export interface DrillPack {
  id: string;
  title_pt: string;
  level: string;
  focus_pt: string;
  items: DrillItem[];
  user_created?: boolean;
  /** Set when the pack was generated from a Prints material. */
  material_id?: string;
}
export type Difficulty = "iniciante" | "intermediario" | "avancado";
/** One mental shortcut per focus. */
export type PuloDoGato = Record<string, string>;
export type DrillRound = 1 | 2 | 3 | 4;
export interface DrillAttempt {
  id: string;
  pack_id: string;
  round: DrillRound;
  /** Share of items correct on first try (0..1). */
  accuracy: number;
  helped_item_ids: string[];
  created_at: ISODate;
}
export interface PackProgress {
  pack_id: string;
  /** Highest round unlocked (1..4). */
  best_round: DrillRound;
  /** Best accuracy in the best round, 0..1, or null if never played. */
  accuracy: number | null;
}
