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

// ---- Guided translation drills (Praticar) ----
export interface DrillTrap {
  word: string;
  hint_pt: string;
}
export interface DrillItem {
  id: string;
  pt: string;
  /** Accepted answers; the first is the model answer. */
  en: string[];
  focus: string;
  traps: DrillTrap[];
}
export interface DrillPack {
  id: string;
  title_pt: string;
  level: string;
  focus_pt: string;
  items: DrillItem[];
  user_created?: boolean;
}
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
