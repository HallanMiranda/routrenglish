import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Clock, Flame, Layers, Mic, Play } from "lucide-react";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { repo } from "@/data/repo";
import type { DrillPack, Mission } from "@/data/types";
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

interface State {
  loading: boolean;
  mission: Mission | null;
  streak: number;
  due: number;
  drill: { pack: DrillPack; round: number } | null;
}

function Today() {
  const navigate = useNavigate();
  const [s, setS] = useState<State>({ loading: true, mission: null, streak: 0, due: 0, drill: null });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [mission, streak, cards, last] = await Promise.all([repo.getTodayMission(), repo.getStreak(), repo.listDueCards(), repo.getLastDrillAttempt()]);
      const pack = last ? await repo.getDrillPack(last.pack_id) : null;
      const round = pack ? (await repo.getPackProgress(pack.id)).best_round : 1;
      if (alive) setS({ loading: false, mission, streak, due: cards.length, drill: pack ? { pack, round } : null });
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function start() {
    if (!s.mission) return;
    setStarting(true);
    const session = await repo.startOrResumeSession(s.mission.id);
    navigate({ to: "/sessao/$sessionId", params: { sessionId: session.id } });
  }

  const { mission, streak, loading, due, drill } = s;

  return (
    <AppShell title={t.nav.today}>
      <p className="text-caption -mt-4 flex items-center gap-1.5 text-muted-foreground">
        <Flame className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{t.today.streakLabel}: <span className="font-semibold text-foreground">{streak} {t.today.streak}</span></span>
      </p>

      {loading ? (
        <div className="h-80 animate-pulse rounded-[20px] bg-muted" aria-label={t.today.loading} />
      ) : mission ? (
        <section className="flex min-h-80 flex-col rounded-[20px] bg-ink p-6 text-ink-foreground shadow-card">
          <p className="text-caption flex items-center gap-2 font-semibold text-live">
            {t.today.greeting} · {t.today.day} {mission.day}
          </p>
          <h2 className="text-title mt-3" lang="en">{mission.title}</h2>
          <p className="mt-2 text-base text-ink-foreground/80" lang="en">{mission.situation}</p>
          <p className="text-caption mt-4 flex items-center gap-1.5 text-ink-foreground/80">
            <Clock className="size-4" aria-hidden="true" /> {t.today.estimate}
          </p>
          <div className="flex-1" />
          <Button size="lg" className="mt-8 w-full" onClick={start} disabled={starting}>
            <Mic /> {t.today.start}
          </Button>
        </section>
      ) : drill ? (
        <section className="flex min-h-56 flex-col rounded-[20px] bg-ink p-6 text-ink-foreground shadow-card">
          <p className="text-caption font-semibold text-live">{t.drills.title}</p>
          <h2 className="text-title mt-3">{drill.pack.title_pt}</h2>
          <p className="mt-1 text-base text-ink-foreground/80">{t.drills.continueHelp(drill.round)}</p>
          <div className="flex-1" />
          <Button size="lg" className="mt-8 w-full" asChild>
            <Link to="/aplicabilidade/$packId" params={{ packId: drill.pack.id }} search={{ nivel: "todos" }}><Play /> {t.today.continueDrill}</Link>
          </Button>
        </section>
      ) : (
        <EmptyState action={<Button asChild><Link to="/aplicabilidade">{t.today.toDrills}</Link></Button>}>
          <p className="text-headline text-foreground">{t.today.noMissionTitle}</p>
          <p className="mt-1">{t.today.noMissionBody}</p>
        </EmptyState>
      )}

      {due > 0 && (
        <Link to="/revisao" className="flex min-h-14 items-center gap-3 rounded-[20px] border bg-card px-4 py-3">
          <Layers className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1 font-semibold">{t.today.dueCards(due)}</span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
    </AppShell>
  );
}
