import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronRight, Layers, Lock, Play } from "lucide-react";
import { AppShell, EmptyState, ListSkeleton } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { repo } from "@/data/repo";
import { loadCourses, unitNumber, type CourseView } from "@/course/course";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";

const A = t.aulas;

export const Route = createFileRoute("/aulas/")({
  head: () => ({
    meta: [
      { title: "Aulas — Speak Lab" },
      { name: "description", content: "Estude sua apostila unidade por unidade, com aula falada, perguntas, desafio e revisão." },
      { property: "og:title", content: "Aulas — Speak Lab" },
      { property: "og:description", content: "Estude sua apostila unidade por unidade, com aula falada, perguntas, desafio e revisão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AulasHome,
});

function AulasHome() {
  const [courses, setCourses] = useState<CourseView[] | null>(null);
  const [sel, setSel] = useState(0);
  const [due, setDue] = useState(0);

  useEffect(() => {
    void (async () => {
      const [c, cards] = await Promise.all([loadCourses(), repo.listDueCards()]);
      setCourses(c);
      setDue(cards.length);
    })();
  }, []);

  const view = courses?.[sel];
  return (
    <AppShell title={A.title}>
      <Link to="/aulas/revisar" className="flex min-h-14 items-center gap-3 rounded-[20px] border bg-card px-4 py-3">
        <Layers className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1 font-semibold">{due ? A.review(due) : A.reviewNone}</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      {!courses ? (
        <ListSkeleton />
      ) : !view ? (
        <EmptyState action={<Button asChild><Link to="/aplicabilidade">{A.toImport}</Link></Button>}>{A.empty}</EmptyState>
      ) : (
        <>
          {courses.length > 1 && (
            <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={A.switcher}>
              {courses.map((c, i) => (
                <button key={c.course.id} type="button" role="tab" aria-selected={i === sel} onClick={() => setSel(i)}
                  className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold", i === sel ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
                  {c.course.title_pt}
                </button>
              ))}
            </div>
          )}
          <section className="flex flex-col rounded-[20px] bg-ink p-6 text-ink-foreground shadow-card">
            <p className="text-caption font-semibold text-live">
              {A.unitOf(view.current ? unitNumber(view.current.pack, view.units.indexOf(view.current)) : view.units.length, view.units.length)}
            </p>
            <h2 className="text-title mt-3">{view.course.title_pt}</h2>
            {view.course.source_pt && <p className="mt-1 text-base text-ink-foreground/80">{view.course.source_pt}</p>}
            {view.current ? (
              <Button size="lg" className="mt-6 w-full" asChild>
                <Link to="/aulas/$packId" params={{ packId: view.current.pack.id }}><Play /> {A.continue}</Link>
              </Button>
            ) : (
              <p className="mt-6 text-base">{A.allDone}</p>
            )}
          </section>

          <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-0.5 before:bg-border">
            {view.units.map((u, i) => {
              const n = unitNumber(u.pack, i);
              const locked = !u.unlocked && !u.prog.completed;
              return (
                <li key={u.pack.id} className="relative">
                  <div className={cn("flex gap-3 rounded-[20px] border bg-card p-4", locked && "opacity-70")}>
                    <span className={cn("z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      u.prog.completed ? "bg-live text-live-foreground" : locked ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>
                      {u.prog.completed ? <Check className="size-4" /> : locked ? <Lock className="size-3.5" /> : n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption text-muted-foreground">{A.unit(n)}</p>
                      <p className="text-headline">{u.pack.title_pt}</p>
                      {u.pack.lesson_intro?.objetivo_pt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{u.pack.lesson_intro.objetivo_pt}</p>}
                      <p className="text-caption mt-2 font-semibold">
                        {u.prog.completed ? `${A.done} ✓` : locked ? `${A.locked} 🔒` : A.inProgress(u.prog.done_steps.length)}
                      </p>
                      <StepDots done={u.prog.done_steps} />
                      <div className="mt-2">
                        {locked ? (
                          <Link to="/aulas/$packId" params={{ packId: u.pack.id }} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">{A.openAnyway}</Link>
                        ) : (
                          <Button size="sm" variant="secondary" asChild><Link to="/aulas/$packId" params={{ packId: u.pack.id }}>{u.prog.completed ? A.unit(n) : A.continue}</Link></Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </AppShell>
  );
}

export function StepDots({ done }: { done: number[] }) {
  return (
    <div className="mt-2 flex gap-1" aria-label={A.stepsShort(done.length)}>
      {[1, 2, 3, 4, 5].map((s) => <span key={s} className={cn("h-1.5 flex-1 rounded-full", done.includes(s) ? "bg-primary" : "bg-muted")} />)}
    </div>
  );
}
