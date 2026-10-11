import { describe, expect, it } from "vitest";
import course from "./headway-starter.json";
import pulo from "./pulo-do-gato.json";
import { checkAnswer, checkQa } from "@/drills/check";

type Step = { pt: string; en: string[] };
type Item = { id: string; mode: string; steps?: Step[]; free?: { accept_patterns: string[]; model_answers: string[] }; accept_patterns?: string[]; model_answers?: string[]; traps?: [] };

describe("Built-in course and Pulo do Gato answers pass the app's own checker", () => {
  for (const pack of [...course.packs, ...pulo.packs] as unknown as { id: string; items: Item[] }[]) {
    it(pack.id, () => {
      for (const it of pack.items) {
        if (it.mode === "ladder")
          for (const s of it.steps!) for (const a of s.en) expect(checkAnswer(a, s.en).correct, `${it.id}: ${a}`).toBe(true);
        const qa = it.mode === "qa" ? it : it.free!;
        for (const m of qa.model_answers!) expect(checkQa(m, { accept_patterns: qa.accept_patterns!, traps: [] }).correct, `${it.id}: ${m}`).toBe(true);
      }
    });
  }
});
