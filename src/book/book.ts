// Book Students: page-by-page study content of the built-in course (src/content/headway-starter-book.json).
import bookJson from "@/content/headway-starter-book.json";
import { normalizeTokens } from "@/drills/check";

export type BookSection =
  | { kind: "intro"; text_pt: string }
  | { kind: "tip"; text_pt: string }
  | { kind: "vocab"; title_pt: string; items: { en: string; pt: string }[] }
  | { kind: "grammar"; title_pt: string; rows: { label: string; en: string }[]; note_pt?: string }
  | { kind: "dialogue"; title_pt: string; note_pt?: string; lines: { who: string; en: string; pt: string }[] }
  | { kind: "fill"; title_pt: string; items: { en: string; answers: string[]; pt: string }[] }
  | { kind: "choose"; title_pt: string; items: { options: string[]; correct: number; why_pt: string }[] }
  | { kind: "match"; title_pt: string; pairs: { a: string; b: string }[] }
  | { kind: "speak"; title_pt: string; prompts: { q: string; pt: string; model: string }[] };

export interface BookPage {
  page: number;
  unit: number;
  title: string;
  subtitle_pt: string;
  sections: BookSection[];
}

const data = bookJson as unknown as { course_id: string; pages: BookPage[] };

export const BOOK_COURSE = data.course_id;
export const bookPages = (): BookPage[] => data.pages;
export const pagesOfUnit = (unit: number) => data.pages.filter((p) => p.unit === unit).sort((a, b) => a.page - b.page);
export const getBookPage = (n: number) => data.pages.find((p) => p.page === n) ?? null;

/** Typed answer vs accepted answers, ignoring case, punctuation and contractions. */
export function fillCorrect(typed: string, answers: string[]) {
  const got = normalizeTokens(typed).join(" ");
  return !!got && answers.some((a) => normalizeTokens(a).join(" ") === got);
}
