import { repo } from "@/data/repo";
import type { ConverseTurn, Mission } from "@/data/types";
import { aiFor, chat } from "./client";

export interface ConverseResult {
  reply: string;
  missionEnd: boolean;
}

const END = "[[MISSION_END]]";
const MOCK_TURNS = 6;

function systemPrompt(m: Mission) {
  return [
    `You play this role: ${m.ai_role ?? "a friendly local person"}.`,
    `Scenario: ${m.situation}`,
    `Help the learner reach this goal: ${m.goal ?? m.title}.`,
    `Useful phrases for the learner: ${m.key_phrases.join(" | ")}`,
    "Speak like a real person, 1-2 short sentences per turn, and adapt to the learner's level.",
    "Create one small realistic complication during the conversation.",
    "Never correct the learner explicitly. Only ask for clarification in character when you really don't understand.",
    `End your final message with the token ${END} when the goal is achieved or after about 10 learner turns.`,
  ].join("\n");
}

/** Mission conversation: the text model when "Conversa com IA" is on, otherwise a local scripted mock. */
export async function converse(missionId: string, history: ConverseTurn[]): Promise<ConverseResult> {
  const mission = await repo.getMission(missionId);
  const s = mission ? await aiFor("converse") : null;
  if (s && mission) {
    try {
      const content = await chat(s, [
        { role: "system", content: systemPrompt(mission) },
        ...history.map((h) => ({ role: h.role === "ai" ? ("assistant" as const) : ("user" as const), content: h.text })),
        ...(history.length === 0 ? [{ role: "user" as const, content: "(The learner arrives. Start the conversation.)" }] : []),
      ], "converse", { json: false });
      const missionEnd = content.includes(END);
      return { reply: content.replace(END, "").trim(), missionEnd };
    } catch {
      /* fall back to the local mock */
    }
  }
  return mock(mission, history);
}

async function mock(mission: Mission | null, history: ConverseTurn[]): Promise<ConverseResult> {
  const aiTurns = history.filter((h) => h.role === "ai").length;
  const phrases = mission?.key_phrases ?? [];
  await new Promise((r) => setTimeout(r, 500));
  if (aiTurns === 0)
    return { reply: mission?.ai_opening ?? `Hi there! ${mission ? `Let's practice: ${mission.title}.` : ""} How can I help you today?`.replace(/\s+/g, " "), missionEnd: false };
  if (aiTurns >= MOCK_TURNS - 1) return { reply: "Great job! That's everything for this mission. Have a nice day!", missionEnd: true };
  const phrase = phrases[(aiTurns - 1) % Math.max(1, phrases.length)];
  return { reply: phrase ? `Sure. Now try using this phrase: "${phrase}"` : "Okay, tell me a little more, please.", missionEnd: false };
}

export interface ReportTarget {
  mine: string;
  natural: string;
  explanation_pt: string;
  hint_pt: string;
}

/** End-of-mission report: up to 3 targets, each saved as a review card. Empty without AI. */
export async function missionReport(missionId: string, history: ConverseTurn[]): Promise<ReportTarget[]> {
  const mission = await repo.getMission(missionId);
  const s = await aiFor("converse");
  if (!s || !mission) return [];
  try {
    const content = await chat(s, [
      {
        role: "system",
        content: `You review a Brazilian learner's spoken English from a role-play (${mission.situation}). Return JSON {targets: [{mine: string, natural: string, explanation_pt: string, hint_pt: string}]} with up to 3 of the learner's sentences that most need work: their sentence, a natural version, a short explanation in Portuguese, and a Portuguese self-correction hint that does not give the answer.`,
      },
      { role: "user", content: history.map((h) => `${h.role === "ai" ? "AI" : "Learner"}: ${h.text}`).join("\n") },
    ], "report");
    const targets = ((JSON.parse(content) as { targets?: ReportTarget[] }).targets ?? []).slice(0, 3);
    for (const tg of targets) await repo.createCard({ front: tg.mine, back: tg.natural });
    return targets;
  } catch {
    return [];
  }
}
