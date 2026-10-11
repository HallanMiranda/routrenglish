import { describe, expect, it } from "vitest";
import { parsePackJson } from "./importPack";

describe("parsePackJson", () => {
  it("accepts a mixed pack", () => {
    const r = parsePackJson(JSON.stringify({
      title_pt: "T", level: "A2", focus_pt: "F", pulo_do_gato: { to_be: "x" },
      items: [
        { id: "a", mode: "translate", pt: "Oi", en: ["Hi"], focus: "f", traps: [] },
        { id: "b", mode: "qa", q_en: "Q?", q_pt: "P?", accept_patterns: ["i am"], model_answers: ["I am ok."], focus: "f", traps: [] },
        { id: "c", mode: "ladder", title_pt: "L", steps: [{ pt: "Eu", en: ["I"], focus: "f", change_pt: "", traps: [] }, { pt: "Eu moro", en: ["I live"], focus: "f", change_pt: "+ verbo", traps: [] }] },
      ],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pulo["to_be"]).toBe("x");
  });
  it("names item and field on error", () => {
    const r = parsePackJson(JSON.stringify({ title_pt: "T", level: "A1", focus_pt: "F", items: [{ id: "x", mode: "ladder", title_pt: "L", steps: [{ pt: "Eu", focus: "f" }] }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('Item 1 (x), degrau 1: campo "en"');
  });
  it("rejects invalid JSON", () => {
    expect(parsePackJson("{oops").ok).toBe(false);
  });
});
