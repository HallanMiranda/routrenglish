import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, ChevronRight, Flame, Layers, Mic, Play } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { repo } from "@/data/repo";
import type { DrillPack, Mission } from "@/data/types";
import { bestTalk, clock, nextGoal, spokenToday } from "@/talk/goal";
import { t } from "@/lib/i18n/pt-BR";
import { loadCourses, unitNumber, unitTitle } from "@/course/course";
import { BOOK_COURSE, pagesOfUnit } from "@/book/book";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hoje — Speak Lab" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "Conversa diária por voz para ficar cada vez mais tempo falando inglês." },
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
  unit: { pack: DrillPack; n: number } | null;
  talk: { goal: number; today: number; best: number };
}

function Today() {
  const navigate = useNavigate();
  const [s, setS] = useState<State>({ loading: true, mission: null, streak: 0, due: 0, unit: null, talk: { goal: 60, today: 0, best: 0 } });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [mission, streak, cards, courses, talks, pagesDone] = await Promise.all([repo.getTodayMission(), repo.getStreak(), repo.listDueCards(), loadCourses(), repo.listTalks(), repo.listBookPagesDone()]);
      const book = courses.find((c) => c.course.id === BOOK_COURSE);
      const withPages = book?.units.find((u) => { const ps = pagesOfUnit(unitNumber(u.pack)); return ps.length > 0 && ps.some((p) => !pagesDone.includes(p.page)); });
      const cur = withPages ?? courses.find((c) => c.current)?.current;
      const unit = cur ? { pack: cur.pack, n: unitNumber(cur.pack) } : null;
      const talk = { goal: nextGoal(talks), today: spokenToday(talks), best: bestTalk(talks) };
      if (alive) setS({ loading: false, mission, streak, due: cards.length, unit, talk });
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

  const { mission, streak, loading, due, unit, talk } = s;

  return (
    <AppShell title={t.nav.today}>
      <p className="text-caption -mt-4 flex items-center gap-1.5 text-muted-foreground">
        <Flame className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{t.today.streakLabel}: <span className="font-semibold text-foreground">{streak} {t.today.streak}</span></span>
      </p>

      {loading ? (
        <div className="h-72 animate-pulse rounded-[20px] bg-muted" aria-label={t.today.loading} />
      ) : (
        <section className="flex min-h-72 flex-col rounded-[20px] bg-ink p-6 text-ink-foreground shadow-card">
          <p className="text-caption font-semibold text-live">{t.talk.eyebrow}</p>
          <h2 className="text-title mt-3">{t.talk.goal(clock(talk.goal))}</h2>
          <p className="mt-2 text-base text-ink-foreground/80">{t.talk.help}</p>
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-ink-foreground/15" role="progressbar" aria-valuemin={0} aria-valuemax={talk.goal} aria-valuenow={talk.today}>
              <div className="h-full rounded-full bg-live" style={{ width: `${Math.min(100, (talk.today / talk.goal) * 100)}%` }} />
            </div>
            <p className="text-caption mt-2 text-ink-foreground/80">
              {t.talk.today(clock(talk.today), clock(talk.goal))}
              {talk.best > 0 && <> · {t.talk.best(clock(talk.best))}</>}
            </p>
          </div>
          <div className="flex-1" />
          <Button size="lg" className="mt-6 w-full" asChild>
            <Link to="/conversa"><Mic /> {t.talk.start}</Link>
          </Button>
        </section>
      )}

      {!loading && (unit || mission || due > 0) && <h2 className="text-headline pt-2">{t.talk.alsoToday}</h2>}

      {!loading && unit && (
        <Link to="/aulas/$packId" params={{ packId: unit.pack.id }} className="flex min-h-14 items-center gap-3 rounded-[20px] border bg-card px-4 py-3">
          <BookOpen className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="text-caption block text-muted-foreground">{t.aulas.title} · {t.aulas.hojeMin}</span>
            <span className="block truncate font-semibold">{t.aulas.hojeContinue(unit.n, unitTitle(unit.pack))}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      {!loading && mission && (
        <button type="button" onClick={start} disabled={starting} className="flex min-h-14 w-full items-center gap-3 rounded-[20px] border bg-card px-4 py-3 text-left">
          <Play className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="text-caption block text-muted-foreground">{t.today.greeting} · {t.today.day} {mission.day}</span>
            <span className="block truncate font-semibold" lang="en">{mission.title}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )}

      {due > 0 && (
        <Link to="/aulas/revisar" className="flex min-h-14 items-center gap-3 rounded-[20px] border bg-card px-4 py-3">
          <Layers className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1 font-semibold">{t.today.dueCards(due)}</span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
    </AppShell>
  );
}
