import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/sessao/$sessionId")({
  head: () => ({
    meta: [
      { title: "Sessão — Speak Lab" },
      { name: "description", content: "Sessão de prática em 6 etapas." },
      { property: "og:title", content: "Sessão — Speak Lab" },
      { property: "og:description", content: "Sessão de prática em 6 etapas." },
    ],
  }),
  component: Session,
});

function Session() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-ink-foreground">
      <header className="flex items-center gap-4 px-5 pt-6">
        <Link to="/" aria-label={t.session.exit} className="rounded-full p-2 hover:bg-ink-foreground/10">
          <X className="size-5" />
        </Link>
        <ol className="grid flex-1 grid-cols-6 gap-1.5">
          {t.session.steps.map((s, i) => (
            <li key={s} className={`h-1.5 rounded-full ${i === 0 ? "bg-live" : "bg-ink-foreground/20"}`} />
          ))}
        </ol>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-live">1 / 6</p>
        <h1 className="mt-2 text-3xl font-bold">{t.session.steps[0]}</h1>
        <p className="mt-3 text-sm opacity-70">{t.common.comingSoon}</p>
      </main>
    </div>
  );
}
