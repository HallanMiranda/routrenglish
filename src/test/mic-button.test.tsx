import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MicButton } from "@/components/session/MicButton";
import { t } from "@/lib/i18n/pt-BR";

afterEach(cleanup);
describe("MicButton", () => {
  it("accepts clicks when idle", () => {
    const click = vi.fn();
    render(<MicButton state="idle" onClick={click} />);
    fireEvent.click(screen.getByRole("button", { name: t.mic.actions.idle }));
    expect(click).toHaveBeenCalledOnce();
  });
  it("exposes recording state", () => {
    render(<MicButton state="recording" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
  it("prevents duplicate clicks while processing", () => {
    render(<MicButton state="processing" />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});