// "Conversa" (Hoje): a meeting-style chat that keeps the learner talking and corrects each answer.
import { aiFor, chat } from "./client";

export interface TalkTopic {
  id: string;
  /** What the AI talks about, in English. */
  prompt: string;
  /** Local questions used without AI (or when the call fails). */
  questions: string[];
}

export const TOPICS: TalkTopic[] = [
  {
    id: "work",
    prompt: "his work: what he does, his clients, his projects and his workday",
    questions: [
      "So, tell me about your job. What do you do?",
      "What are you working on this week?",
      "What do you like most about your job? Why?",
      "Tell me about a typical workday, from the morning to the evening.",
      "What was difficult at work last week?",
      "What would you like to do differently next month?",
    ],
  },
  {
    id: "meeting",
    prompt: "a weekly status meeting with an American client: progress, problems, next steps and deadlines",
    questions: [
      "Hi! Thanks for joining. Can you give me a quick update on the project?",
      "What did you finish last week?",
      "Is there any problem I should know about?",
      "What do you need from our team?",
      "What are the next steps?",
      "When do you think it will be ready?",
    ],
  },
  {
    id: "day",
    prompt: "his day today: what he did, what he is doing now and what he will do later",
    questions: [
      "How's your day going so far?",
      "What did you do this morning?",
      "What are you doing right now?",
      "What will you do after work?",
      "What was the best part of your day? Why?",
      "What time will you go to bed tonight?",
    ],
  },
  {
    id: "weekend",
    prompt: "his last weekend and his plans for the next one",
    questions: [
      "How was your weekend?",
      "What did you do on Saturday?",
      "Did you go out or stay home? Why?",
      "Who did you see?",
      "What are you going to do next weekend?",
      "What's your perfect weekend like?",
    ],
  },
  {
    id: "life",
    prompt: "his life: family, city, hobbies, goals and why he is learning English",
    questions: [
      "Tell me a little about yourself.",
      "Where do you live? What's it like there?",
      "Tell me about your family.",
      "What do you do in your free time?",
      "Why are you learning English?",
      "What would you like to do in the next five years?",
    ],
  },
];

export interface TalkTurn {
  role: "ai" | "user";
  text: string;
}

export interface TalkReply {
  /** False when the learner's last answer had a real mistake. */
  correct: boolean;
  /** The learner's answer, fixed with minimal changes (empty when correct). */
  natural: string;
  /** One short Portuguese tip about the mistake (empty when correct). */
  tip_pt: string;
  /** The natural sentence in Portuguese, used as the review card front (empty when correct). */
  natural_pt: string;
  /** The next line: a short reaction plus one open question. */
  reply: string;
}

function system(topic: TalkTopic, name: string, city: string) {
  return [
    `You are Coach, a friendly American colleague on a video call with ${name}${city ? ` from ${city}` : ""}, a Brazilian learning to speak English (beginner to intermediate).`,
    `Topic: ${topic.prompt}.`,
    "Your job: keep him speaking English for as long as possible, and help him build longer sentences.",
    "Each turn, first check his last answer. If there is a real mistake (grammar, wrong word, unnatural phrasing, missing do/does/did, wrong he/she/his/her, missing third-person -s, wrong tense), set correct=false, write natural = his own answer fixed with as few changes as possible (keep his meaning and his words), and tip_pt = one short tip in Brazilian Portuguese about the main mistake, and natural_pt = the natural sentence translated to Brazilian Portuguese. Ignore speech-recognition spelling of names and small accent issues; if it is fine, correct=true and natural, tip_pt and natural_pt are empty strings.",
    "Then write reply: react naturally in 1 short sentence, and ask exactly ONE open question that makes him talk more (why, how, what happened, tell me more). If his answer was short (fewer than 8 words), ask him to add a detail or a reason with because, and, but or so.",
    "Use simple, natural spoken American English. Never explain grammar in the reply. Stay on the topic, but follow what he says.",
    'Return JSON only: {"correct": boolean, "natural": string, "tip_pt": string, "natural_pt": string, "reply": string}.',
  ].join("\n");
}

/** One conversation turn. With no AI (or on failure) it asks the next local question, without correction. */
export async function talkTurn(topic: TalkTopic, history: TalkTurn[], me: { name: string; city: string }, signal?: AbortSignal): Promise<TalkReply & { ai: boolean }> {
  const s = await aiFor("converse");
  if (s) {
    try {
      const content = await chat(
        s,
        [
          { role: "system", content: system(topic, me.name, me.city) },
          ...history.slice(-16).map((h) => ({ role: h.role === "ai" ? ("assistant" as const) : ("user" as const), content: h.text })),
          ...(history.length === 0 ? [{ role: "user" as const, content: "(The call starts. Greet him by name and ask your first question. correct=true.)" }] : []),
        ],
        "converse",
        signal ? { signal } : {},
      );
      const r = JSON.parse(content) as Partial<TalkReply>;
      if (r.reply?.trim())
        return { ai: true, correct: r.correct !== false || !r.natural?.trim(), natural: r.natural?.trim() ?? "", tip_pt: r.tip_pt?.trim() ?? "", natural_pt: r.natural_pt?.trim() ?? "", reply: r.reply.trim() };
    } catch {
      if (signal?.aborted) throw new Error("aborted");
      /* fall back to the local questions */
    }
  }
  const asked = history.filter((h) => h.role === "ai").length;
  const q = topic.questions[asked % topic.questions.length]!;
  const lastUser = [...history].reverse().find((h) => h.role === "user")?.text ?? "";
  const short = lastUser && lastUser.split(/\s+/).length < 8;
  const lead = asked === 0 ? `Hi ${me.name}! ` : short ? "Nice! Can you tell me more? " : "Great! ";
  return { ai: false, correct: true, natural: "", tip_pt: "", natural_pt: "", reply: `${lead}${q}`.trim() };
}

/** Picks today's topic so it rotates day by day. */
export function topicOfToday(now = new Date()) {
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  return TOPICS[dayIndex % TOPICS.length]!;
}
