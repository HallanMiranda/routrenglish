import { describe, expect, it } from "vitest";
import { checkAnswer, checkQa, isAttentionSlip, normalizeTokens, parseDrillLines } from "./check";

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
  it("checks QA answers by pattern and length", () => {
    const item = { accept_patterns: ["i live in"], traps: [] };
    expect(checkQa("I live in Miami", item).correct).toBe(true);
    expect(checkQa("live in", item).correct).toBe(false);
    expect(checkQa("Actually I live in Miami now", item).correct).toBe(true);
  });
  it("detects attention slips", () => {
    expect(isAttentionSlip(checkAnswer("Her name is Ana", ["His name is Ana."]).ops)).toBe(true);
    expect(isAttentionSlip(checkAnswer("She work here", ["She works here."]).ops)).toBe(true);
    expect(isAttentionSlip(checkAnswer("She lives there", ["She works here."]).ops)).toBe(false);
  });
});

import { applyMyName, checkTranslate as ct2 } from "./check";
describe("lenient recognizer spelling", () => {
  it("accepts a name alias and proper-noun spelling", () => {
    expect(ct2(applyMyName("My name is Alan", "Allan", ["Alan", "Allen"]), { en: ["My name is Allan."], traps: [] }).correct).toBe(true);
    expect(ct2("I live in Sao Paolo", { en: ["I live in São Paulo."], traps: [] }).correct).toBe(true);
  });
  it("forgives one letter in long words but never in attention words", () => {
    expect(ct2("I work as an enginer", { en: ["I work as an engineer."], traps: [] }).correct).toBe(true);
    expect(ct2("She is his sister", { en: ["She is her sister."], traps: [] }).correct).toBe(false);
    expect(ct2("They is here", { en: ["They are here."], traps: [] }).correct).toBe(false);
  });
});
