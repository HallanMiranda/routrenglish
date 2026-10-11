import type { Difficulty } from "@/data/types";

/** A1 = iniciante, A2 = intermediário, B1+ = avançado; anything else (user packs) has none. */
export function difficultyOf(level: string): Difficulty | null {
  const l = level.trim().toUpperCase();
  if (l === "A1") return "iniciante";
  if (l === "A2") return "intermediario";
  if (/^[BC][12]/.test(l)) return "avancado";
  return null;
}
