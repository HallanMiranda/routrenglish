import { describe, expect, it } from "vitest";
import { shouldDisableAppWorker } from "@/lib/pwa";

describe("App worker preview safety", () => {
  it.each(["id-preview--example.lovable.app", "preview--example.lovable.app", "lovableproject.com", "example.lovableproject.com", "lovableproject-dev.com", "example.lovableproject-dev.com", "beta.lovable.dev", "example.beta.lovable.dev"])("refuses %s", (host) => {
    expect(shouldDisableAppWorker(new URL(`https://${host}/`), true, false)).toBe(true);
  });
  it("refuses development, iframes, and the kill switch", () => {
    const url = new URL("https://speak-lab.example/");
    expect(shouldDisableAppWorker(url, false, false)).toBe(true);
    expect(shouldDisableAppWorker(url, true, true)).toBe(true);
    expect(shouldDisableAppWorker(new URL(`${url}?sw=off`), true, false)).toBe(true);
    expect(shouldDisableAppWorker(url, true, false)).toBe(false);
  });
});