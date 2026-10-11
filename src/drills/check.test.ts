import { describe, expect, it } from "vitest";
import { checkAnswer, normalizeTokens, parseDrillLines } from "./check";

describe("drill check", () => {
  it("normalizes contractions, numbers, accents and US", () => {
    expect(normalizeTokens("I'm twenty-five, from the U.S.!")).toEqual(["i", "am", "25", "from", "the", "united", "states"]);
    expect(normalizeTokens("She’s from São Paulo")).toEqual(["she", "is", "from", "sao", "paulo"]);
  });
  it("accepts any accepted answer", () => {
    expect(checkAnswer("my name's allan", ["My name is Allan.", "I'm Allan."]).correct).toBe(true);
  });
  it("marks wrong words and fires traps", () => {
    const r = checkAnswer("I have 30 years", ["I'm 30 years old."], [{ word: "have", hint_pt: "Idade usa to be." }]);
    expect(r.correct).toBe(false);
    expect(r.trap?.hint_pt).toBe("Idade usa to be.");
    expect(r.ops.some((o) => o.type === "wrong" || o.type === "extra")).toBe(true);
  });
  it("does not fire trap when closest answer contains it", () => {
    expect(checkAnswer("I have a dog", ["I have two dogs."], [{ word: "have", hint_pt: "x" }]).trap).toBeNull();
  });
  it("parses pasted lines", () => {
    expect(parseDrillLines("Oi | Hi | Hello\nlixo\n")).toHaveLength(1);
  });
});
