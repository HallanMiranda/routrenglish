import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Flame, Mic } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/AppShell";
import { repo } from "@/data/repo";
import type { Mission } from "@/data/types";
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
  const navigate = useNavigate();
  const [state, setState] = useState<{ loading: boolean; mission: Mission | null; streak: number }>({
    loading: true,
    mission: null,
    streak: 0,
  });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([repo.getTodayMission(), repo.getStreak()]).then(([mission, streak]) => {
      if (alive) setState({ loading: false, mission, streak });
    });
    return () => {
      alive = false;
    };
  }, []);

  async function start() {
    if (!state.mission) return;
    setStarting(true);
    const session = await repo.startOrResumeSession(state.mission.id);
    navigate({ to: "/sessao/$sessionId", params: { sessionId: session.id } });
  }

  const { mission, streak, loading } = state;

  return (
    <AppShell title={t.nav.today}>
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
        <Flame className="size-4" /> {streak} {t.today.streak}
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-muted" aria-label={t.today.loading} />
      ) : !mission ? (
        <EmptyState title={t.today.noMissionTitle} body={t.today.noMissionBody} />
      ) : (
        <section className="rounded-3xl bg-ink p-6 text-ink-foreground shadow-card">
          <p className="text-xs font-semibold uppercase tracking-widest text-live">
            {t.today.greeting} · {t.today.day} {mission.day}
          </p>
          <h2 className="mt-3 text-3xl font-bold" lang="en">
            {mission.title}
          </h2>
          <p className="mt-2 text-sm opacity-80" lang="en">
            {mission.situation}
          </p>

          <ol className="mt-6 grid grid-cols-6 gap-1.5">
            {t.session.steps.map((s) => (
              <li key={s} title={s} className="h-1.5 rounded-full bg-ink-foreground/20" />
            ))}
          </ol>

          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground transition-transform active:translate-y-0.5 disabled:opacity-70"
          >
            <Mic className="size-5" /> {t.today.start}
          </button>
        </section>
      )}
    </AppShell>
  );
}
