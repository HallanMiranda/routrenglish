import type { TalkSession } from "@/data/types";

/** Starts at 1 minute and grows 30 s every time the goal is reached, up to 5 minutes. */
export const FIRST_GOAL = 60;
export const STEP = 30;
export const MAX_GOAL = 300;

export function nextGoal(talks: TalkSession[]): number {
  const reached = talks.filter((t) => t.reached).length;
  return Math.min(MAX_GOAL, FIRST_GOAL + reached * STEP);
}

const day = (d: Date) => d.toLocaleDateString("en-CA");

/** Seconds spoken today across all conversations. */
export function spokenToday(talks: TalkSession[], now = new Date()): number {
  const today = day(now);
  return talks.filter((t) => day(new Date(t.created_at)) === today).reduce((n, t) => n + t.seconds, 0);
}

/** Best single conversation, in seconds. */
export const bestTalk = (talks: TalkSession[]) => talks.reduce((m, t) => Math.max(m, t.seconds), 0);

/** "1:30" style. */
export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
