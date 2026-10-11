import { describe, expect, it } from "vitest";
import course from "./headway-starter.json";
import { parsePacksJson } from "@/drills/importPack";

describe("built-in Headway Starter course", () => {
  it("imports all 14 units with no errors", () => {
    const r = parsePacksJson(JSON.stringify(course));
    expect(r.errors).toEqual([]);
    expect(r.course?.id).toBe("headway-starter");
    expect(r.packs).toHaveLength(14);
    expect(r.packs.every((p) => p.course_id === "headway-starter" && p.unit && p.lesson_intro)).toBe(true);
  });
});

import pulo from "./pulo-do-gato.json";
describe("built-in Pulo do Gato", () => {
  it("imports the 10 key-verb packs with no errors", () => {
    const r = parsePacksJson(JSON.stringify(pulo));
    expect(r.errors).toEqual([]);
    expect(r.packs.map((p) => p.id)).toHaveLength(10);
  });
});
