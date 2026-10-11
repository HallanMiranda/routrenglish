import { describe, expect, it } from "vitest";
import type { TalkSession } from "@/data/types";
import { clock, nextGoal, spokenToday } from "./goal";

const talk = (reached: boolean, seconds = 60, created_at = new Date().toISOString()): TalkSession =>
  ({ id: "x", topic: "work", seconds, goal_seconds: 60, turns: 3, longest: 8, reached, created_at });

describe("talk goal", () => {
  it("starts at one minute and grows 30 s per reached goal, capped at 5 min", () => {
    expect(nextGoal([])).toBe(60);
    expect(nextGoal([talk(true), talk(false), talk(true)])).toBe(120);
    expect(nextGoal(Array.from({ length: 20 }, () => talk(true)))).toBe(300);
  });
  it("sums only today's speaking time", () => {
    expect(spokenToday([talk(true, 50), talk(false, 20), talk(true, 99, "2020-01-01T12:00:00Z")])).toBe(70);
  });
  it("formats a clock", () => {
    expect(clock(90)).toBe("1:30");
    expect(clock(5)).toBe("0:05");
  });
});
