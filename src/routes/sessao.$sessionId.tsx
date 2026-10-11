import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { t } from "@/lib/i18n/pt-BR";
import { useEffect, useState } from "react";
import { MicButton, type MicState } from "@/components/session/MicButton";

export const Route = createFileRoute("/sessao/$sessionId")({
  head: () => ({
    meta: [
      { title: "Sessão — Speak Lab" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "Sessão de prática em 6 etapas." },
      { property: "og:title", content: "Sessão — Speak Lab" },
      { property: "og:description", content: "Sessão de prática em 6 etapas." },
    ],
  }),
  component: Session,
});

function Session() {
  const [micState, setMicState] = useState<MicState>("idle");
  useEffect(() => {
    if (micState !== "processing") return;
    const timer = window.setTimeout(() => setMicState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [micState]);
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col bg-ink text-ink-foreground">
      <header className="flex items-center gap-4 px-5 pt-2">
        <Link to="/" aria-label={t.session.exit} className="grid size-11 place-items-center rounded-full hover:bg-ink-foreground/10">
          <X className="size-5" />
        </Link>
        <ol className="grid flex-1 grid-cols-6 gap-1.5">
          {t.session.steps.map((s, i) => (
            <li key={s} className={`h-1.5 rounded-full ${i === 0 ? "bg-live" : "bg-ink-foreground/20"}`} />
          ))}
        </ol>
      </header>
      <main className="flex flex-1 flex-col items-center justify-end px-5 pb-10 text-center">
        <p className="text-caption font-semibold text-live">{t.session.stepOf(1, 6)}</p>
        <h1 className="text-large-title mt-2">{t.session.steps[0]}</h1>
        <p className="mt-3 text-base text-ink-foreground/80">{t.common.comingSoon}</p>
        <div className="mt-10 flex flex-col items-center gap-5">
          <MicButton state={micState} onClick={() => setMicState(micState === "idle" ? "recording" : "processing")} />
          <p role="status" aria-live="polite" className="h-6 text-base font-semibold">{t.mic.states[micState]}</p>
          <p className="text-caption text-ink-foreground/80">{t.mic.demo}</p>
        </div>
      </main>
    </div>
  );
}
