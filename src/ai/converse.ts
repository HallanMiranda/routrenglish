import { repo } from "@/data/repo";
import type { ConverseTurn } from "@/data/types";

export interface ConverseResult {
  reply: string;
  missionEnd: boolean;
}

const MAX_TURNS = 6;

/**
 * Mock of the future AI conversation. Same signature as the real call.
 * Walks through the mission's key phrases and ends after ~6 AI turns.
 */
export async function converse(missionId: string, history: ConverseTurn[]): Promise<ConverseResult> {
  const mission = await repo.getMission(missionId);
  const aiTurns = history.filter((h) => h.role === "ai").length;
  const phrases = mission?.key_phrases ?? [];
  await new Promise((r) => setTimeout(r, 500));

  if (aiTurns === 0) {
    return {
      reply: `Hi there! ${mission ? `Let's practice: ${mission.title}.` : ""} How can I help you today?`.replace(/\s+/g, " "),
      missionEnd: false,
    };
  }
  if (aiTurns >= MAX_TURNS - 1) {
    return { reply: "Great job! That's everything for this mission. Have a nice day!", missionEnd: true };
  }
  const phrase = phrases[(aiTurns - 1) % Math.max(1, phrases.length)];
  const reply = phrase
    ? `Sure. Now try using this phrase: "${phrase}"`
    : "Okay, tell me a little more, please.";
  return { reply, missionEnd: false };
}
