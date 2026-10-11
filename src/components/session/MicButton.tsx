import { LoaderCircle, Mic } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";

export type MicState = "idle" | "recording" | "processing";
export function MicButton({ state = "idle", className, disabled, ...props }: Omit<ButtonProps, "children"> & { state?: MicState }) {
  return (
    <Button
      {...props}
      type="button"
      disabled={disabled || state === "processing"}
      aria-label={t.mic.actions[state]}
      aria-pressed={state === "recording"}
      aria-busy={state === "processing"}
      data-state={state}
      className={cn("relative size-28 shrink-0 rounded-full p-0 [&_svg]:size-9", state === "recording" && "mic-recording bg-live text-live-foreground hover:bg-live/90", className)}
    >
      {state === "idle" && <Mic aria-hidden="true" />}
      {state === "processing" && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
      {state === "recording" && <span aria-hidden="true" className="mic-wave flex h-10 items-center gap-1.5">{[0, 1, 2, 3, 4].map((bar) => <span key={bar} className="w-1.5 rounded-full bg-current" />)}</span>}
    </Button>
  );
}