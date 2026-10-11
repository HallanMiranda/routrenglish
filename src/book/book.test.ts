import { describe, expect, it } from "vitest";
import { bookPages, fillCorrect, pagesOfUnit } from "./book";

describe("Book Students pages", () => {
  it("has every page of Units 5 and 6 in order", () => {
    expect(pagesOfUnit(5).map((p) => p.page)).toEqual([28, 29, 30, 31, 32, 33, 34, 35]);
    expect(pagesOfUnit(6).map((p) => p.page)).toEqual([36, 37, 38, 39, 40, 41, 42, 43]);
  });
  it("has well-formed exercises", () => {
    for (const p of bookPages())
      for (const s of p.sections) {
        if (s.kind === "fill") for (const it of s.items) {
          expect(it.en.split("___").length - 1, `${p.page}: ${it.en}`).toBe(1);
          expect(fillCorrect(it.answers[0]!, it.answers), `${p.page}: ${it.en}`).toBe(true);
        }
        if (s.kind === "choose") for (const it of s.items) expect(it.options[it.correct], `${p.page}`).toBeTruthy();
        if (s.kind === "match") expect(new Set(s.pairs.map((x) => `${x.a}|${x.b}`)).size).toBe(s.pairs.length);
      }
  });
  it("accepts contractions and case in typed answers", () => {
    expect(fillCorrect("Doesn't live", ["doesn't live", "does not live"])).toBe(true);
    expect(fillCorrect("does not live", ["doesn't live"])).toBe(true);
    expect(fillCorrect("live", ["doesn't live"])).toBe(false);
  });
});
