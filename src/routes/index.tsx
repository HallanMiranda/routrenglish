import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Mic } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hoje — Speak Lab" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "Sua missão diária para praticar inglês falado." },
      { property: "og:title", content: "Hoje — Speak Lab" },
      { property: "og:description", content: "Sua missão diária para praticar inglês falado." },
    ],
  }),
  component: Today,
});

function Today() {
  return (
    <AppShell title={t.nav.today}>
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
        <Flame className="size-4" /> 0 {t.today.streak}
      </div>

      <section className="rounded-3xl bg-ink p-6 text-ink-foreground shadow-card">
        <p className="text-xs font-semibold uppercase tracking-widest text-live">
          {t.today.greeting}
        </p>
        <h2 className="mt-3 text-3xl font-bold" lang="en">
          {t.today.placeholderMission}
        </h2>
        <p className="mt-2 text-sm opacity-80">{t.today.placeholderSituation}</p>

        <ol className="mt-6 grid grid-cols-6 gap-1.5">
          {t.session.steps.map((s) => (
            <li key={s} title={s} className="h-1.5 rounded-full bg-ink-foreground/20" />
          ))}
        </ol>

        <Link
          to="/sessao/$sessionId"
          params={{ sessionId: "demo" }}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground transition-transform active:translate-y-0.5"
        >
          <Mic className="size-5" /> {t.today.start}
        </Link>
      </section>
    </AppShell>
  );
}
