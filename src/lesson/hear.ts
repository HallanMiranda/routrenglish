// One hands-free listening turn: browser recognizer (live text) + optional AI transcript, plus voice commands.
import { repo } from "@/data/repo";
import { aiFor, transcribe } from "@/ai/client";
import { listenLive } from "@/speech/recognize";
import { canRecord, startRecording, type Recording } from "@/speech/record";

export type VoiceCommand = "repeat" | "dontKnow" | "slower" | "pause";

const COMMANDS: [VoiceCommand, RegExp][] = [
  ["dontKnow", /\b(n[aã]o sei|now say|i don'?t know|don'?t know)\b/i],
  ["slower", /\b(mais devagar|slower|slow down|more slowly)\b/i],
  ["pause", /^\W*(pausa|pause|pausar)\W*$/i],
  ["repeat", /^\W*(repete|repeat|de novo|again|repeat please|say again)\W*$/i],
];

export function detectCommand(text: string): VoiceCommand | null {
  for (const [cmd, re] of COMMANDS) if (re.test(text.trim())) return cmd;
  return null;
}

export interface Heard {
  transcript: string;
  seconds: number;
}

/** Listens once; stops after 1.5 s of silence or when `signal` aborts. Throws the recognizer's Portuguese errors. */
export async function hearOnce(expected: string[], signal: AbortSignal, onInterim: (t: string) => void, onProcessing: () => void): Promise<Heard> {
  const ai = await aiFor("listen");
  let rec: Recording | null = null;
  if (ai && canRecord()) rec = await startRecording().catch(() => null);
  const t0 = Date.now();
  try {
    const r = await listenLive({ lang: "en-US", signal, onInterim });
    const seconds = (Date.now() - t0) / 1000;
    let transcript = r.transcript;
    if (rec && ai && transcript && !signal.aborted && !detectCommand(transcript)) {
      onProcessing();
      const audio = await rec.stop();
      rec = null;
      const name = (await repo.getMyName()).name;
      const text = await transcribe(ai, audio.blob, audio.seconds, `${expected.slice(0, 3).join(" ")} My name is ${name}.`).catch(() => "");
      if (text) transcript = text;
    }
    return { transcript, seconds };
  } finally {
    void rec?.stop();
  }
}
